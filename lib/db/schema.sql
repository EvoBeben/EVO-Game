-- Tech price & stock aggregator schema.
--
-- Money is stored as integer cents throughout; never floats. Timestamps are
-- ISO-8601 UTC strings so they sort lexicographically in SQL.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Canonical products. One row per real-world SKU, independent of who sells it.
CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  category    TEXT NOT NULL,          -- ram | gpu | cpu | ssd | motherboard | psu
  brand       TEXT NOT NULL,
  model       TEXT NOT NULL,
  name        TEXT NOT NULL,
  mpn         TEXT,                   -- manufacturer part number, best match key
  upc         TEXT,
  specs       TEXT NOT NULL DEFAULT '{}',  -- JSON; category-specific attributes
  image_url   TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_mpn ON products (mpn) WHERE mpn IS NOT NULL;

-- Retailers we pull from. `source_key` ties a store to its adapter in lib/sources.
CREATE TABLE IF NOT EXISTS stores (
  id             INTEGER PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  homepage       TEXT NOT NULL,
  source_key     TEXT NOT NULL,
  region         TEXT NOT NULL DEFAULT 'US',
  -- Categorical palette slot (1-8), not a brand colour. Retailer brand hexes
  -- are not a validated palette — Newegg orange and Amazon orange are
  -- indistinguishable on a chart. The slot is fixed per store so filtering a
  -- series out never repaints the survivors, and each mode resolves the slot
  -- to its own validated step in CSS.
  series_slot    INTEGER NOT NULL DEFAULT 1,
  is_marketplace INTEGER NOT NULL DEFAULT 0
);

-- A store's current listing for a product. One row per (product, store, condition).
CREATE TABLE IF NOT EXISTS offers (
  id               INTEGER PRIMARY KEY,
  product_id       INTEGER NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  store_id         INTEGER NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  store_sku        TEXT,
  url              TEXT NOT NULL,
  condition        TEXT NOT NULL DEFAULT 'new',   -- new | refurbished | used | open_box
  price_cents      INTEGER,                        -- null when unpriced/unavailable
  list_price_cents INTEGER,                        -- MSRP or was-price, for discount %
  shipping_cents   INTEGER NOT NULL DEFAULT 0,     -- 0 = free shipping
  currency         TEXT NOT NULL DEFAULT 'USD',
  stock_status     TEXT NOT NULL DEFAULT 'unknown',
  stock_qty        INTEGER,
  pickup_available INTEGER,                        -- null = store doesn't report it
  limit_per_order  INTEGER,
  is_sample        INTEGER NOT NULL DEFAULT 0,     -- 1 = seeded demo row, not live
  first_seen_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  last_seen_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (product_id, store_id, condition)
);

CREATE INDEX IF NOT EXISTS idx_offers_product ON offers (product_id);
CREATE INDEX IF NOT EXISTS idx_offers_store ON offers (store_id);
CREATE INDEX IF NOT EXISTS idx_offers_price ON offers (price_cents) WHERE price_cents IS NOT NULL;

-- Append-only observation log. Every refresh that sees a changed price or stock
-- state writes a row; this is what the history charts and movers read.
CREATE TABLE IF NOT EXISTS price_points (
  id           INTEGER PRIMARY KEY,
  offer_id     INTEGER NOT NULL REFERENCES offers (id) ON DELETE CASCADE,
  price_cents  INTEGER,
  stock_status TEXT NOT NULL DEFAULT 'unknown',
  observed_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_price_points_offer_time ON price_points (offer_id, observed_at);

-- Market backdrop: DRAM spot/contract index series.
CREATE TABLE IF NOT EXISTS market_series (
  id          INTEGER PRIMARY KEY,
  series_key  TEXT NOT NULL,
  label       TEXT NOT NULL,
  observed_on TEXT NOT NULL,   -- YYYY-MM-DD
  value       REAL NOT NULL,
  unit        TEXT NOT NULL DEFAULT 'USD',
  source      TEXT NOT NULL,
  UNIQUE (series_key, observed_on)
);

-- One row per adapter execution. Powers the /stores transparency page.
CREATE TABLE IF NOT EXISTS source_runs (
  id             INTEGER PRIMARY KEY,
  source_key     TEXT NOT NULL,
  started_at     TEXT NOT NULL,
  finished_at    TEXT,
  status         TEXT NOT NULL,   -- ok | skipped | error
  detail         TEXT,            -- reason for skip, or error message
  offers_seen    INTEGER NOT NULL DEFAULT 0,
  offers_upserted INTEGER NOT NULL DEFAULT 0,
  unmatched      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_source_runs_key_time ON source_runs (source_key, started_at DESC);

-- Raw offers the matcher could not tie to a canonical product. Kept so catalog
-- gaps are visible instead of silently dropped.
CREATE TABLE IF NOT EXISTS unmatched_offers (
  id          INTEGER PRIMARY KEY,
  source_key  TEXT NOT NULL,
  title       TEXT NOT NULL,
  mpn         TEXT,
  url         TEXT,
  price_cents INTEGER,
  seen_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
