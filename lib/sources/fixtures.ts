import fs from 'node:fs';
import path from 'node:path';
import type { RawOffer, SearchQuery, Source, SourceAvailability } from './types';

/**
 * Seeded sample data. Always enabled, so the site is fully functional with no
 * API keys and no network — which is also how it runs in CI and in sandboxes
 * where retailer domains are blocked.
 *
 * Everything this adapter emits is flagged `isSample`, stored with
 * `offers.is_sample = 1`, and rendered behind a "SAMPLE DATA" badge. Demo
 * numbers must never be mistaken for live pricing.
 */

export interface SeedOffer {
  storeSlug: string;
  url: string;
  storeSku?: string;
  priceCents: number | null;
  listPriceCents?: number | null;
  shippingCents?: number;
  stockStatus: RawOffer['stockStatus'];
  stockQty?: number | null;
  pickupAvailable?: boolean | null;
  limitPerOrder?: number | null;
  condition?: RawOffer['condition'];
}

export interface SeedProduct {
  slug: string;
  category: string;
  brand: string;
  model: string;
  name: string;
  mpn: string | null;
  upc: string | null;
  specs: Record<string, unknown>;
  offers: SeedOffer[];
  /** Daily observations per store slug, oldest first. */
  history?: Record<string, { observedAt: string; priceCents: number | null; stockStatus: string }[]>;
}

export interface SeedStore {
  slug: string;
  name: string;
  homepage: string;
  sourceKey: string;
  seriesSlot: number;
  isMarketplace?: boolean;
}

export interface SeedIndexPoint {
  seriesKey: string;
  label: string;
  observedOn: string;
  value: number;
  unit: string;
  source: string;
}

export interface SeedBundle {
  generatedAt: string;
  stores: SeedStore[];
  products: SeedProduct[];
  marketSeries: SeedIndexPoint[];
}

export function seedPath(): string {
  return path.join(process.cwd(), 'data', 'seed', 'catalog.json');
}

export function loadSeedBundle(): SeedBundle | null {
  try {
    return JSON.parse(fs.readFileSync(seedPath(), 'utf8')) as SeedBundle;
  } catch {
    return null;
  }
}

export const fixtureSource: Source = {
  key: 'fixtures',
  name: 'Seeded sample data',
  kind: 'fixture',
  storeSlugs: [],

  availability(): SourceAvailability {
    return fs.existsSync(seedPath())
      ? { enabled: true, reason: null }
      : { enabled: false, reason: 'data/seed/catalog.json is missing — run `npm run gen-seed`' };
  },

  async search(_query: SearchQuery): Promise<RawOffer[]> {
    const bundle = loadSeedBundle();
    if (!bundle) return [];

    const offers: RawOffer[] = [];
    for (const product of bundle.products) {
      for (const offer of product.offers) {
        offers.push({
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
        });
      }
    }
    return offers;
  },
};
