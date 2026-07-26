import { politeFetchText, RobotsDisallowedError } from './fetcher';
import { parsePriceCents, parseStockQty } from '../normalize';
import type { RawOffer, SearchQuery, Source, SourceAvailability } from './types';
import type { StockStatus } from '../types';

/**
 * Shared machinery for the HTML adapters.
 *
 * These read public product pages rather than an API. They are OFF unless
 * ENABLE_HTML_SOURCES=true, because several of the retailers involved
 * prohibit automated collection in their terms of service and most sit behind
 * bot protection that will simply block you. See README "HTML adapters".
 *
 * Where a retailer publishes schema.org Product markup — most do, because
 * Google Shopping requires it — we read that instead of scraping the DOM. It
 * is the retailer's own structured, published description of the listing, and
 * it does not break every time they reskin the page.
 */

export function htmlSourcesEnabled(): boolean {
  return /^(1|true|yes)$/i.test(process.env.ENABLE_HTML_SOURCES ?? '');
}

export function htmlAvailability(storeName: string): SourceAvailability {
  if (!htmlSourcesEnabled()) {
    return {
      enabled: false,
      reason: `HTML adapters are off by default — set ENABLE_HTML_SOURCES=true to read ${storeName} product pages`,
    };
  }
  return { enabled: true, reason: null };
}

// ---------------------------------------------------------------------------
// schema.org extraction
// ---------------------------------------------------------------------------

const JSON_LD_BLOCK = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/** Pulls every JSON-LD island out of a page, ignoring malformed ones. */
export function extractJsonLd(html: string): unknown[] {
  const found: unknown[] = [];
  for (const match of html.matchAll(JSON_LD_BLOCK)) {
    const raw = match[1].trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) found.push(...parsed);
      else found.push(parsed);
    } catch {
      // Retailers ship broken JSON-LD surprisingly often; skip it.
    }
  }
  return found;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function typeOf(node: Record<string, unknown>): string[] {
  const raw = node['@type'];
  if (typeof raw === 'string') return [raw];
  if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === 'string');
  return [];
}

/** Walks nested JSON-LD (graphs, ItemLists) collecting Product nodes. */
export function findProductNodes(nodes: unknown[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const queue = [...nodes];

  while (queue.length) {
    const node = queue.shift();
    if (!isRecord(node)) continue;

    if (typeOf(node).includes('Product')) out.push(node);

    for (const key of ['@graph', 'itemListElement', 'item', 'mainEntity']) {
      const child = node[key];
      if (Array.isArray(child)) queue.push(...child);
      else if (isRecord(child)) queue.push(child);
    }
  }
  return out;
}

const AVAILABILITY_MAP: Record<string, StockStatus> = {
  instock: 'in_stock',
  onlineonly: 'in_stock',
  instoreonly: 'in_stock',
  limitedavailability: 'limited',
  presale: 'preorder',
  preorder: 'preorder',
  backorder: 'backorder',
  outofstock: 'out_of_stock',
  soldout: 'out_of_stock',
  discontinued: 'out_of_stock',
};

/** Maps a schema.org ItemAvailability URL or bare token onto our enum. */
export function mapSchemaAvailability(value: unknown): StockStatus {
  if (typeof value !== 'string') return 'unknown';
  const token = value.split(/[/#]/).pop()?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
  return AVAILABILITY_MAP[token] ?? 'unknown';
}

function firstOffer(node: Record<string, unknown>): Record<string, unknown> | null {
  const offers = node.offers;
  if (Array.isArray(offers)) {
    const record = offers.find(isRecord);
    return record ?? null;
  }
  if (isRecord(offers)) {
    // AggregateOffer wraps the real offers one level deeper.
    if (typeOf(offers).includes('AggregateOffer') && Array.isArray(offers.offers)) {
      return offers.offers.find(isRecord) ?? offers;
    }
    return offers;
  }
  return null;
}

function textOf(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (isRecord(value) && typeof value.name === 'string') return value.name;
  return null;
}

export interface JsonLdParseOptions {
  storeSlug: string;
  /** Page URL, used when the markup omits a canonical link. */
  pageUrl: string;
}

/** Converts one schema.org Product node into a RawOffer. */
export function productNodeToOffer(
  node: Record<string, unknown>,
  options: JsonLdParseOptions,
): RawOffer | null {
  const title = typeof node.name === 'string' ? node.name : null;
  if (!title) return null;

  const offer = firstOffer(node);
  const priceRaw =
    offer?.price ?? offer?.lowPrice ?? (isRecord(offer?.priceSpecification) ? offer.priceSpecification.price : undefined);

  const availabilityText = offer?.availability;
  let stockStatus = mapSchemaAvailability(availabilityText);

  // A listing with no price is not purchasable regardless of what the
  // availability field claims.
  const priceCents = parsePriceCents(priceRaw);
  if (priceCents == null && stockStatus === 'in_stock') stockStatus = 'unknown';

  const url =
    (typeof offer?.url === 'string' && offer.url) ||
    (typeof node.url === 'string' && node.url) ||
    options.pageUrl;

  return {
    storeSlug: options.storeSlug,
    title,
    url: new URL(url, options.pageUrl).toString(),
    storeSku: typeof node.sku === 'string' ? node.sku : null,
    mpn: typeof node.mpn === 'string' ? node.mpn : null,
    upc: typeof node.gtin13 === 'string' ? node.gtin13 : (typeof node.gtin12 === 'string' ? node.gtin12 : null),
    brand: textOf(node.brand),
    condition: 'new',
    priceCents,
    shippingCents: 0,
    currency: typeof offer?.priceCurrency === 'string' ? offer.priceCurrency : 'USD',
    stockStatus,
    stockQty: parseStockQty(typeof availabilityText === 'string' ? availabilityText : null),
  };
}

export function offersFromHtml(html: string, options: JsonLdParseOptions): RawOffer[] {
  return findProductNodes(extractJsonLd(html))
    .map((node) => productNodeToOffer(node, options))
    .filter((offer): offer is RawOffer => offer !== null);
}

// ---------------------------------------------------------------------------
// Adapter factory
// ---------------------------------------------------------------------------

export interface HtmlSourceConfig {
  key: string;
  name: string;
  storeSlug: string;
  /** Builds the retailer's search-results URL for a query phrase. */
  searchUrl: (term: string) => string;
  /** Optional retailer-specific parser, used when JSON-LD is absent. */
  parse?: (html: string, pageUrl: string) => RawOffer[];
  /** Cap on results kept per search term. */
  perTermLimit?: number;
}

export function createHtmlSource(config: HtmlSourceConfig): Source {
  return {
    key: config.key,
    name: config.name,
    kind: 'html',
    storeSlugs: [config.storeSlug],

    availability: () => htmlAvailability(config.name),

    async search(query: SearchQuery): Promise<RawOffer[]> {
      const offers: RawOffer[] = [];
      const seen = new Set<string>();

      for (const term of query.terms) {
        const pageUrl = config.searchUrl(term);
        let html: string;
        try {
          html = await politeFetchText(pageUrl, { cacheTtl: 900 });
        } catch (error) {
          // robots.txt is a hard stop for the whole adapter, not one query.
          if (error instanceof RobotsDisallowedError) throw error;
          // Anything else (a block, a timeout, a 503) is per-term: keep going.
          continue;
        }

        const parsed = config.parse?.(html, pageUrl) ?? [];
        const found = parsed.length
          ? parsed
          : offersFromHtml(html, { storeSlug: config.storeSlug, pageUrl });

        for (const offer of found.slice(0, config.perTermLimit ?? 10)) {
          if (seen.has(offer.url)) continue;
          seen.add(offer.url);
          offers.push(offer);
        }
      }

      return offers;
    },
  };
}
