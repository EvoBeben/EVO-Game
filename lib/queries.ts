import { getDb, type DB } from './db';
import {
  PER_GB_CATEGORIES,
  STOCK_RANK,
  isBuyable,
  type Category,
  type Condition,
  type MarketPoint,
  type Offer,
  type PricePoint,
  type Product,
  type ProductDetail,
  type ProductSpecs,
  type ProductSummary,
  type SourceRun,
  type StockStatus,
  type Store,
} from './types';

// ---------------------------------------------------------------------------
// Row shapes as they come back from SQLite
// ---------------------------------------------------------------------------

interface ProductRow {
  id: number;
  slug: string;
  category: string;
  brand: string;
  model: string;
  name: string;
  mpn: string | null;
  upc: string | null;
  specs: string;
  image_url: string | null;
}

interface OfferRow {
  id: number;
  product_id: number;
  store_sku: string | null;
  url: string;
  condition: string;
  price_cents: number | null;
  list_price_cents: number | null;
  shipping_cents: number;
  currency: string;
  stock_status: string;
  stock_qty: number | null;
  pickup_available: number | null;
  limit_per_order: number | null;
  is_sample: number;
  last_seen_at: string;
  store_id: number;
  store_slug: string;
  store_name: string;
  store_homepage: string;
  store_source_key: string;
  store_region: string;
  store_series_slot: number;
  store_is_marketplace: number;
}

function toStore(row: OfferRow): Store {
  return {
    id: row.store_id,
    slug: row.store_slug,
    name: row.store_name,
    homepage: row.store_homepage,
    sourceKey: row.store_source_key,
    region: row.store_region,
    seriesSlot: row.store_series_slot,
    isMarketplace: row.store_is_marketplace === 1,
  };
}

function toOffer(row: OfferRow): Offer {
  const price = row.price_cents;
  return {
    id: row.id,
    productId: row.product_id,
    store: toStore(row),
    storeSku: row.store_sku,
    url: row.url,
    condition: row.condition as Condition,
    priceCents: price,
    listPriceCents: row.list_price_cents,
    shippingCents: row.shipping_cents,
    totalCents: price == null ? null : price + row.shipping_cents,
    currency: row.currency,
    stockStatus: row.stock_status as StockStatus,
    stockQty: row.stock_qty,
    pickupAvailable: row.pickup_available == null ? null : row.pickup_available === 1,
    limitPerOrder: row.limit_per_order,
    isSample: row.is_sample === 1,
    lastSeenAt: row.last_seen_at,
  };
}

function toProduct(row: ProductRow): Product {
  let specs: ProductSpecs = {};
  try {
    specs = JSON.parse(row.specs) as ProductSpecs;
  } catch {
    specs = {};
  }
  return {
    id: row.id,
    slug: row.slug,
    category: row.category as Category,
    brand: row.brand,
    model: row.model,
    name: row.name,
    mpn: row.mpn,
    upc: row.upc,
    specs,
    imageUrl: row.image_url,
  };
}

const OFFER_SELECT = `
  SELECT o.id, o.product_id, o.store_sku, o.url, o.condition, o.price_cents,
         o.list_price_cents, o.shipping_cents, o.currency, o.stock_status,
         o.stock_qty, o.pickup_available, o.limit_per_order, o.is_sample,
         o.last_seen_at,
         s.id AS store_id, s.slug AS store_slug, s.name AS store_name,
         s.homepage AS store_homepage, s.source_key AS store_source_key,
         s.region AS store_region, s.series_slot AS store_series_slot,
         s.is_marketplace AS store_is_marketplace
  FROM offers o
  JOIN stores s ON s.id = o.store_id
`;

// ---------------------------------------------------------------------------
// Derived metrics
// ---------------------------------------------------------------------------

/**
 * Total gigabytes a product represents — a 2x32GB RAM kit is 64GB, a 2TB SSD is
 * 2000GB. Returns null when the category has no meaningful capacity.
 */
export function totalGigabytes(product: Product): number | null {
  if (!PER_GB_CATEGORIES.has(product.category)) return null;
  const capacity = product.specs.capacity_gb;
  if (typeof capacity !== 'number' || capacity <= 0) return null;
  const kit = typeof product.specs.kit_count === 'number' ? product.specs.kit_count : 1;
  return capacity * Math.max(1, kit);
}

/**
 * Picks the offer a buyer would actually want: cheapest landed price among
 * offers you can buy today, falling back to cheapest overall when nothing is
 * in stock (so the page still shows a reference price).
 */
export function pickBestOffer(offers: Offer[]): Offer | null {
  const priced = offers.filter((o) => o.totalCents != null);
  if (priced.length === 0) return null;

  const sorted = [...priced].sort((a, b) => {
    const stockDelta = STOCK_RANK[a.stockStatus] - STOCK_RANK[b.stockStatus];
    const aBuyable = isBuyable(a.stockStatus);
    const bBuyable = isBuyable(b.stockStatus);
    if (aBuyable !== bBuyable) return aBuyable ? -1 : 1;
    if (a.totalCents !== b.totalCents) return a.totalCents! - b.totalCents!;
    return stockDelta;
  });
  return sorted[0];
}

function summarize(
  product: Product,
  offers: Offer[],
  baselineCents: number | null,
): ProductSummary {
  const best = pickBestOffer(offers);
  const totals = offers.map((o) => o.totalCents).filter((c): c is number => c != null);
  const gb = totalGigabytes(product);

  let change7d: number | null = null;
  if (baselineCents != null && baselineCents > 0 && best?.totalCents != null) {
    change7d = ((best.totalCents - baselineCents) / baselineCents) * 100;
  }

  return {
    ...product,
    bestOffer: best,
    offerCount: offers.length,
    inStockCount: offers.filter((o) => isBuyable(o.stockStatus)).length,
    bestCents: best?.totalCents ?? null,
    lowestCents: totals.length ? Math.min(...totals) : null,
    highestCents: totals.length ? Math.max(...totals) : null,
    centsPerGb: gb && best?.totalCents != null ? best.totalCents / gb : null,
    change7d,
  };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function loadOffersByProduct(db: DB, productIds: number[]): Map<number, Offer[]> {
  const byProduct = new Map<number, Offer[]>();
  if (productIds.length === 0) return byProduct;

  const placeholders = productIds.map(() => '?').join(',');
  const rows = db
    .prepare(`${OFFER_SELECT} WHERE o.product_id IN (${placeholders})`)
    .all(...productIds) as OfferRow[];

  for (const row of rows) {
    const offer = toOffer(row);
    const list = byProduct.get(offer.productId);
    if (list) list.push(offer);
    else byProduct.set(offer.productId, [offer]);
  }
  return byProduct;
}

/**
 * Cheapest landed price per product as of `daysAgo`, used for the change
 * column. Reads the last observation at or before the cutoff for each offer.
 */
function loadBaselines(db: DB, productIds: number[], daysAgo: number): Map<number, number> {
  const baselines = new Map<number, number>();
  if (productIds.length === 0) return baselines;

  const cutoff = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  const placeholders = productIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT o.product_id AS product_id,
              MIN(pp.price_cents + o.shipping_cents) AS baseline
       FROM offers o
       JOIN price_points pp ON pp.id = (
         SELECT id FROM price_points
         WHERE offer_id = o.id AND observed_at <= ? AND price_cents IS NOT NULL
         ORDER BY observed_at DESC
         LIMIT 1
       )
       WHERE o.product_id IN (${placeholders})
       GROUP BY o.product_id`,
    )
    .all(cutoff, ...productIds) as { product_id: number; baseline: number | null }[];

  for (const row of rows) {
    if (row.baseline != null) baselines.set(row.product_id, row.baseline);
  }
  return baselines;
}

function hydrate(db: DB, productRows: ProductRow[]): ProductSummary[] {
  const products = productRows.map(toProduct);
  const ids = products.map((p) => p.id);
  const offers = loadOffersByProduct(db, ids);
  const baselines = loadBaselines(db, ids, 7);
  return products.map((p) => summarize(p, offers.get(p.id) ?? [], baselines.get(p.id) ?? null));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type SortKey = 'price' | 'per_gb' | 'drop' | 'rise' | 'name' | 'stock';

export interface ListOptions {
  category?: string;
  /** Free-text match against brand/model/name. */
  q?: string;
  /** Exact-match filters against `products.specs`, e.g. `{ ddr_gen: ['DDR5'] }`. */
  specs?: Record<string, (string | number)[]>;
  inStockOnly?: boolean;
  maxPriceCents?: number;
  sort?: SortKey;
  limit?: number;
  offset?: number;
}

export interface ListResult {
  items: ProductSummary[];
  total: number;
}

export function listProducts(options: ListOptions = {}, db: DB = getDb()): ListResult {
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (options.category) {
    where.push('category = ?');
    params.push(options.category);
  }
  if (options.q?.trim()) {
    // Single quotes: SQLite reads a double-quoted empty string as an identifier.
    where.push("(LOWER(name) LIKE ? OR LOWER(brand) LIKE ? OR LOWER(model) LIKE ? OR LOWER(COALESCE(mpn, '')) LIKE ?)");
    const needle = `%${options.q.trim().toLowerCase()}%`;
    params.push(needle, needle, needle, needle);
  }

  const sql = `SELECT * FROM products ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
  const rows = db.prepare(sql).all(...params) as ProductRow[];

  // Spec filters and derived metrics are applied in JS: the values live inside
  // a JSON column, and the catalogue is small enough that filtering here is
  // clearer than building dynamic json_extract predicates.
  let items = hydrate(db, rows);

  if (options.specs) {
    for (const [key, allowed] of Object.entries(options.specs)) {
      if (!allowed.length) continue;
      const wanted = new Set(allowed.map(String));
      items = items.filter((p) => {
        const value = p.specs[key];
        return value != null && wanted.has(String(value));
      });
    }
  }

  if (options.inStockOnly) {
    items = items.filter((p) => p.inStockCount > 0);
  }
  if (options.maxPriceCents != null) {
    items = items.filter((p) => p.bestCents != null && p.bestCents <= options.maxPriceCents!);
  }

  items.sort(comparator(options.sort ?? 'price'));

  const total = items.length;
  const offset = options.offset ?? 0;
  const limit = options.limit ?? total;
  return { items: items.slice(offset, offset + limit), total };
}

function comparator(sort: SortKey): (a: ProductSummary, b: ProductSummary) => number {
  const nullsLast = (value: number | null) => (value == null ? Number.POSITIVE_INFINITY : value);

  switch (sort) {
    case 'per_gb':
      return (a, b) => nullsLast(a.centsPerGb) - nullsLast(b.centsPerGb);
    case 'drop':
      return (a, b) => nullsLast(a.change7d) - nullsLast(b.change7d);
    case 'rise':
      return (a, b) => (b.change7d ?? Number.NEGATIVE_INFINITY) - (a.change7d ?? Number.NEGATIVE_INFINITY);
    case 'name':
      return (a, b) => a.name.localeCompare(b.name);
    case 'stock':
      return (a, b) => b.inStockCount - a.inStockCount || nullsLast(a.bestCents) - nullsLast(b.bestCents);
    case 'price':
    default:
      // Sort on the buyable price, matching the figure the row displays.
      return (a, b) => nullsLast(a.bestCents) - nullsLast(b.bestCents);
  }
}

export function getProduct(slug: string, db: DB = getDb()): ProductDetail | null {
  const row = db.prepare('SELECT * FROM products WHERE slug = ?').get(slug) as ProductRow | undefined;
  if (!row) return null;

  const product = toProduct(row);
  const offers = loadOffersByProduct(db, [product.id]).get(product.id) ?? [];
  const baseline = loadBaselines(db, [product.id], 7).get(product.id) ?? null;

  const sorted = [...offers].sort((a, b) => {
    const aBuyable = isBuyable(a.stockStatus);
    const bBuyable = isBuyable(b.stockStatus);
    if (aBuyable !== bBuyable) return aBuyable ? -1 : 1;
    if (a.totalCents == null) return 1;
    if (b.totalCents == null) return -1;
    return a.totalCents - b.totalCents;
  });

  return { ...summarize(product, offers, baseline), offers: sorted };
}

export function getPriceHistory(productId: number, days = 90, db: DB = getDb()): PricePoint[] {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = db
    .prepare(
      `SELECT s.slug AS store_slug, s.name AS store_name, s.series_slot AS series_slot,
              pp.observed_at, pp.price_cents, pp.stock_status
       FROM price_points pp
       JOIN offers o ON o.id = pp.offer_id
       JOIN stores s ON s.id = o.store_id
       WHERE o.product_id = ? AND pp.observed_at >= ?
       ORDER BY pp.observed_at ASC`,
    )
    .all(productId, since) as {
    store_slug: string;
    store_name: string;
    series_slot: number;
    observed_at: string;
    price_cents: number | null;
    stock_status: string;
  }[];

  return rows.map((r) => ({
    storeSlug: r.store_slug,
    storeName: r.store_name,
    seriesSlot: r.series_slot,
    observedAt: r.observed_at,
    priceCents: r.price_cents,
    stockStatus: r.stock_status as StockStatus,
  }));
}

export function getMarketSeries(seriesKey?: string, days = 180, db: DB = getDb()): MarketPoint[] {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const rows = seriesKey
    ? (db
        .prepare(
          'SELECT * FROM market_series WHERE series_key = ? AND observed_on >= ? ORDER BY observed_on ASC',
        )
        .all(seriesKey, since) as Record<string, unknown>[])
    : (db
        .prepare('SELECT * FROM market_series WHERE observed_on >= ? ORDER BY observed_on ASC')
        .all(since) as Record<string, unknown>[]);

  return rows.map((r) => ({
    seriesKey: r.series_key as string,
    label: r.label as string,
    observedOn: r.observed_on as string,
    value: r.value as number,
    unit: r.unit as string,
    source: r.source as string,
  }));
}

export function listStores(db: DB = getDb()): Store[] {
  const rows = db.prepare('SELECT * FROM stores ORDER BY name').all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as number,
    slug: r.slug as string,
    name: r.name as string,
    homepage: r.homepage as string,
    sourceKey: r.source_key as string,
    region: r.region as string,
    seriesSlot: r.series_slot as number,
    isMarketplace: r.is_marketplace === 1,
  }));
}

export function latestRunsBySource(db: DB = getDb()): Map<string, SourceRun> {
  const rows = db
    .prepare(
      `SELECT r.* FROM source_runs r
       JOIN (SELECT source_key, MAX(started_at) AS started_at FROM source_runs GROUP BY source_key) latest
         ON latest.source_key = r.source_key AND latest.started_at = r.started_at`,
    )
    .all() as Record<string, unknown>[];

  const map = new Map<string, SourceRun>();
  for (const r of rows) {
    map.set(r.source_key as string, {
      sourceKey: r.source_key as string,
      startedAt: r.started_at as string,
      finishedAt: (r.finished_at as string) ?? null,
      status: r.status as SourceRun['status'],
      detail: (r.detail as string) ?? null,
      offersSeen: r.offers_seen as number,
      offersUpserted: r.offers_upserted as number,
      unmatched: r.unmatched as number,
    });
  }
  return map;
}

/** True when any offer on the site is seeded demo data rather than a live reading. */
export function hasSampleData(db: DB = getDb()): boolean {
  const row = db.prepare('SELECT COUNT(*) AS n FROM offers WHERE is_sample = 1').get() as { n: number };
  return row.n > 0;
}

export interface DashboardStats {
  productCount: number;
  offerCount: number;
  storeCount: number;
  inStockOffers: number;
  lastUpdatedAt: string | null;
  sampleOnly: boolean;
}

export function dashboardStats(db: DB = getDb()): DashboardStats {
  const row = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM products) AS products,
              (SELECT COUNT(*) FROM offers) AS offers,
              (SELECT COUNT(*) FROM stores) AS stores,
              (SELECT COUNT(*) FROM offers WHERE stock_status IN ('in_stock','limited')) AS in_stock,
              (SELECT MAX(last_seen_at) FROM offers) AS last_seen,
              (SELECT COUNT(*) FROM offers WHERE is_sample = 0) AS live`,
    )
    .get() as Record<string, number | string | null>;

  return {
    productCount: (row.products as number) ?? 0,
    offerCount: (row.offers as number) ?? 0,
    storeCount: (row.stores as number) ?? 0,
    inStockOffers: (row.in_stock as number) ?? 0,
    lastUpdatedAt: (row.last_seen as string) ?? null,
    sampleOnly: ((row.live as number) ?? 0) === 0 && ((row.offers as number) ?? 0) > 0,
  };
}

/** Products whose best landed price moved most over the window, in one direction. */
export function movers(
  direction: 'up' | 'down',
  limit = 6,
  db: DB = getDb(),
): ProductSummary[] {
  const { items } = listProducts({ sort: direction === 'up' ? 'rise' : 'drop' }, db);
  return items
    .filter((p) => p.change7d != null && (direction === 'up' ? p.change7d > 0.5 : p.change7d < -0.5))
    .slice(0, limit);
}

/** Offers that flipped from unavailable to buyable at their most recent reading. */
export function backInStock(limit = 8, db: DB = getDb()): { product: ProductSummary; offer: Offer }[] {
  const rows = db
    .prepare(
      `SELECT o.product_id AS product_id, o.id AS offer_id
       FROM offers o
       WHERE o.stock_status IN ('in_stock','limited')
         AND EXISTS (
           SELECT 1 FROM price_points pp
           WHERE pp.offer_id = o.id
             AND pp.stock_status NOT IN ('in_stock','limited')
             AND pp.observed_at = (
               SELECT MAX(observed_at) FROM price_points
               WHERE offer_id = o.id
                 AND observed_at < (SELECT MAX(observed_at) FROM price_points WHERE offer_id = o.id)
             )
         )
       ORDER BY o.last_seen_at DESC
       LIMIT ?`,
    )
    .all(limit) as { product_id: number; offer_id: number }[];

  if (rows.length === 0) return [];

  const productIds = [...new Set(rows.map((r) => r.product_id))];
  const placeholders = productIds.map(() => '?').join(',');
  const productRows = db
    .prepare(`SELECT * FROM products WHERE id IN (${placeholders})`)
    .all(...productIds) as ProductRow[];
  const summaries = new Map(hydrate(db, productRows).map((p) => [p.id, p]));
  const offersByProduct = loadOffersByProduct(db, productIds);

  const out: { product: ProductSummary; offer: Offer }[] = [];
  for (const row of rows) {
    const product = summaries.get(row.product_id);
    const offer = offersByProduct.get(row.product_id)?.find((o) => o.id === row.offer_id);
    if (product && offer) out.push({ product, offer });
  }
  return out;
}

export interface Facet {
  key: string;
  label: string;
  values: { value: string; count: number }[];
}

const FACET_LABELS: Record<string, string> = {
  ddr_gen: 'DDR generation',
  capacity_gb: 'Module capacity',
  kit_count: 'Modules per kit',
  speed_mts: 'Speed (MT/s)',
  cas: 'CAS latency',
  chipset: 'Chipset',
  vram_gb: 'VRAM (GB)',
  cores: 'Cores',
  socket: 'Socket',
  interface: 'Interface',
  wattage: 'Wattage',
  efficiency: 'Efficiency',
  brand: 'Brand',
};

const FACET_KEYS: Record<string, string[]> = {
  ram: ['ddr_gen', 'capacity_gb', 'kit_count', 'speed_mts', 'cas'],
  gpu: ['chipset', 'vram_gb'],
  cpu: ['socket', 'cores'],
  ssd: ['capacity_gb', 'interface'],
  motherboard: ['socket', 'form_factor'],
  psu: ['wattage', 'efficiency'],
};

/** Builds the filter sidebar for a category from the specs actually present. */
export function facetsForCategory(category: string, db: DB = getDb()): Facet[] {
  const rows = db.prepare('SELECT * FROM products WHERE category = ?').all(category) as ProductRow[];
  const products = rows.map(toProduct);
  const keys = FACET_KEYS[category] ?? [];

  const facets: Facet[] = [];
  for (const key of keys) {
    const counts = new Map<string, number>();
    for (const product of products) {
      const value = product.specs[key];
      if (value == null) continue;
      const str = String(value);
      counts.set(str, (counts.get(str) ?? 0) + 1);
    }
    if (counts.size === 0) continue;
    facets.push({
      key,
      label: FACET_LABELS[key] ?? key,
      values: [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => {
          const an = Number(a.value);
          const bn = Number(b.value);
          if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
          return a.value.localeCompare(b.value);
        }),
    });
  }

  const brandCounts = new Map<string, number>();
  for (const product of products) {
    brandCounts.set(product.brand, (brandCounts.get(product.brand) ?? 0) + 1);
  }
  if (brandCounts.size > 1) {
    facets.unshift({
      key: 'brand',
      label: 'Brand',
      values: [...brandCounts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value)),
    });
  }

  return facets;
}

export function categoryCounts(db: DB = getDb()): Record<string, number> {
  const rows = db
    .prepare('SELECT category, COUNT(*) AS n FROM products GROUP BY category')
    .all() as { category: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.category, r.n]));
}
