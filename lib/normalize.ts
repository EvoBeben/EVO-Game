import type { ProductSpecs, StockStatus } from './types';

/**
 * Parses a money string as it appears on a retail page into integer cents.
 * Handles "$1,299.99", "1299.99 USD", "Free", "$129999" style inputs and
 * returns null for anything that isn't a price ("See price in cart", "").
 */
export function parsePriceCents(input: unknown): number | null {
  if (typeof input === 'number') {
    return Number.isFinite(input) ? Math.round(input * 100) : null;
  }
  if (typeof input !== 'string') return null;

  const text = input.trim();
  if (!text) return null;
  if (/^free$/i.test(text)) return 0;

  // Grab the first number-looking run, tolerating thousands separators.
  const match = text.match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!match) return null;

  const value = Number.parseFloat(match[0].replace(/,/g, ''));
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

const OUT_OF_STOCK = /(out of stock|sold out|unavailable|no longer available|discontinued)/i;
const LIMITED = /(low stock|limited|only \d+ left|few left|last one|hurry)/i;
const PREORDER = /(pre-?order|coming soon)/i;
const BACKORDER = /(back-?order|on order)/i;
const IN_STOCK = /(in stock|available|add to cart|buy now|ships)/i;

/**
 * Maps the wide variety of retailer availability wording onto our enum.
 * Order matters: "available" appears inside "unavailable", and pre-order pages
 * often also say "add to cart".
 */
export function parseStockStatus(input: unknown): StockStatus {
  if (typeof input === 'boolean') return input ? 'in_stock' : 'out_of_stock';
  if (typeof input !== 'string') return 'unknown';

  const text = input.trim();
  if (!text) return 'unknown';

  if (OUT_OF_STOCK.test(text)) return 'out_of_stock';
  if (PREORDER.test(text)) return 'preorder';
  if (BACKORDER.test(text)) return 'backorder';
  if (LIMITED.test(text)) return 'limited';
  if (IN_STOCK.test(text)) return 'in_stock';
  return 'unknown';
}

/** Pulls "only 3 left" style counts out of availability copy. */
export function parseStockQty(input: unknown): number | null {
  if (typeof input === 'number') return Number.isInteger(input) && input >= 0 ? input : null;
  if (typeof input !== 'string') return null;
  const match = input.match(/only\s+(\d+)\s+left|(\d+)\s+in stock/i);
  if (!match) return null;
  const value = Number.parseInt(match[1] ?? match[2], 10);
  return Number.isFinite(value) ? value : null;
}

/**
 * Normalises a product title for fuzzy matching: lowercase, strip punctuation
 * and marketing noise, collapse whitespace. Two listings for the same SKU at
 * different retailers should reduce to nearly the same string.
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(new|brand new|retail|boxed|oem|model|series|desktop|memory kit|kit)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Manufacturer part numbers vary in punctuation between retailers. */
export function normalizeMpn(mpn: string | null | undefined): string | null {
  if (!mpn) return null;
  const cleaned = mpn.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned.length >= 4 ? cleaned : null;
}

const CAPACITY = /(\d+)\s*(gb|tb)\b/gi;
const KIT = /(\d+)\s*x\s*(\d+)\s*gb/i;
// Retailers write speed two ways: attached to the generation ("DDR5-6400") or
// with an explicit unit ("6400 MT/s"). A bare number is never treated as a
// speed — "PC5 48000" and capacities would both false-positive.
const SPEED_PREFIXED = /\bddr[45][-\s](\d{4,5})\b/i;
const SPEED_SUFFIXED = /\b(\d{4,5})\s*(?:mt\/s|mhz)\b/i;
const CAS = /\b(?:cl|cas[- ]?latency\s*)(\d{2})\b/i;
const DDR_GEN = /\bddr([45])\b/i;

/**
 * Best-effort spec extraction from a retailer title. Used to enrich unmatched
 * listings and to sanity-check matches — never as the sole source of truth for
 * a canonical product, which comes from the catalogue.
 */
export function parseMemorySpecs(title: string): ProductSpecs {
  const specs: ProductSpecs = {};

  const gen = title.match(DDR_GEN);
  if (gen) specs.ddr_gen = (`DDR${gen[1]}`) as 'DDR4' | 'DDR5';

  const kit = title.match(KIT);
  if (kit) {
    specs.kit_count = Number.parseInt(kit[1], 10);
    specs.capacity_gb = Number.parseInt(kit[2], 10);
  } else {
    // No "2x16GB" pattern — take the largest standalone capacity mentioned.
    const capacities: number[] = [];
    for (const match of title.matchAll(CAPACITY)) {
      const value = Number.parseInt(match[1], 10);
      capacities.push(match[2].toLowerCase() === 'tb' ? value * 1000 : value);
    }
    if (capacities.length) {
      specs.capacity_gb = Math.max(...capacities);
      specs.kit_count = 1;
    }
  }

  const speed = title.match(SPEED_PREFIXED) ?? title.match(SPEED_SUFFIXED);
  if (speed) specs.speed_mts = Number.parseInt(speed[1], 10);

  const cas = title.match(CAS);
  if (cas) specs.cas = Number.parseInt(cas[1], 10);

  return specs;
}

/** Shipping copy → cents. "Free shipping" is 0, an unparseable string is 0. */
export function parseShippingCents(input: unknown): number {
  if (input == null) return 0;
  if (typeof input === 'number') return Math.max(0, Math.round(input * 100));
  if (typeof input === 'string' && /free/i.test(input)) return 0;
  return parsePriceCents(input) ?? 0;
}
