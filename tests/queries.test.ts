import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb, nowIso, type DB } from '@/lib/db';
import { appendPricePoint, upsertOffer, upsertProduct, upsertStore } from '@/lib/db/upsert';
import { getProduct, listProducts, pickBestOffer, totalGigabytes } from '@/lib/queries';
import { persistOffers } from '@/lib/ingest';
import type { Offer } from '@/lib/types';
import type { RawOffer } from '@/lib/sources/types';

let tmpDir: string;
let db: DB;

function offer(partial: Partial<Offer>): Offer {
  return {
    id: 1,
    productId: 1,
    store: {
      id: 1,
      slug: 's',
      name: 'S',
      homepage: 'https://s.example',
      sourceKey: 's',
      region: 'US',
      seriesSlot: 1,
      isMarketplace: false,
    },
    storeSku: null,
    url: 'https://s.example/p',
    condition: 'new',
    priceCents: 1000,
    listPriceCents: null,
    shippingCents: 0,
    totalCents: 1000,
    currency: 'USD',
    stockStatus: 'in_stock',
    stockQty: null,
    pickupAvailable: null,
    limitPerOrder: null,
    isSample: false,
    lastSeenAt: nowIso(),
    ...partial,
  };
}

function raw(partial: Partial<RawOffer> & Pick<RawOffer, 'storeSlug' | 'title'>): RawOffer {
  return {
    url: 'https://example.com/p',
    priceCents: 10000,
    stockStatus: 'in_stock',
    ...partial,
  };
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ramwatch-test-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
  db = getDb();

  upsertStore({ slug: 'cheap', name: 'Cheap Co', homepage: 'https://cheap.example', sourceKey: 'x', seriesSlot: 1 }, db);
  upsertStore({ slug: 'dear', name: 'Dear Co', homepage: 'https://dear.example', sourceKey: 'x', seriesSlot: 2 }, db);
});

afterAll(() => {
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DATABASE_PATH;
});

describe('totalGigabytes', () => {
  it('multiplies module capacity by kit count', () => {
    expect(
      totalGigabytes({
        id: 1, slug: 'a', category: 'ram', brand: 'b', model: 'm', name: 'n',
        mpn: null, upc: null, imageUrl: null,
        specs: { capacity_gb: 32, kit_count: 2 },
      }),
    ).toBe(64);
  });

  it('assumes a single module when kit count is absent', () => {
    expect(
      totalGigabytes({
        id: 1, slug: 'a', category: 'ssd', brand: 'b', model: 'm', name: 'n',
        mpn: null, upc: null, imageUrl: null,
        specs: { capacity_gb: 2000 },
      }),
    ).toBe(2000);
  });

  it('is null for categories with no capacity', () => {
    expect(
      totalGigabytes({
        id: 1, slug: 'a', category: 'psu', brand: 'b', model: 'm', name: 'n',
        mpn: null, upc: null, imageUrl: null, specs: { wattage: 850 },
      }),
    ).toBeNull();
  });
});

describe('pickBestOffer', () => {
  it('prefers a buyable offer over a cheaper out-of-stock one', () => {
    const best = pickBestOffer([
      offer({ id: 1, priceCents: 900, totalCents: 900, stockStatus: 'out_of_stock' }),
      offer({ id: 2, priceCents: 1000, totalCents: 1000, stockStatus: 'in_stock' }),
    ]);
    expect(best?.id).toBe(2);
  });

  it('compares landed totals, not sticker prices', () => {
    const best = pickBestOffer([
      offer({ id: 1, priceCents: 900, shippingCents: 500, totalCents: 1400 }),
      offer({ id: 2, priceCents: 1000, shippingCents: 0, totalCents: 1000 }),
    ]);
    expect(best?.id).toBe(2);
  });

  it('falls back to the cheapest listing when nothing is buyable', () => {
    const best = pickBestOffer([
      offer({ id: 1, totalCents: 1200, stockStatus: 'out_of_stock' }),
      offer({ id: 2, totalCents: 1100, stockStatus: 'out_of_stock' }),
    ]);
    expect(best?.id).toBe(2);
  });

  it('ignores unpriced offers entirely', () => {
    expect(pickBestOffer([offer({ priceCents: null, totalCents: null })])).toBeNull();
    expect(pickBestOffer([])).toBeNull();
  });
});

describe('listProducts', () => {
  beforeAll(() => {
    const cheapId = (db.prepare('SELECT id FROM stores WHERE slug = ?').get('cheap') as { id: number }).id;
    const dearId = (db.prepare('SELECT id FROM stores WHERE slug = ?').get('dear') as { id: number }).id;

    const kit = upsertProduct(
      {
        slug: 'test-ddr5-64', category: 'ram', brand: 'Corsair', model: 'Vengeance RGB',
        name: 'Corsair Vengeance RGB 64GB (2x32GB) DDR5-6000 CL30',
        mpn: 'TEST6000C30-64', specs: { ddr_gen: 'DDR5', capacity_gb: 32, kit_count: 2, speed_mts: 6000 },
      },
      db,
    );
    const ddr4 = upsertProduct(
      {
        slug: 'test-ddr4-32', category: 'ram', brand: 'Corsair', model: 'Vengeance LPX',
        name: 'Corsair Vengeance LPX 32GB (2x16GB) DDR4-3600 CL18',
        mpn: 'TEST3600C18-32', specs: { ddr_gen: 'DDR4', capacity_gb: 16, kit_count: 2, speed_mts: 3600 },
      },
      db,
    );

    // Cheapest DDR5 offer is out of stock; the buyable one costs more.
    upsertOffer(kit, cheapId, raw({ storeSlug: 'cheap', title: 'x', priceCents: 20000, stockStatus: 'out_of_stock' }), nowIso(), db);
    upsertOffer(kit, dearId, raw({ storeSlug: 'dear', title: 'x', priceCents: 24000, shippingCents: 1000 }), nowIso(), db);
    upsertOffer(ddr4, cheapId, raw({ storeSlug: 'cheap', title: 'x', priceCents: 12000 }), nowIso(), db);
  });

  it('reports the buyable price as bestCents and the absolute minimum as lowestCents', () => {
    const product = getProduct('test-ddr5-64', db)!;
    expect(product.bestCents).toBe(25000); // 240.00 + 10.00 shipping
    expect(product.lowestCents).toBe(20000);
    expect(product.bestOffer?.store.slug).toBe('dear');
    expect(product.inStockCount).toBe(1);
  });

  it('computes $/GB from the buyable landed price over total kit capacity', () => {
    const product = getProduct('test-ddr5-64', db)!;
    expect(product.centsPerGb).toBeCloseTo(25000 / 64);
  });

  it('filters on JSON spec values', () => {
    expect(listProducts({ category: 'ram', specs: { ddr_gen: ['DDR5'] } }, db).total).toBe(1);
    expect(listProducts({ category: 'ram', specs: { ddr_gen: ['DDR4', 'DDR5'] } }, db).total).toBe(2);
    expect(listProducts({ category: 'ram', specs: { ddr_gen: ['DDR3'] } }, db).total).toBe(0);
  });

  it('honours the in-stock filter', () => {
    expect(listProducts({ category: 'ram', inStockOnly: true }, db).total).toBe(2);
    expect(listProducts({ category: 'gpu', inStockOnly: true }, db).total).toBe(0);
  });

  it('caps on the buyable price, not the out-of-stock one', () => {
    // The DDR5 kit lists at $200 out of stock but costs $250 to actually buy.
    expect(listProducts({ category: 'ram', maxPriceCents: 21000 }, db).total).toBe(1);
    expect(listProducts({ category: 'ram', maxPriceCents: 26000 }, db).total).toBe(2);
  });

  it('searches brand, model and MPN', () => {
    expect(listProducts({ q: 'vengeance' }, db).total).toBe(2);
    expect(listProducts({ q: 'TEST6000' }, db).total).toBe(1);
    expect(listProducts({ q: 'nonexistent' }, db).total).toBe(0);
  });
});

describe('upsertOffer history', () => {
  it('appends a price point only when the reading changes', () => {
    const storeId = (db.prepare('SELECT id FROM stores WHERE slug = ?').get('cheap') as { id: number }).id;
    const productId = upsertProduct(
      { slug: 'history-test', category: 'psu', brand: 'B', model: 'M', name: 'B M 850W', specs: { wattage: 850 } },
      db,
    );

    const countPoints = (offerId: number) =>
      (db.prepare('SELECT COUNT(*) AS n FROM price_points WHERE offer_id = ?').get(offerId) as { n: number }).n;

    const first = upsertOffer(productId, storeId, raw({ storeSlug: 'cheap', title: 'x', priceCents: 10000 }), nowIso(), db);
    expect(first.changed).toBe(true);
    expect(countPoints(first.offerId)).toBe(1);

    // Same price and stock — bumps last_seen_at but must not add history.
    const second = upsertOffer(productId, storeId, raw({ storeSlug: 'cheap', title: 'x', priceCents: 10000 }), nowIso(), db);
    expect(second.changed).toBe(false);
    expect(countPoints(second.offerId)).toBe(1);

    const third = upsertOffer(productId, storeId, raw({ storeSlug: 'cheap', title: 'x', priceCents: 11000 }), nowIso(), db);
    expect(third.changed).toBe(true);
    expect(countPoints(third.offerId)).toBe(2);

    // A stock change with an unchanged price is still a change worth recording.
    const fourth = upsertOffer(
      productId, storeId,
      raw({ storeSlug: 'cheap', title: 'x', priceCents: 11000, stockStatus: 'out_of_stock' }),
      nowIso(), db,
    );
    expect(fourth.changed).toBe(true);
    expect(countPoints(fourth.offerId)).toBe(3);
  });
});

describe('change7d', () => {
  it('measures against the cheapest reading a week ago', () => {
    const storeId = (db.prepare('SELECT id FROM stores WHERE slug = ?').get('cheap') as { id: number }).id;
    const productId = upsertProduct(
      { slug: 'delta-test', category: 'cpu', brand: 'B', model: 'M2', name: 'B M2', specs: {} },
      db,
    );
    const { offerId } = upsertOffer(
      productId, storeId, raw({ storeSlug: 'cheap', title: 'x', priceCents: 11000 }), nowIso(), db,
    );

    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    appendPricePoint(offerId, 10000, 'in_stock', tenDaysAgo, db);

    const product = getProduct('delta-test', db)!;
    expect(product.change7d).toBeCloseTo(10, 1); // 100.00 → 110.00
  });
});

describe('persistOffers', () => {
  it('records offers whose store is not registered as unmatched instead of dropping them', () => {
    const before = (db.prepare('SELECT COUNT(*) AS n FROM unmatched_offers').get() as { n: number }).n;
    const result = persistOffers(
      'test',
      [raw({ storeSlug: 'does-not-exist', title: 'Corsair Vengeance RGB 64GB', mpn: 'TEST6000C30-64' })],
      db,
    );
    expect(result.upserted).toBe(0);
    expect(result.unmatched).toBe(1);
    const after = (db.prepare('SELECT COUNT(*) AS n FROM unmatched_offers').get() as { n: number }).n;
    expect(after).toBe(before + 1);
  });

  it('matches a live listing to the catalogue by MPN', () => {
    const result = persistOffers(
      'test',
      [
        raw({
          storeSlug: 'cheap',
          title: 'CORSAIR Vengeance RGB 64GB (2 x 32GB) DDR5 6000 Desktop Memory',
          mpn: 'TEST6000C30-64',
          priceCents: 19500,
        }),
      ],
      db,
    );
    expect(result.upserted).toBe(1);
    expect(result.unmatched).toBe(0);
  });
});
