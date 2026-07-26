export const CATEGORIES = ['ram', 'gpu', 'cpu', 'ssd', 'motherboard', 'psu'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  ram: 'Memory',
  gpu: 'Graphics Cards',
  cpu: 'Processors',
  ssd: 'Storage',
  motherboard: 'Motherboards',
  psu: 'Power Supplies',
};

/** Categories where a per-gigabyte price is a meaningful comparison metric. */
export const PER_GB_CATEGORIES: ReadonlySet<string> = new Set(['ram', 'ssd']);

export const STOCK_STATUSES = [
  'in_stock',
  'limited',
  'preorder',
  'backorder',
  'out_of_stock',
  'unknown',
] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export const STOCK_LABELS: Record<StockStatus, string> = {
  in_stock: 'In stock',
  limited: 'Low stock',
  preorder: 'Pre-order',
  backorder: 'Backorder',
  out_of_stock: 'Out of stock',
  unknown: 'Unknown',
};

/** Sort weight for "best offer" selection — lower is better. */
export const STOCK_RANK: Record<StockStatus, number> = {
  in_stock: 0,
  limited: 1,
  preorder: 2,
  backorder: 3,
  unknown: 4,
  out_of_stock: 5,
};

export function isBuyable(status: StockStatus): boolean {
  return status === 'in_stock' || status === 'limited';
}

export type Condition = 'new' | 'refurbished' | 'used' | 'open_box';

export interface ProductSpecs {
  // RAM
  ddr_gen?: 'DDR4' | 'DDR5';
  capacity_gb?: number;
  kit_count?: number;
  speed_mts?: number;
  cas?: number;
  form_factor?: string;
  // GPU
  chipset?: string;
  vram_gb?: number;
  // CPU
  cores?: number;
  socket?: string;
  // SSD
  interface?: string;
  // PSU
  wattage?: number;
  efficiency?: string;
  [key: string]: unknown;
}

export interface Store {
  id: number;
  slug: string;
  name: string;
  homepage: string;
  sourceKey: string;
  region: string;
  seriesSlot: number;
  isMarketplace: boolean;
}

export interface Offer {
  id: number;
  productId: number;
  store: Store;
  storeSku: string | null;
  url: string;
  condition: Condition;
  priceCents: number | null;
  listPriceCents: number | null;
  shippingCents: number;
  totalCents: number | null;
  currency: string;
  stockStatus: StockStatus;
  stockQty: number | null;
  pickupAvailable: boolean | null;
  limitPerOrder: number | null;
  isSample: boolean;
  lastSeenAt: string;
}

export interface Product {
  id: number;
  slug: string;
  category: Category;
  brand: string;
  model: string;
  name: string;
  mpn: string | null;
  upc: string | null;
  specs: ProductSpecs;
  imageUrl: string | null;
}

export interface ProductSummary extends Product {
  bestOffer: Offer | null;
  offerCount: number;
  inStockCount: number;
  /**
   * Landed total of `bestOffer` — the cheapest offer you can actually buy.
   * This is the headline price; prefer it over `lowestCents` for display.
   */
  bestCents: number | null;
  /** Cheapest landed total across all priced offers, in stock or not. */
  lowestCents: number | null;
  highestCents: number | null;
  /** Landed price per GB in cents, for RAM and SSDs. */
  centsPerGb: number | null;
  /** Percent change in best landed price over the trailing 7 days. */
  change7d: number | null;
}

export interface ProductDetail extends ProductSummary {
  offers: Offer[];
}

export interface PricePoint {
  storeSlug: string;
  storeName: string;
  seriesSlot: number;
  observedAt: string;
  priceCents: number | null;
  stockStatus: StockStatus;
}

export interface MarketPoint {
  seriesKey: string;
  label: string;
  observedOn: string;
  value: number;
  unit: string;
  source: string;
}

export interface SourceRun {
  sourceKey: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'ok' | 'skipped' | 'error';
  detail: string | null;
  offersSeen: number;
  offersUpserted: number;
  unmatched: number;
}

export interface SourceStatus {
  key: string;
  name: string;
  kind: 'official-api' | 'html' | 'index' | 'fixture';
  enabled: boolean;
  /** Why it is not enabled, when it isn't. */
  reason: string | null;
  storeSlugs: string[];
  lastRun: SourceRun | null;
}
