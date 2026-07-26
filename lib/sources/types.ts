import type { Condition, StockStatus } from '../types';

/** A single listing as returned by an adapter, before matching and storage. */
export interface RawOffer {
  /** Store slug this offer belongs to — must exist in the `stores` table. */
  storeSlug: string;
  title: string;
  url: string;
  storeSku?: string | null;
  mpn?: string | null;
  upc?: string | null;
  brand?: string | null;
  condition?: Condition;
  priceCents: number | null;
  listPriceCents?: number | null;
  shippingCents?: number;
  currency?: string;
  stockStatus: StockStatus;
  stockQty?: number | null;
  pickupAvailable?: boolean | null;
  limitPerOrder?: number | null;
  /** Marks seeded demo rows so the UI can label them honestly. */
  isSample?: boolean;
}

export interface SearchQuery {
  /** Free-text terms drawn from the catalogue, e.g. "Corsair Vengeance DDR5 64GB". */
  terms: string[];
  category?: string;
}

export type SourceKind = 'official-api' | 'html' | 'index' | 'fixture';

export interface SourceAvailability {
  enabled: boolean;
  /** Human-readable explanation when disabled, shown on /stores. */
  reason: string | null;
}

export interface Source {
  key: string;
  name: string;
  kind: SourceKind;
  /** Store slugs this adapter can produce offers for. */
  storeSlugs: string[];
  availability(): SourceAvailability;
  search(query: SearchQuery): Promise<RawOffer[]>;
}

/** Market-index adapters write to `market_series` instead of `offers`. */
export interface IndexPoint {
  seriesKey: string;
  label: string;
  observedOn: string;
  value: number;
  unit: string;
  source: string;
}

export interface IndexSource {
  key: string;
  name: string;
  kind: 'index';
  availability(): SourceAvailability;
  fetchSeries(): Promise<IndexPoint[]>;
}
