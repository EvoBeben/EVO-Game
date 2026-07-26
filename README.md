# RAM Watch

Cross-retailer **price and stock** comparison for PC components, built around the
2026 DRAM shortage.

Memory pricing is moving faster than any single retailer's page can tell you.
DRAM contract prices posted their steepest quarterly rise on record, retail kits
sell through in hours, and the same SKU can differ by a hundred dollars between
stores — when it's in stock at all. This puts every retailer's price *and*
availability for a given part on one page, tracks how both move, and shows the
DRAM spot index behind them.

Covers memory, GPUs, CPUs, SSDs, motherboards and power supplies across US
retailers.

---

## Quick start

```bash
npm install
npm run db:reset      # create data/prices.db from lib/db/schema.sql
npm run seed          # load the sample catalogue
npm run dev           # http://localhost:3000
```

That runs the whole site with **no API keys and no network**. Everything you see
is clearly-labelled sample data until you connect a real source — see below.

## What's on the site

| Route | What it does |
|---|---|
| `/` | DRAM spot index, biggest 7-day movers, back-in-stock, best memory by $/GB |
| `/c/[category]` | Filterable listing — facets are category-aware (DDR gen, speed, CAS for memory; chipset/VRAM for GPUs; interface for SSDs) |
| `/p/[slug]` | **The comparison view**: every retailer's price, shipping, landed total, stock state and last-checked age, plus 90 days of per-store price history |
| `/stores` | Which adapters are live, which are missing keys, and how the last run went |
| `/watchlist` | Device-local watchlist (localStorage, no account) |

JSON API: `/api/products`, `/api/products/[slug]`, `/api/market`, `/api/stores`,
`POST /api/refresh`.

## Connecting live data

Copy `.env.example` to `.env.local`, fill in what you have, then:

```bash
npm run refresh
```

`/stores` shows exactly what ran, what was skipped and why.

### Best Buy — recommended first source

The [Best Buy Products API](https://developer.bestbuy.com/) is free, official,
and reports price, sale price, online availability **and** in-store
availability. Register for a key and set `BESTBUY_API_KEY`. This is the quickest
route to real numbers on the board.

### eBay

Set `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET`. Useful during a shortage
specifically: when every first-party retailer is out of stock, the marketplace
shows what the part is actually changing hands for.

⚠️ Production access to the Browse API [requires eBay's
approval](https://developer.ebay.com/api-docs/buy/browse/overview.html). Without
it, set `EBAY_ENV=sandbox`.

### DRAM spot index

There is no free, official, machine-readable DRAM feed — TrendForce and
DRAMeXchange both gate their series behind paid subscriptions. Point
`DRAM_INDEX_URL` at whichever public TrendForce-derived tracker you have the
right to read; the adapter accepts `[{date, value}]` or `{series: [...]}`.
Unset, the dashboard shows the seeded sample series.

### HTML adapters (Newegg, Micro Center, B&H, Amazon) — off by default

These read public product pages rather than an API, and they are **disabled
unless you set `ENABLE_HTML_SOURCES=true`**.

Before you turn them on, understand what you are turning on:

- **Several of these retailers' terms of service prohibit automated
  collection.** Enabling this is your decision and your responsibility.
- Most of them sit behind bot protection and will challenge or block you.
- They are unsupported and will break when a retailer changes their markup.

When enabled, every request goes through `lib/sources/fetcher.ts`, which
enforces a robots.txt check per host, a per-host rate limit
(`SOURCE_RATE_LIMIT_MS`, default one request per 3s), an honest User-Agent, and
a response cache. A `robots.txt` disallow aborts that adapter rather than being
worked around. Set `SOURCE_CONTACT` so retailers can reach you.

Where a retailer publishes schema.org Product markup — most do, because Google
Shopping requires it — the adapter reads that structured data rather than
scraping the DOM.

## Scheduled refresh

`.github/workflows/refresh.yml` calls `POST /api/refresh` hourly against a
deployed instance. Set the `REFRESH_URL` and `REFRESH_TOKEN` repository secrets.
The endpoint stays closed unless `REFRESH_TOKEN` is configured — a refresh makes
outbound requests to every configured retailer, so it must not be open.

## How it fits together

```
lib/sources/*     adapters — each declares whether it's configured, returns RawOffer[]
      ↓
lib/match.ts      ties a listing to a canonical product (UPC → MPN → title, brand-vetoed)
      ↓
lib/ingest.ts     upserts offers, appends price history only when a reading moves
      ↓
lib/queries.ts    derived metrics: landed totals, $/GB, 7-day change, best offer
      ↓
app/*             server-rendered pages
```

Adding a retailer means implementing the `Source` interface in
`lib/sources/types.ts` and registering it in `lib/sources/registry.ts`. Nothing
else needs to change.

### Two prices, deliberately

- **`bestCents`** — the cheapest offer you can *actually buy*. This is the
  headline figure everywhere in the UI.
- **`lowestCents`** — the cheapest listed price including out-of-stock rows.
  Used only for the price-spread stat.

They differ whenever the cheapest listing is unavailable, which during this
shortage is most of the time.

## Sample data

Seeded rows are stored with `offers.is_sample = 1`, rendered with a **SAMPLE**
badge, and trigger a site-wide banner while no live source is configured. The
catalogue (brands, product lines, specs) is real; the prices, stock states and
history curves are synthetic shapes derived from the 2026 shortage, not observed
readings. Regenerate with `npm run gen-seed` — it's deterministic, so the file
diffs cleanly.

## Standalone single-file board

`npm run artifact` exports the current database and inlines it into
`artifact/board.html` — one self-contained file, no server, no external
requests, no network. Category filtering, search, sorting and the full store
comparison all work client-side; live refresh does not, since that needs the
running app.

Useful for sharing a view of the board with someone who can't run the project.
`artifact/template.html` is the source; `snapshot.json` and `board.html` are
generated and gitignored.

## Development

```bash
npm test          # unit tests — parsers, matcher, derived metrics, ingest
npm run typecheck
npm run build
npm run refresh -- --only=bestbuy   # run a single adapter
npm run artifact                    # rebuild the standalone board
```

Adapter parsers are tested against checked-in response fixtures in
`tests/fixtures/`, so the suite never touches the network.

### Charts

Series colours are palette slots (`stores.series_slot`), not retailer brand
hexes — Newegg orange and Amazon orange are indistinguishable on a chart. The
six slots in `app/globals.css` were run through a colour-vision validator for
both light and dark surfaces. If you add a seventh store, take the next slot
from the reference palette and re-validate rather than inventing a hue.

## Caveats

- Prices and stock are snapshots and go stale immediately. Always confirm on the
  retailer's page before buying — the UI shows the age of every reading.
- Coverage is only as good as your configured sources. With no keys set, the
  site is a demo.
- Product matching is conservative: a listing that can't be tied to a catalogue
  entry with confidence lands in `unmatched_offers` rather than being attached
  to the wrong product.
