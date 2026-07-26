/**
 * Loads data/seed/catalog.json into SQLite: stores, canonical products, sample
 * offers, their price history, and the DRAM index series.
 *
 * Safe to re-run — everything upserts.
 */

import { closeDb, getDb, nowIso } from '../lib/db';
import { appendPricePoint, upsertMarketPoint, upsertOffer, upsertProduct, upsertStore } from '../lib/db/upsert';
import { loadSeedBundle } from '../lib/sources/fixtures';

function main(): void {
  const bundle = loadSeedBundle();
  if (!bundle) {
    console.error('No seed bundle found. Run `npm run gen-seed` first.');
    process.exit(1);
  }

  const db = getDb();
  const observedAt = nowIso();

  const load = db.transaction(() => {
    const storeIds = new Map<string, number>();
    for (const store of bundle.stores) {
      storeIds.set(store.slug, upsertStore(store, db));
    }

    let offerCount = 0;
    let pointCount = 0;

    for (const product of bundle.products) {
      const productId = upsertProduct(
        {
          slug: product.slug,
          category: product.category,
          brand: product.brand,
          model: product.model,
          name: product.name,
          mpn: product.mpn,
          upc: product.upc,
          specs: product.specs,
        },
        db,
      );

      for (const offer of product.offers) {
        const storeId = storeIds.get(offer.storeSlug);
        if (storeId == null) continue;

        const { offerId } = upsertOffer(
          productId,
          storeId,
          {
            storeSlug: offer.storeSlug,
            title: product.name,
            url: offer.url,
            storeSku: offer.storeSku ?? null,
            mpn: product.mpn,
            upc: product.upc,
            brand: product.brand,
            condition: offer.condition ?? 'new',
            priceCents: offer.priceCents,
            listPriceCents: offer.listPriceCents ?? null,
            shippingCents: offer.shippingCents ?? 0,
            currency: 'USD',
            stockStatus: offer.stockStatus,
            stockQty: offer.stockQty ?? null,
            pickupAvailable: offer.pickupAvailable ?? null,
            limitPerOrder: offer.limitPerOrder ?? null,
            isSample: true,
          },
          observedAt,
          db,
        );
        offerCount += 1;

        // Replace history wholesale so re-seeding doesn't stack duplicates.
        db.prepare('DELETE FROM price_points WHERE offer_id = ?').run(offerId);
        for (const point of product.history?.[offer.storeSlug] ?? []) {
          appendPricePoint(offerId, point.priceCents, point.stockStatus, point.observedAt, db);
          pointCount += 1;
        }
      }
    }

    for (const point of bundle.marketSeries) {
      upsertMarketPoint(point, db);
    }

    return { offerCount, pointCount };
  });

  const { offerCount, pointCount } = load();

  db.prepare(
    `INSERT INTO source_runs (source_key, started_at, finished_at, status, detail,
                              offers_seen, offers_upserted, unmatched)
     VALUES ('fixtures', ?, ?, 'ok', 'Seeded from data/seed/catalog.json', ?, ?, 0)`,
  ).run(observedAt, nowIso(), offerCount, offerCount);

  console.log(
    `Seeded ${bundle.stores.length} stores, ${bundle.products.length} products, ` +
      `${offerCount} offers, ${pointCount} price points, ${bundle.marketSeries.length} index points.`,
  );
  console.log('All offers are flagged as SAMPLE DATA — configure a live source to replace them.');

  closeDb();
}

main();
