/**
 * Generates data/seed/catalog.json — the sample dataset the site runs on when
 * no live source is configured.
 *
 * The catalogue (brands, models, specs, MSRPs) is real. The prices, stock
 * states and history curves are SYNTHETIC: plausible shapes derived from the
 * 2026 DRAM shortage, not observed readings. Everything generated here is
 * flagged `is_sample` and rendered behind a SAMPLE DATA badge.
 *
 * Deterministic: a fixed PRNG seed means regenerating produces identical
 * output, so the file diffs cleanly.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { SeedBundle, SeedOffer, SeedProduct, SeedStore } from '../lib/sources/fixtures';

// --- deterministic PRNG (mulberry32) ---------------------------------------

function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = makeRng(20260726);

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function jitter(value: number, spread: number): number {
  return value * (1 + (rng() * 2 - 1) * spread);
}

// --- stores ----------------------------------------------------------------

/**
 * Series slots are assigned once, in this fixed order, and stored per store —
 * so a store keeps its colour everywhere on the site and filtering a series
 * out never repaints the others. Deliberately NOT retailer brand hexes:
 * Newegg orange and Amazon orange are indistinguishable on a chart.
 */
const STORES: SeedStore[] = [
  { slug: 'newegg', name: 'Newegg', homepage: 'https://www.newegg.com', sourceKey: 'newegg', seriesSlot: 1 },
  { slug: 'bestbuy', name: 'Best Buy', homepage: 'https://www.bestbuy.com', sourceKey: 'bestbuy', seriesSlot: 2 },
  { slug: 'amazon', name: 'Amazon', homepage: 'https://www.amazon.com', sourceKey: 'amazon', seriesSlot: 3 },
  { slug: 'microcenter', name: 'Micro Center', homepage: 'https://www.microcenter.com', sourceKey: 'microcenter', seriesSlot: 4 },
  { slug: 'bhphoto', name: 'B&H Photo', homepage: 'https://www.bhphotovideo.com', sourceKey: 'bhphoto', seriesSlot: 5 },
  { slug: 'ebay', name: 'eBay', homepage: 'https://www.ebay.com', sourceKey: 'ebay', seriesSlot: 6, isMarketplace: true },
];

// --- catalogue -------------------------------------------------------------

interface CatalogEntry {
  category: string;
  brand: string;
  model: string;
  name: string;
  mpn: string;
  specs: Record<string, unknown>;
  /** Pre-shortage reference price in dollars. */
  basePrice: number;
  /** How hard the DRAM shortage hits this part, 0 = untouched. */
  shortageBeta: number;
}

/**
 * Real product lines, split by generation — Trident Z5 is DDR5-only, Ripjaws V
 * is DDR4-only, and pairing a line with the wrong generation would invent a
 * SKU that does not exist.
 */
const RAM_LINES = [
  { brand: 'Corsair', DDR5: { model: 'Vengeance RGB', prefix: 'CMH' }, DDR4: { model: 'Vengeance LPX', prefix: 'CMK' } },
  { brand: 'G.Skill', DDR5: { model: 'Trident Z5 RGB', prefix: 'F5' }, DDR4: { model: 'Ripjaws V', prefix: 'F4' } },
  { brand: 'Kingston', DDR5: { model: 'Fury Beast DDR5', prefix: 'KF56' }, DDR4: { model: 'Fury Beast DDR4', prefix: 'KF43' } },
  { brand: 'Crucial', DDR5: { model: 'Pro', prefix: 'CP' }, DDR4: { model: 'Ballistix', prefix: 'BL' } },
  { brand: 'TeamGroup', DDR5: { model: 'T-Force Delta RGB', prefix: 'FF3D' }, DDR4: { model: 'T-Force Vulcan Z', prefix: 'TLZ' } },
] as const;

const RAM_CONFIGS = [
  { ddr: 'DDR5', capacity: 16, kit: 2, speed: 6000, cas: 30, base: 96 },
  { ddr: 'DDR5', capacity: 32, kit: 2, speed: 6000, cas: 30, base: 178 },
  { ddr: 'DDR5', capacity: 32, kit: 2, speed: 6400, cas: 32, base: 194 },
  { ddr: 'DDR5', capacity: 48, kit: 2, speed: 6400, cas: 32, base: 289 },
  { ddr: 'DDR5', capacity: 16, kit: 4, speed: 6000, cas: 36, base: 205 },
  { ddr: 'DDR4', capacity: 16, kit: 2, speed: 3600, cas: 18, base: 74 },
  { ddr: 'DDR4', capacity: 32, kit: 2, speed: 3600, cas: 18, base: 138 },
] as const;

function ramCatalog(): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  for (const line of RAM_LINES) {
    for (const config of RAM_CONFIGS) {
      // Keep the catalogue realistic: not every brand ships every config.
      if (rng() < 0.32) continue;
      const variant = line[config.ddr];
      const totalGb = config.capacity * config.kit;
      entries.push({
        category: 'ram',
        brand: line.brand,
        model: variant.model,
        name: `${line.brand} ${variant.model} ${totalGb}GB (${config.kit}x${config.capacity}GB) ${config.ddr}-${config.speed} CL${config.cas}`,
        mpn: `${variant.prefix}${config.speed}C${config.cas}-${totalGb}`,
        specs: {
          ddr_gen: config.ddr,
          capacity_gb: config.capacity,
          kit_count: config.kit,
          speed_mts: config.speed,
          cas: config.cas,
          form_factor: 'DIMM',
        },
        basePrice: config.base,
        // DDR5 is the epicentre of the shortage; DDR4 rose on substitution.
        shortageBeta: config.ddr === 'DDR5' ? 1.0 : 0.72,
      });
    }
  }
  return entries;
}

const GPUS: CatalogEntry[] = [
  ['NVIDIA', 'GeForce RTX 5090', 'RTX 5090', 32, 1999],
  ['NVIDIA', 'GeForce RTX 5080', 'RTX 5080', 16, 999],
  ['NVIDIA', 'GeForce RTX 5070 Ti', 'RTX 5070 Ti', 16, 749],
  ['NVIDIA', 'GeForce RTX 5070', 'RTX 5070', 12, 549],
  ['NVIDIA', 'GeForce RTX 5060 Ti', 'RTX 5060 Ti', 16, 429],
  ['AMD', 'Radeon RX 9070 XT', 'RX 9070 XT', 16, 599],
  ['AMD', 'Radeon RX 9070', 'RX 9070', 16, 549],
  ['AMD', 'Radeon RX 9060 XT', 'RX 9060 XT', 16, 349],
  ['Intel', 'Arc B580', 'Arc B580', 12, 249],
].map(([brand, model, chipset, vram, base]) => ({
  category: 'gpu',
  brand: brand as string,
  model: model as string,
  name: `${brand} ${model} ${vram}GB`,
  mpn: `${(chipset as string).replace(/\s+/g, '')}-${vram}G`,
  specs: { chipset, vram_gb: vram },
  basePrice: base as number,
  // Cards carry GDDR, so board partners repriced too — but less than DIMMs.
  shortageBeta: 0.42,
}));

const CPUS: CatalogEntry[] = [
  ['AMD', 'Ryzen 9 9950X3D', 'AM5', 16, 699],
  ['AMD', 'Ryzen 7 9800X3D', 'AM5', 8, 479],
  ['AMD', 'Ryzen 5 9600X', 'AM5', 6, 249],
  ['Intel', 'Core Ultra 9 285K', 'LGA1851', 24, 589],
  ['Intel', 'Core Ultra 7 265K', 'LGA1851', 20, 399],
  ['Intel', 'Core Ultra 5 245K', 'LGA1851', 14, 309],
].map(([brand, model, socket, cores, base]) => ({
  category: 'cpu',
  brand: brand as string,
  model: model as string,
  name: `${brand} ${model}`,
  mpn: `${(model as string).replace(/\s+/g, '')}`,
  specs: { socket, cores },
  basePrice: base as number,
  shortageBeta: 0.05,
}));

const SSDS: CatalogEntry[] = [
  ['Samsung', '990 Pro', 1000, 'PCIe 4.0 x4', 109],
  ['Samsung', '990 Pro', 2000, 'PCIe 4.0 x4', 189],
  ['Samsung', '9100 Pro', 2000, 'PCIe 5.0 x4', 249],
  ['WD', 'Black SN850X', 1000, 'PCIe 4.0 x4', 99],
  ['WD', 'Black SN850X', 2000, 'PCIe 4.0 x4', 169],
  ['Crucial', 'T705', 2000, 'PCIe 5.0 x4', 239],
  ['Crucial', 'P310', 1000, 'PCIe 4.0 x4', 79],
  ['SK hynix', 'Platinum P41', 2000, 'PCIe 4.0 x4', 159],
].map(([brand, model, capacity, iface, base]) => ({
  category: 'ssd',
  brand: brand as string,
  model: model as string,
  name: `${brand} ${model} ${(capacity as number) >= 1000 ? `${(capacity as number) / 1000}TB` : `${capacity}GB`} NVMe SSD`,
  mpn: `${(model as string).replace(/\s+/g, '')}-${capacity}`,
  specs: { capacity_gb: capacity, interface: iface },
  basePrice: base as number,
  // NAND is tightening alongside DRAM, but nowhere near as violently.
  shortageBeta: 0.38,
}));

const BOARDS: CatalogEntry[] = [
  ['ASUS', 'ROG Strix X870E-E', 'AM5', 'ATX', 499],
  ['ASUS', 'TUF Gaming B850-Plus', 'AM5', 'ATX', 209],
  ['MSI', 'MAG X870 Tomahawk', 'AM5', 'ATX', 289],
  ['Gigabyte', 'Z890 Aorus Elite', 'LGA1851', 'ATX', 279],
  ['ASRock', 'B860M Pro-A', 'LGA1851', 'mATX', 149],
].map(([brand, model, socket, form, base]) => ({
  category: 'motherboard',
  brand: brand as string,
  model: model as string,
  name: `${brand} ${model}`,
  mpn: `${(model as string).replace(/\s+/g, '')}`,
  specs: { socket, form_factor: form },
  basePrice: base as number,
  shortageBeta: 0.03,
}));

const PSUS: CatalogEntry[] = [
  ['Corsair', 'RM1000x', 1000, '80+ Gold', 199],
  ['Corsair', 'RM850x', 850, '80+ Gold', 149],
  ['Seasonic', 'Vertex GX-1000', 1000, '80+ Gold', 189],
  ['be quiet!', 'Pure Power 12 M', 750, '80+ Gold', 119],
  ['EVGA', 'SuperNOVA 1200 P6', 1200, '80+ Platinum', 259],
].map(([brand, model, watts, efficiency, base]) => ({
  category: 'psu',
  brand: brand as string,
  model: model as string,
  name: `${brand} ${model} ${watts}W`,
  mpn: `${(model as string).replace(/\s+/g, '')}-${watts}`,
  specs: { wattage: watts, efficiency },
  basePrice: base as number,
  shortageBeta: 0.02,
}));

// --- shortage curve --------------------------------------------------------

const DAYS = 90;
const DAY_MS = 86_400_000;

/**
 * Multiplier applied to a part's base price `daysAgo` days back.
 *
 * Shape: prices climb steeply through the window and flatten slightly in the
 * last fortnight, matching the 2026 DRAM curve. `beta` scales how much of that
 * a given category absorbs.
 */
function shortageMultiplier(daysAgo: number, beta: number): number {
  const t = (DAYS - daysAgo) / DAYS; // 0 at the oldest point, 1 today
  const curve = 1 + 1.35 * Math.pow(t, 1.7) - 0.12 * Math.pow(t, 4);
  return 1 + (curve - 1) * beta;
}

function isoAt(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * DAY_MS).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// --- per-store behaviour ---------------------------------------------------

interface StoreProfile {
  /** Multiplier on the reference price — who runs cheap, who runs dear. */
  priceBias: number;
  /** Probability an offer is out of stock, before category scarcity. */
  scarcity: number;
  shipping: number;
  pickup: boolean;
}

const STORE_PROFILES: Record<string, StoreProfile> = {
  newegg: { priceBias: 0.99, scarcity: 0.18, shipping: 0, pickup: false },
  bestbuy: { priceBias: 1.05, scarcity: 0.3, shipping: 0, pickup: true },
  amazon: { priceBias: 1.02, scarcity: 0.14, shipping: 0, pickup: false },
  microcenter: { priceBias: 0.95, scarcity: 0.42, shipping: 999, pickup: true },
  bhphoto: { priceBias: 1.03, scarcity: 0.22, shipping: 0, pickup: false },
  ebay: { priceBias: 1.28, scarcity: 0.08, shipping: 0, pickup: false },
};

function stockFor(scarcity: number): SeedOffer['stockStatus'] {
  const roll = rng();
  if (roll < scarcity * 0.72) return 'out_of_stock';
  if (roll < scarcity) return rng() < 0.4 ? 'backorder' : 'preorder';
  if (roll < scarcity + 0.16) return 'limited';
  return 'in_stock';
}

function buildProduct(entry: CatalogEntry, index: number): SeedProduct {
  const slug = `${entry.brand}-${entry.model}-${entry.mpn}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const offers: SeedOffer[] = [];
  const history: SeedProduct['history'] = {};

  // Not every store carries every SKU.
  const carriers = STORES.filter(() => rng() > 0.18);
  const storesForProduct = carriers.length >= 3 ? carriers : STORES.slice(0, 4);

  for (const store of storesForProduct) {
    const profile = STORE_PROFILES[store.slug];
    const todayMultiplier = shortageMultiplier(0, entry.shortageBeta);
    const reference = entry.basePrice * todayMultiplier * profile.priceBias;
    const price = Math.round(jitter(reference, 0.045) * 100) / 100;

    // Scarcity tracks the shortage: memory is far harder to find than a PSU.
    const scarcity = Math.min(0.85, profile.scarcity * (1 + entry.shortageBeta * 1.4));
    const stockStatus = stockFor(scarcity);
    const buyable = stockStatus === 'in_stock' || stockStatus === 'limited';

    const points: { observedAt: string; priceCents: number | null; stockStatus: string }[] = [];
    let previousStatus: string | null = null;

    for (let daysAgo = DAYS; daysAgo >= 0; daysAgo -= 3) {
      const multiplier = shortageMultiplier(daysAgo, entry.shortageBeta);
      const historical = entry.basePrice * multiplier * profile.priceBias;
      const observedPrice = Math.round(jitter(historical, 0.03) * 100);

      const status =
        daysAgo === 0
          ? stockStatus
          : rng() < scarcity * 0.8
            ? 'out_of_stock'
            : rng() < 0.18
              ? 'limited'
              : 'in_stock';

      // Only record a point when something actually moved, mirroring what the
      // live ingest pipeline writes.
      const priceMoved =
        points.length === 0 || Math.abs((points[points.length - 1].priceCents ?? 0) - observedPrice) > 50;
      if (priceMoved || status !== previousStatus) {
        points.push({
          observedAt: isoAt(daysAgo),
          priceCents: status === 'out_of_stock' && rng() < 0.25 ? null : observedPrice,
          stockStatus: status,
        });
        previousStatus = status;
      }
    }

    history[store.slug] = points;

    offers.push({
      storeSlug: store.slug,
      url: `${store.homepage}/product/${slug}`,
      storeSku: `${store.slug.slice(0, 3).toUpperCase()}${100000 + index * 7 + STORES.indexOf(store)}`,
      priceCents: stockStatus === 'out_of_stock' && rng() < 0.3 ? null : Math.round(price * 100),
      listPriceCents: Math.round(entry.basePrice * 100),
      shippingCents: buyable ? profile.shipping : 0,
      stockStatus,
      stockQty: stockStatus === 'limited' ? 1 + Math.floor(rng() * 4) : null,
      pickupAvailable: profile.pickup ? rng() > 0.5 : null,
      // Retailers rationed memory hard during the shortage.
      limitPerOrder: entry.category === 'ram' && buyable && rng() < 0.45 ? pick([1, 2]) : null,
      condition: store.slug === 'ebay' && rng() < 0.25 ? 'used' : 'new',
    });
  }

  return {
    slug,
    category: entry.category,
    brand: entry.brand,
    model: entry.model,
    name: entry.name,
    mpn: entry.mpn,
    upc: null,
    specs: entry.specs,
    offers,
    history,
  };
}

/**
 * DDR5 16Gb spot price series. Shaped to the shortage TrendForce reported
 * through 2026 — the mid-$40s session average with daily highs into the $60s.
 * Synthetic values, real shape; labelled as sample data in the UI.
 */
function marketSeries(): SeedBundle['marketSeries'] {
  const points: SeedBundle['marketSeries'] = [];
  for (let daysAgo = 180; daysAgo >= 0; daysAgo -= 2) {
    const t = (180 - daysAgo) / 180;
    const value = 18 + 30 * Math.pow(t, 1.6) + Math.sin(t * 11) * 1.4 + (rng() - 0.5) * 1.2;
    points.push({
      seriesKey: 'dram_ddr5_16gb_spot',
      label: 'DDR5 16Gb spot (USD)',
      observedOn: new Date(Date.now() - daysAgo * DAY_MS).toISOString().slice(0, 10),
      value: Math.round(value * 100) / 100,
      unit: 'USD',
      source: 'sample',
    });
  }
  return points;
}

// --- emit ------------------------------------------------------------------

function main(): void {
  const catalog: CatalogEntry[] = [
    ...ramCatalog(),
    ...GPUS,
    ...CPUS,
    ...SSDS,
    ...BOARDS,
    ...PSUS,
  ];

  const bundle: SeedBundle = {
    generatedAt: new Date().toISOString(),
    stores: STORES,
    products: catalog.map(buildProduct),
    marketSeries: marketSeries(),
  };

  const outPath = path.join(process.cwd(), 'data', 'seed', 'catalog.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(bundle, null, 2)}\n`);

  const offerCount = bundle.products.reduce((sum, p) => sum + p.offers.length, 0);
  console.log(
    `Wrote ${outPath}\n  ${bundle.products.length} products, ${offerCount} offers, ` +
      `${bundle.marketSeries.length} index points`,
  );
}

main();
