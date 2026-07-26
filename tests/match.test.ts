import { describe, expect, it } from 'vitest';
import { matchProduct, titleSimilarity, type MatchCandidate } from '@/lib/match';

const CANDIDATES: MatchCandidate[] = [
  {
    id: 1,
    brand: 'Corsair',
    model: 'Vengeance RGB',
    name: 'Corsair Vengeance RGB 64GB (2x32GB) DDR5-6000 CL30',
    mpn: 'CMH6000C30-64',
    upc: '840006670001',
  },
  {
    id: 2,
    brand: 'G.Skill',
    model: 'Trident Z5 RGB',
    name: 'G.Skill Trident Z5 RGB 64GB (2x32GB) DDR5-6000 CL30',
    mpn: 'F56000C30-64',
    upc: null,
  },
  {
    id: 3,
    brand: 'Corsair',
    model: 'Vengeance LPX',
    name: 'Corsair Vengeance LPX 32GB (2x16GB) DDR4-3600 CL18',
    mpn: 'CMK3600C18-32',
    upc: null,
  },
];

describe('matchProduct', () => {
  it('prefers UPC over everything else', () => {
    const result = matchProduct(
      { title: 'totally unrelated wording', upc: '840006670001' },
      CANDIDATES,
    );
    expect(result).toEqual({ productId: 1, confidence: 1, reason: 'upc' });
  });

  it('matches on MPN despite punctuation differences', () => {
    const result = matchProduct({ title: 'whatever', mpn: 'cmh-6000c30/64' }, CANDIDATES);
    expect(result?.productId).toBe(1);
    expect(result?.reason).toBe('mpn');
  });

  it('falls back to title similarity when no identifier is present', () => {
    const result = matchProduct(
      {
        title: 'CORSAIR Vengeance RGB 64GB (2 x 32GB) DDR5 6000 Desktop Memory Kit',
        brand: 'Corsair',
      },
      CANDIDATES,
    );
    expect(result?.productId).toBe(1);
    expect(result?.reason).toBe('title');
  });

  it('never matches across brands on text alone', () => {
    // Same capacity, speed and latency as candidate 1 — only the brand differs.
    const result = matchProduct(
      { title: 'G.Skill Trident Z5 RGB 64GB (2x32GB) DDR5-6000 CL30', brand: 'G.Skill' },
      CANDIDATES,
    );
    expect(result?.productId).toBe(2);
  });

  it('returns null rather than guessing when nothing is close enough', () => {
    expect(matchProduct({ title: 'Logitech MX Master 3S mouse' }, CANDIDATES)).toBeNull();
  });

  it('does not confuse two Corsair kits of different generations', () => {
    const result = matchProduct(
      { title: 'Corsair Vengeance LPX 32GB (2x16GB) DDR4 3600 C18', brand: 'Corsair' },
      CANDIDATES,
    );
    expect(result?.productId).toBe(3);
  });

  it('handles an empty catalogue', () => {
    expect(matchProduct({ title: 'anything' }, [])).toBeNull();
  });
});

describe('titleSimilarity', () => {
  it('is order-insensitive', () => {
    expect(titleSimilarity('Corsair Vengeance 64GB', '64GB Vengeance Corsair')).toBe(1);
  });

  it('scores unrelated titles near zero', () => {
    expect(titleSimilarity('Corsair Vengeance 64GB', 'Seasonic power supply')).toBeLessThan(0.2);
  });
});
