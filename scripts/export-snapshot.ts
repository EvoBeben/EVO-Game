/**
 * Exports a compact snapshot of the database for the standalone single-file
 * board (artifact/board.html).
 *
 * Prices stay integer cents. History is downsampled and stored against a
 * shared day axis rather than repeating ISO timestamps — that is most of the
 * saving, since the full history runs to ~9k points and the board only needs
 * its shape.
 */

import fs from 'node:fs';
import { closeDb, getDb } from '../lib/db';
import {
  dashboardStats,
  getMarketSeries,
  getPriceHistory,
  getProduct,
  listProducts,
  listStores,
} from '../lib/queries';

/** Stock statuses are exported as indices into this list. */
const STATUS_CODES = [
  'in_stock',
  'limited',
  'preorder',
  'backorder',
  'out_of_stock',
  'unknown',
];

const DAY = 86_400_000;
const HISTORY_DAYS = 90;
const POINTS_PER_STORE = 18;

/** [dayIndex, priceCents | null, statusCode] */
type HistoryPoint = [number, number | null, number];

function downsample<T>(rows: T[], target: number): T[] {
  if (rows.length <= target) return rows;
  const step = (rows.length - 1) / (target - 1);
  const out: T[] = [];
  for (let i = 0; i < target; i += 1) out.push(rows[Math.round(i * step)]);
  return out;
}

function main(): void {
  const db = getDb();
  const origin = Date.now() - HISTORY_DAYS * DAY;
  const dayOf = (iso: string) =>
    Math.max(0, Math.round((new Date(iso).getTime() - origin) / DAY));

  const products = listProducts({}, db).items.map((summary) => {
    // listProducts carries the derived metrics; getProduct carries the
    // hydrated, sort-ordered offers. The board needs both.
    const detail = getProduct(summary.slug, db)!;

    const history: Record<string, HistoryPoint[]> = {};
    for (const point of getPriceHistory(summary.id, HISTORY_DAYS, db)) {
      const list = history[point.storeSlug] ?? [];
      list.push([
        dayOf(point.observedAt),
        point.priceCents,
        STATUS_CODES.indexOf(point.stockStatus),
      ]);
      history[point.storeSlug] = list;
    }
    for (const slug of Object.keys(history)) {
      history[slug] = downsample(history[slug], POINTS_PER_STORE);
    }

    return {
      s: summary.slug,
      c: summary.category,
      b: summary.brand,
      m: summary.model,
      n: summary.name,
      mpn: summary.mpn,
      sp: summary.specs,
      best: summary.bestCents,
      low: summary.lowestCents,
      high: summary.highestCents,
      pgb: summary.centsPerGb == null ? null : Math.round(summary.centsPerGb),
      d7: summary.change7d == null ? null : Math.round(summary.change7d * 10) / 10,
      inStock: summary.inStockCount,
      bestStore: summary.bestOffer?.store.slug ?? null,
      o: detail.offers.map((offer) => ({
        st: offer.store.slug,
        p: offer.priceCents,
        ship: offer.shippingCents,
        tot: offer.totalCents,
        k: STATUS_CODES.indexOf(offer.stockStatus),
        q: offer.stockQty,
        pick: offer.pickupAvailable,
        lim: offer.limitPerOrder,
        cond: offer.condition,
        u: offer.url,
        smp: offer.isSample ? 1 : 0,
      })),
      h: history,
    };
  });

  const market = getMarketSeries('dram_ddr5_16gb_spot', 180, db);

  const payload = {
    generatedAt: new Date().toISOString(),
    originMs: origin,
    statusCodes: STATUS_CODES,
    stats: dashboardStats(db),
    stores: listStores(db).map((store) => ({
      s: store.slug,
      n: store.name,
      slot: store.seriesSlot,
      mkt: store.isMarketplace ? 1 : 0,
      url: store.homepage,
    })),
    market: market.map((point) => [point.observedOn, point.value]),
    marketLabel: market[0]?.label ?? 'DDR5 16Gb spot',
    products,
  };

  fs.mkdirSync('artifact', { recursive: true });
  fs.writeFileSync('artifact/snapshot.json', JSON.stringify(payload));

  const kb = (fs.statSync('artifact/snapshot.json').size / 1024).toFixed(0);
  console.log(`artifact/snapshot.json: ${kb} KB`);
  console.log(
    `${products.length} products, ${payload.stores.length} stores, ${market.length} index points`,
  );

  closeDb();
}

main();
