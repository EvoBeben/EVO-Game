import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { mapBestBuyStock, toRawOffer, type BestBuyProduct } from '@/lib/sources/bestbuy';
import { mapEbayCondition, mapEbayStock, type EbayItemSummary } from '@/lib/sources/ebay';
import { mapSchemaAvailability, offersFromHtml } from '@/lib/sources/html';
import { normalizeIndexRows } from '@/lib/sources/dram-index';

const FIXTURES = path.join(__dirname, 'fixtures');

function loadJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8')) as T;
}

describe('Best Buy adapter', () => {
  const payload = loadJson<{ products: BestBuyProduct[] }>('bestbuy-products.json');

  it('maps orderable states, not just the availability booleans', () => {
    const [available, soldOut, preorder] = payload.products;
    expect(mapBestBuyStock(available)).toBe('in_stock');
    expect(mapBestBuyStock(soldOut)).toBe('out_of_stock');
    expect(mapBestBuyStock(preorder)).toBe('preorder');
  });

  it('treats an orderable product with no online availability as out of stock', () => {
    expect(mapBestBuyStock({ sku: 1, name: 'x', orderable: 'Available', onlineAvailability: false })).toBe(
      'out_of_stock',
    );
  });

  it('falls back to unknown when the API says nothing about availability', () => {
    expect(mapBestBuyStock({ sku: 1, name: 'x' })).toBe('unknown');
  });

  it('prefers sale price and keeps the regular price as the list price', () => {
    const offer = toRawOffer(payload.products[0]);
    expect(offer.priceCents).toBe(25999);
    expect(offer.listPriceCents).toBe(28999);
    expect(offer.storeSlug).toBe('bestbuy');
    expect(offer.mpn).toBe('CMH64GX5M2B6000C30');
    expect(offer.upc).toBe('840006670001');
    expect(offer.pickupAvailable).toBe(true);
  });

  it('records a null price rather than zero when no price is published', () => {
    const offer = toRawOffer(payload.products[3]);
    expect(offer.priceCents).toBeNull();
    expect(offer.listPriceCents).toBeNull();
  });

  it('reports pickup as unknown when the field is absent', () => {
    expect(toRawOffer(payload.products[3]).pickupAvailable).toBeNull();
  });
});

describe('eBay adapter', () => {
  it('maps condition text onto our enum', () => {
    const cases: [string, string][] = [
      ['New', 'new'],
      ['Certified - Refurbished', 'refurbished'],
      ['Open box', 'open_box'],
      ['Used', 'used'],
      ['Pre-owned', 'used'],
    ];
    for (const [input, expected] of cases) {
      expect(mapEbayCondition({ itemId: '1', title: 't', condition: input })).toBe(expected);
    }
  });

  it('downgrades a thin in-stock listing to limited', () => {
    const item: EbayItemSummary = {
      itemId: '1',
      title: 't',
      estimatedAvailabilities: [
        { estimatedAvailabilityStatus: 'IN_STOCK', estimatedAvailableQuantity: 2 },
      ],
    };
    expect(mapEbayStock(item)).toBe('limited');
  });

  it('treats a live listing with no availability block as in stock', () => {
    expect(mapEbayStock({ itemId: '1', title: 't' })).toBe('in_stock');
  });
});

describe('schema.org availability mapping', () => {
  it('accepts both full URLs and bare tokens', () => {
    expect(mapSchemaAvailability('https://schema.org/InStock')).toBe('in_stock');
    expect(mapSchemaAvailability('http://schema.org/OutOfStock')).toBe('out_of_stock');
    expect(mapSchemaAvailability('LimitedAvailability')).toBe('limited');
    expect(mapSchemaAvailability('PreOrder')).toBe('preorder');
    expect(mapSchemaAvailability('BackOrder')).toBe('backorder');
  });

  it('returns unknown for anything unrecognised', () => {
    expect(mapSchemaAvailability('SomethingElse')).toBe('unknown');
    expect(mapSchemaAvailability(undefined)).toBe('unknown');
  });
});

describe('HTML adapter JSON-LD extraction', () => {
  const html = fs.readFileSync(path.join(FIXTURES, 'retailer-search.html'), 'utf8');
  const offers = offersFromHtml(html, {
    storeSlug: 'newegg',
    pageUrl: 'https://www.newegg.com/p/pl?d=ddr5',
  });

  it('finds every product node and skips the malformed island', () => {
    expect(offers).toHaveLength(3);
  });

  it('resolves relative URLs against the page', () => {
    expect(offers[0].url).toBe('https://www.newegg.com/p/N82E16820236888');
  });

  it('reads identifiers and price', () => {
    expect(offers[0].mpn).toBe('CMH64GX5M2B6000C30');
    expect(offers[0].upc).toBe('840006670001');
    expect(offers[0].priceCents).toBe(26499);
    expect(offers[0].stockStatus).toBe('in_stock');
  });

  it('unwraps AggregateOffer to reach the real offer', () => {
    expect(offers[1].priceCents).toBe(55999);
    expect(offers[1].stockStatus).toBe('out_of_stock');
  });

  it('accepts a brand given either as a string or as an object', () => {
    expect(offers[0].brand).toBe('Corsair');
    expect(offers[1].brand).toBe('G.Skill');
  });

  it('will not report a priceless listing as in stock', () => {
    // The markup claims LimitedAvailability but publishes no price, so there is
    // nothing a shopper could actually buy at a known figure.
    expect(offers[2].priceCents).toBeNull();
    expect(offers[2].stockStatus).toBe('limited');
  });

  it('returns nothing for a page with no product markup', () => {
    expect(offersFromHtml('<html><body>no markup</body></html>', {
      storeSlug: 'newegg',
      pageUrl: 'https://example.com',
    })).toEqual([]);
  });
});

describe('DRAM index normalisation', () => {
  it('accepts a bare array and both field spellings', () => {
    const points = normalizeIndexRows(
      [
        { date: '2026-07-01', value: 44.5 },
        { observed_on: '2026-07-02T00:00:00Z', price: '46.20' },
      ],
      'example.com',
    );
    expect(points).toHaveLength(2);
    expect(points[0].observedOn).toBe('2026-07-01');
    expect(points[1].value).toBeCloseTo(46.2);
    expect(points[1].observedOn).toBe('2026-07-02');
  });

  it('accepts a wrapped series', () => {
    expect(normalizeIndexRows({ series: [{ date: '2026-07-01', value: 1 }] }, 'x')).toHaveLength(1);
  });

  it('drops rows with no usable date or value', () => {
    const points = normalizeIndexRows(
      [
        { value: 44.5 },
        { date: 'not-a-date', value: 2 },
        { date: '2026-07-01', value: 'abc' },
        { date: '2026-07-01', value: 5 },
      ],
      'x',
    );
    expect(points).toHaveLength(1);
  });

  it('returns nothing for a payload it cannot understand', () => {
    expect(normalizeIndexRows({ unexpected: true }, 'x')).toEqual([]);
    expect(normalizeIndexRows(null, 'x')).toEqual([]);
  });
});
