import { getDb, nowIso, type DB } from './index';
import type { RawOffer } from '../sources/types';

export interface StoreInput {
  slug: string;
  name: string;
  homepage: string;
  sourceKey: string;
  seriesSlot?: number;
  region?: string;
  isMarketplace?: boolean;
}

export function upsertStore(input: StoreInput, db: DB = getDb()): number {
  db.prepare(
    `INSERT INTO stores (slug, name, homepage, source_key, region, series_slot, is_marketplace)
     VALUES (@slug, @name, @homepage, @sourceKey, @region, @seriesSlot, @isMarketplace)
     ON CONFLICT (slug) DO UPDATE SET
       name = excluded.name,
       homepage = excluded.homepage,
       source_key = excluded.source_key,
       region = excluded.region,
       series_slot = excluded.series_slot,
       is_marketplace = excluded.is_marketplace`,
  ).run({
    slug: input.slug,
    name: input.name,
    homepage: input.homepage,
    sourceKey: input.sourceKey,
    region: input.region ?? 'US',
    seriesSlot: input.seriesSlot ?? 1,
    isMarketplace: input.isMarketplace ? 1 : 0,
  });

  const row = db.prepare('SELECT id FROM stores WHERE slug = ?').get(input.slug) as { id: number };
  return row.id;
}

export interface ProductInput {
  slug: string;
  category: string;
  brand: string;
  model: string;
  name: string;
  mpn?: string | null;
  upc?: string | null;
  specs?: Record<string, unknown>;
  imageUrl?: string | null;
}

export function upsertProduct(input: ProductInput, db: DB = getDb()): number {
  db.prepare(
    `INSERT INTO products (slug, category, brand, model, name, mpn, upc, specs, image_url)
     VALUES (@slug, @category, @brand, @model, @name, @mpn, @upc, @specs, @imageUrl)
     ON CONFLICT (slug) DO UPDATE SET
       category = excluded.category,
       brand = excluded.brand,
       model = excluded.model,
       name = excluded.name,
       mpn = COALESCE(excluded.mpn, products.mpn),
       upc = COALESCE(excluded.upc, products.upc),
       specs = excluded.specs,
       image_url = COALESCE(excluded.image_url, products.image_url)`,
  ).run({
    slug: input.slug,
    category: input.category,
    brand: input.brand,
    model: input.model,
    name: input.name,
    mpn: input.mpn ?? null,
    upc: input.upc ?? null,
    specs: JSON.stringify(input.specs ?? {}),
    imageUrl: input.imageUrl ?? null,
  });

  const row = db.prepare('SELECT id FROM products WHERE slug = ?').get(input.slug) as { id: number };
  return row.id;
}

export interface OfferUpsertResult {
  offerId: number;
  /** True when the price or stock state differs from the last stored reading. */
  changed: boolean;
}

/**
 * Writes an offer and, when the reading actually moved, appends a price point.
 * Unchanged readings only bump `last_seen_at` — otherwise every refresh would
 * bloat the history with identical rows and flatten the charts.
 */
export function upsertOffer(
  productId: number,
  storeId: number,
  raw: RawOffer,
  observedAt: string = nowIso(),
  db: DB = getDb(),
): OfferUpsertResult {
  const condition = raw.condition ?? 'new';

  const existing = db
    .prepare(
      'SELECT id, price_cents, stock_status FROM offers WHERE product_id = ? AND store_id = ? AND condition = ?',
    )
    .get(productId, storeId, condition) as
    | { id: number; price_cents: number | null; stock_status: string }
    | undefined;

  const params = {
    productId,
    storeId,
    storeSku: raw.storeSku ?? null,
    url: raw.url,
    condition,
    priceCents: raw.priceCents,
    listPriceCents: raw.listPriceCents ?? null,
    shippingCents: raw.shippingCents ?? 0,
    currency: raw.currency ?? 'USD',
    stockStatus: raw.stockStatus,
    stockQty: raw.stockQty ?? null,
    pickupAvailable: raw.pickupAvailable == null ? null : raw.pickupAvailable ? 1 : 0,
    limitPerOrder: raw.limitPerOrder ?? null,
    isSample: raw.isSample ? 1 : 0,
    observedAt,
  };

  let offerId: number;
  if (existing) {
    db.prepare(
      `UPDATE offers SET
         store_sku = @storeSku, url = @url, price_cents = @priceCents,
         list_price_cents = @listPriceCents, shipping_cents = @shippingCents,
         currency = @currency, stock_status = @stockStatus, stock_qty = @stockQty,
         pickup_available = @pickupAvailable, limit_per_order = @limitPerOrder,
         is_sample = @isSample, last_seen_at = @observedAt
       WHERE id = @id`,
    ).run({ ...params, id: existing.id });
    offerId = existing.id;
  } else {
    const info = db
      .prepare(
        `INSERT INTO offers (product_id, store_id, store_sku, url, condition, price_cents,
                             list_price_cents, shipping_cents, currency, stock_status, stock_qty,
                             pickup_available, limit_per_order, is_sample, first_seen_at, last_seen_at)
         VALUES (@productId, @storeId, @storeSku, @url, @condition, @priceCents,
                 @listPriceCents, @shippingCents, @currency, @stockStatus, @stockQty,
                 @pickupAvailable, @limitPerOrder, @isSample, @observedAt, @observedAt)`,
      )
      .run(params);
    offerId = Number(info.lastInsertRowid);
  }

  const changed =
    !existing ||
    existing.price_cents !== raw.priceCents ||
    existing.stock_status !== raw.stockStatus;

  if (changed) {
    appendPricePoint(offerId, raw.priceCents, raw.stockStatus, observedAt, db);
  }

  return { offerId, changed };
}

export function appendPricePoint(
  offerId: number,
  priceCents: number | null,
  stockStatus: string,
  observedAt: string,
  db: DB = getDb(),
): void {
  db.prepare(
    `INSERT INTO price_points (offer_id, price_cents, stock_status, observed_at)
     VALUES (?, ?, ?, ?)`,
  ).run(offerId, priceCents, stockStatus, observedAt);
}

export function upsertMarketPoint(
  point: { seriesKey: string; label: string; observedOn: string; value: number; unit: string; source: string },
  db: DB = getDb(),
): void {
  db.prepare(
    `INSERT INTO market_series (series_key, label, observed_on, value, unit, source)
     VALUES (@seriesKey, @label, @observedOn, @value, @unit, @source)
     ON CONFLICT (series_key, observed_on) DO UPDATE SET
       value = excluded.value, label = excluded.label, unit = excluded.unit, source = excluded.source`,
  ).run(point);
}

export function recordUnmatched(
  sourceKey: string,
  raw: RawOffer,
  db: DB = getDb(),
): void {
  db.prepare(
    `INSERT INTO unmatched_offers (source_key, title, mpn, url, price_cents)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(sourceKey, raw.title, raw.mpn ?? null, raw.url, raw.priceCents);
}
