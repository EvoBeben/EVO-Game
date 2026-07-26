import { describe, expect, it } from 'vitest';
import {
  normalizeMpn,
  normalizeTitle,
  parseMemorySpecs,
  parsePriceCents,
  parseShippingCents,
  parseStockQty,
  parseStockStatus,
} from '@/lib/normalize';

describe('parsePriceCents', () => {
  it('parses the shapes retailers actually render', () => {
    expect(parsePriceCents('$1,299.99')).toBe(129999);
    expect(parsePriceCents('129.00 USD')).toBe(12900);
    expect(parsePriceCents('$89')).toBe(8900);
    expect(parsePriceCents(64.5)).toBe(6450);
    expect(parsePriceCents('Free')).toBe(0);
  });

  it('returns null rather than guessing when there is no price', () => {
    expect(parsePriceCents('See price in cart')).toBeNull();
    expect(parsePriceCents('')).toBeNull();
    expect(parsePriceCents(null)).toBeNull();
    expect(parsePriceCents(undefined)).toBeNull();
  });

  it('avoids float drift on cents', () => {
    // 0.1 + 0.2 style drift would make this 1010.0000000000001 cents.
    expect(parsePriceCents('10.10')).toBe(1010);
    expect(parsePriceCents('19.99')).toBe(1999);
  });
});

describe('parseStockStatus', () => {
  it('does not read "unavailable" as "available"', () => {
    expect(parseStockStatus('Currently unavailable')).toBe('out_of_stock');
    expect(parseStockStatus('Available')).toBe('in_stock');
  });

  it('ranks pre-order above a generic add-to-cart', () => {
    expect(parseStockStatus('Pre-order now — add to cart')).toBe('preorder');
  });

  it('maps the rest of the vocabulary', () => {
    expect(parseStockStatus('Sold Out')).toBe('out_of_stock');
    expect(parseStockStatus('Only 3 left')).toBe('limited');
    expect(parseStockStatus('Backordered')).toBe('backorder');
    expect(parseStockStatus('In Stock')).toBe('in_stock');
    expect(parseStockStatus(true)).toBe('in_stock');
    expect(parseStockStatus(false)).toBe('out_of_stock');
    expect(parseStockStatus('')).toBe('unknown');
    expect(parseStockStatus(undefined)).toBe('unknown');
  });
});

describe('parseStockQty', () => {
  it('extracts counts from availability copy', () => {
    expect(parseStockQty('Only 3 left')).toBe(3);
    expect(parseStockQty('7 in stock')).toBe(7);
    expect(parseStockQty('In stock')).toBeNull();
    expect(parseStockQty(12)).toBe(12);
  });
});

describe('parseShippingCents', () => {
  it('treats free shipping as zero and unknown as zero', () => {
    expect(parseShippingCents('FREE Shipping')).toBe(0);
    expect(parseShippingCents('$9.99')).toBe(999);
    expect(parseShippingCents(null)).toBe(0);
  });
});

describe('normalizeTitle', () => {
  it('reduces two retailers\' titles for the same SKU to the same string', () => {
    const newegg = 'CORSAIR Vengeance RGB 64GB (2 x 32GB) DDR5 6000 (PC5 48000) Desktop Memory Kit';
    const bestbuy = 'Corsair - Vengeance RGB 64GB (2x32GB) DDR5 6000 Memory Kit - Black';
    expect(normalizeTitle(newegg)).toContain('vengeance rgb 64gb');
    expect(normalizeTitle(bestbuy)).toContain('vengeance rgb 64gb');
  });
});

describe('normalizeMpn', () => {
  it('strips punctuation differences between retailers', () => {
    expect(normalizeMpn('CMH64GX5M2B6000C30')).toBe('CMH64GX5M2B6000C30');
    expect(normalizeMpn('cmh-64gx5/m2b6000c30')).toBe('CMH64GX5M2B6000C30');
  });

  it('rejects values too short to identify anything', () => {
    expect(normalizeMpn('A-1')).toBeNull();
    expect(normalizeMpn(null)).toBeNull();
  });
});

describe('parseMemorySpecs', () => {
  it('reads a kit description', () => {
    expect(
      parseMemorySpecs('G.Skill Trident Z5 RGB 64GB (2x32GB) DDR5-6400 CL32'),
    ).toEqual({
      ddr_gen: 'DDR5',
      kit_count: 2,
      capacity_gb: 32,
      speed_mts: 6400,
      cas: 32,
    });
  });

  it('falls back to the largest capacity for a single module', () => {
    const specs = parseMemorySpecs('Crucial 32GB DDR5-5600 UDIMM');
    expect(specs.capacity_gb).toBe(32);
    expect(specs.kit_count).toBe(1);
  });

  it('converts terabyte capacities to gigabytes', () => {
    expect(parseMemorySpecs('Samsung 990 Pro 2TB NVMe').capacity_gb).toBe(2000);
  });
});
