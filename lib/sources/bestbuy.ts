import { politeFetchJson } from './fetcher';
import type { RawOffer, SearchQuery, Source, SourceAvailability } from './types';
import type { StockStatus } from '../types';

/**
 * Best Buy Products API — https://developer.bestbuy.com/
 *
 * The primary live source: an official, free, ToS-clean API that reports
 * price, sale price, online availability and in-store availability.
 */

const BASE = 'https://api.bestbuy.com/v1/products';

const FIELDS = [
  'sku',
  'name',
  'manufacturer',
  'modelNumber',
  'upc',
  'regularPrice',
  'salePrice',
  'onSale',
  'onlineAvailability',
  'inStoreAvailability',
  'orderable',
  'url',
  'addToCartUrl',
  'image',
].join(',');

export interface BestBuyProduct {
  sku: number;
  name: string;
  manufacturer?: string;
  modelNumber?: string;
  upc?: string;
  regularPrice?: number;
  salePrice?: number;
  onSale?: boolean;
  onlineAvailability?: boolean;
  inStoreAvailability?: boolean;
  orderable?: string;
  url?: string;
  addToCartUrl?: string;
  image?: string;
}

interface BestBuyResponse {
  products?: BestBuyProduct[];
  total?: number;
}

/**
 * `orderable` carries more nuance than the availability booleans — it is where
 * pre-orders, backorders and coming-soon states show up.
 */
export function mapBestBuyStock(product: BestBuyProduct): StockStatus {
  switch (product.orderable) {
    case 'Available':
      return product.onlineAvailability === false ? 'out_of_stock' : 'in_stock';
    case 'PreOrder':
      return 'preorder';
    case 'BackOrder':
      return 'backorder';
    case 'ComingSoon':
      return 'preorder';
    case 'SoldOut':
    case 'Discontinued':
      return 'out_of_stock';
    default:
      break;
  }
  if (product.onlineAvailability === true) return 'in_stock';
  if (product.onlineAvailability === false) return 'out_of_stock';
  return 'unknown';
}

export function toRawOffer(product: BestBuyProduct): RawOffer {
  const price = product.salePrice ?? product.regularPrice ?? null;
  return {
    storeSlug: 'bestbuy',
    title: product.name,
    url: product.url ?? `https://www.bestbuy.com/site/searchpage.jsp?st=${product.sku}`,
    storeSku: String(product.sku),
    mpn: product.modelNumber ?? null,
    upc: product.upc ?? null,
    brand: product.manufacturer ?? null,
    condition: 'new',
    priceCents: price == null ? null : Math.round(price * 100),
    listPriceCents:
      product.regularPrice != null ? Math.round(product.regularPrice * 100) : null,
    // Best Buy ships free over a low threshold on components; the API does not
    // expose a per-item shipping quote, so we record 0 rather than guess.
    shippingCents: 0,
    currency: 'USD',
    stockStatus: mapBestBuyStock(product),
    pickupAvailable: product.inStoreAvailability ?? null,
  };
}

/** Builds the Best Buy `(search=a&search=b)` predicate for one query phrase. */
function searchPredicate(term: string): string {
  const words = term
    .split(/\s+/)
    .map((w) => w.replace(/[^\w.]/g, ''))
    .filter((w) => w.length > 1)
    .slice(0, 6);
  if (words.length === 0) return '';
  return `(${words.map((w) => `search=${encodeURIComponent(w)}`).join('&')})`;
}

export const bestBuySource: Source = {
  key: 'bestbuy',
  name: 'Best Buy Products API',
  kind: 'official-api',
  storeSlugs: ['bestbuy'],

  availability(): SourceAvailability {
    if (!process.env.BESTBUY_API_KEY?.trim()) {
      return {
        enabled: false,
        reason: 'BESTBUY_API_KEY is not set — get a free key at developer.bestbuy.com',
      };
    }
    return { enabled: true, reason: null };
  },

  async search(query: SearchQuery): Promise<RawOffer[]> {
    const apiKey = process.env.BESTBUY_API_KEY!;
    const offers: RawOffer[] = [];
    const seen = new Set<number>();

    for (const term of query.terms) {
      const predicate = searchPredicate(term);
      if (!predicate) continue;

      const url =
        `${BASE}${predicate}?apiKey=${encodeURIComponent(apiKey)}` +
        `&format=json&show=${FIELDS}&pageSize=10&sort=salePrice.asc`;

      // First-party API with a key: robots.txt governs crawlers, not API
      // clients, so the check is skipped here but the rate limit still applies.
      const data = await politeFetchJson<BestBuyResponse>(url, {
        skipRobots: true,
        cacheTtl: 300,
      });

      for (const product of data.products ?? []) {
        if (seen.has(product.sku)) continue;
        seen.add(product.sku);
        offers.push(toRawOffer(product));
      }
    }

    return offers;
  },
};
