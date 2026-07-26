import { politeFetchJson } from './fetcher';
import { parsePriceCents } from '../normalize';
import type { RawOffer, SearchQuery, Source, SourceAvailability } from './types';
import type { Condition, StockStatus } from '../types';

/**
 * eBay Browse API — https://developer.ebay.com/api-docs/buy/browse/overview.html
 *
 * Useful for the shortage specifically: when every first-party retailer is out
 * of stock, the marketplace is where the parts (and the markups) are.
 *
 * Production Browse access requires eBay approval. Without it these
 * credentials only work against the sandbox — set EBAY_ENV=sandbox.
 */

const ENDPOINTS = {
  production: {
    oauth: 'https://api.ebay.com/identity/v1/oauth2/token',
    browse: 'https://api.ebay.com/buy/browse/v1/item_summary/search',
  },
  sandbox: {
    oauth: 'https://api.sandbox.ebay.com/identity/v1/oauth2/token',
    browse: 'https://api.sandbox.ebay.com/buy/browse/v1/item_summary/search',
  },
} as const;

function endpoints() {
  return process.env.EBAY_ENV === 'sandbox' ? ENDPOINTS.sandbox : ENDPOINTS.production;
}

interface EbayAmount {
  value?: string;
  currency?: string;
}

export interface EbayItemSummary {
  itemId: string;
  title: string;
  itemWebUrl?: string;
  price?: EbayAmount;
  shippingOptions?: { shippingCost?: EbayAmount }[];
  condition?: string;
  conditionId?: string;
  seller?: { username?: string };
  estimatedAvailabilities?: {
    estimatedAvailabilityStatus?: string;
    estimatedAvailableQuantity?: number;
  }[];
  mpn?: string;
  brand?: string;
}

interface EbaySearchResponse {
  itemSummaries?: EbayItemSummary[];
}

let tokenCache: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;

  const id = process.env.EBAY_CLIENT_ID!;
  const secret = process.env.EBAY_CLIENT_SECRET!;
  const basic = Buffer.from(`${id}:${secret}`).toString('base64');

  const response = await fetch(endpoints().oauth, {
    method: 'POST',
    headers: {
      authorization: `Basic ${basic}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'https://api.ebay.com/oauth/api_scope',
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`eBay OAuth failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return tokenCache.token;
}

export function mapEbayCondition(item: EbayItemSummary): Condition {
  const text = (item.condition ?? '').toLowerCase();
  if (text.includes('refurb')) return 'refurbished';
  if (text.includes('open box')) return 'open_box';
  if (text.includes('used') || text.includes('pre-owned')) return 'used';
  return 'new';
}

export function mapEbayStock(item: EbayItemSummary): StockStatus {
  const availability = item.estimatedAvailabilities?.[0];
  switch (availability?.estimatedAvailabilityStatus) {
    case 'IN_STOCK':
      return (availability.estimatedAvailableQuantity ?? 99) <= 3 ? 'limited' : 'in_stock';
    case 'LIMITED_STOCK':
      return 'limited';
    case 'OUT_OF_STOCK':
      return 'out_of_stock';
    default:
      // A live Browse listing without availability detail is, by definition,
      // still purchasable.
      return 'in_stock';
  }
}

export function toRawOffer(item: EbayItemSummary): RawOffer {
  const shipping = item.shippingOptions?.[0]?.shippingCost?.value;
  return {
    storeSlug: 'ebay',
    title: item.title,
    url: item.itemWebUrl ?? `https://www.ebay.com/itm/${item.itemId}`,
    storeSku: item.itemId,
    mpn: item.mpn ?? null,
    brand: item.brand ?? null,
    condition: mapEbayCondition(item),
    priceCents: parsePriceCents(item.price?.value),
    shippingCents: shipping == null ? 0 : (parsePriceCents(shipping) ?? 0),
    currency: item.price?.currency ?? 'USD',
    stockStatus: mapEbayStock(item),
    stockQty: item.estimatedAvailabilities?.[0]?.estimatedAvailableQuantity ?? null,
  };
}

export const ebaySource: Source = {
  key: 'ebay',
  name: 'eBay Browse API',
  kind: 'official-api',
  storeSlugs: ['ebay'],

  availability(): SourceAvailability {
    const hasId = Boolean(process.env.EBAY_CLIENT_ID?.trim());
    const hasSecret = Boolean(process.env.EBAY_CLIENT_SECRET?.trim());
    if (!hasId || !hasSecret) {
      return {
        enabled: false,
        reason: 'EBAY_CLIENT_ID / EBAY_CLIENT_SECRET are not set',
      };
    }
    return { enabled: true, reason: null };
  },

  async search(query: SearchQuery): Promise<RawOffer[]> {
    const token = await accessToken();
    const offers: RawOffer[] = [];
    const seen = new Set<string>();

    for (const term of query.terms) {
      const url =
        `${endpoints().browse}?q=${encodeURIComponent(term)}` +
        `&limit=10&filter=${encodeURIComponent('buyingOptions:{FIXED_PRICE}')}` +
        `&sort=price`;

      const data = await politeFetchJson<EbaySearchResponse>(url, {
        skipRobots: true,
        cacheTtl: 300,
        headers: {
          authorization: `Bearer ${token}`,
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        },
      });

      for (const item of data.itemSummaries ?? []) {
        if (seen.has(item.itemId)) continue;
        seen.add(item.itemId);
        offers.push(toRawOffer(item));
      }
    }

    return offers;
  },
};
