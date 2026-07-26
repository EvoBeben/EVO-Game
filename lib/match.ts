import { normalizeMpn, normalizeTitle } from './normalize';

export interface MatchCandidate {
  id: number;
  name: string;
  brand: string;
  model: string;
  mpn: string | null;
  upc: string | null;
}

export interface MatchInput {
  title: string;
  mpn?: string | null;
  upc?: string | null;
  brand?: string | null;
}

export interface MatchResult {
  productId: number;
  confidence: number;
  reason: 'upc' | 'mpn' | 'title';
}

/** Token-set similarity in [0,1]; order-insensitive, which suits retail titles. */
export function titleSimilarity(a: string, b: string): number {
  const left = new Set(normalizeTitle(a).split(' ').filter(Boolean));
  const right = new Set(normalizeTitle(b).split(' ').filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;

  // Jaccard would punish long marketing titles too hard; use the smaller set as
  // the denominator so a verbose Newegg title still matches a terse catalogue name.
  return shared / Math.min(left.size, right.size);
}

/**
 * Ties a raw retailer listing to a canonical product.
 *
 * UPC and MPN are exact identifiers and win outright. Failing those we fall
 * back to title similarity, and only accept it above a deliberately high
 * threshold — a wrong match shows a shopper the wrong price, which is worse
 * than showing no offer at all.
 */
export function matchProduct(
  input: MatchInput,
  candidates: MatchCandidate[],
  threshold = 0.72,
): MatchResult | null {
  if (candidates.length === 0) return null;

  if (input.upc) {
    const hit = candidates.find((c) => c.upc && c.upc === input.upc);
    if (hit) return { productId: hit.id, confidence: 1, reason: 'upc' };
  }

  const mpn = normalizeMpn(input.mpn);
  if (mpn) {
    const hit = candidates.find((c) => normalizeMpn(c.mpn) === mpn);
    if (hit) return { productId: hit.id, confidence: 1, reason: 'mpn' };
  }

  let best: MatchResult | null = null;
  for (const candidate of candidates) {
    // A brand mismatch is a hard veto: "Corsair Vengeance" and "G.Skill
    // Vengeance-alike" share too many tokens to separate on text alone.
    if (input.brand && candidate.brand) {
      if (candidate.brand.toLowerCase() !== input.brand.toLowerCase()) continue;
    }

    const score = titleSimilarity(input.title, `${candidate.brand} ${candidate.name}`);
    if (score >= threshold && (!best || score > best.confidence)) {
      best = { productId: candidate.id, confidence: score, reason: 'title' };
    }
  }

  return best;
}
