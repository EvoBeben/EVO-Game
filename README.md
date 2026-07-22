# TechPulse 📡

A **single-project, zero-dependency Node.js web app** that finds and ranks the
**top 10 trending tech & gaming items right now** — GPUs, CPUs and AI chips,
consoles and handhelds, games, phones, and software — by aggregating **live,
key-free public signals** into a weighted **buzz score**. It also generates a
**multi-page printable PDF report** of the same data.

It answers one question: *what tech is worth attention right now, and why?*

> **Disclaimer:** For research and general interest only — **not** purchasing,
> financial, or investment advice. The buzz score measures online *attention*,
> which is not the same as quality, reliability, or value. A persistent
> disclaimer is shown on both the dashboard and every page of the report.

---

## Quick start

```bash
npm start          # or: node server.js
# → TechPulse running at http://localhost:3000
```

- **Dashboard:** <http://localhost:3000/>
- **Printable report:** <http://localhost:3000/report>
- **JSON API:** <http://localhost:3000/api/dashboard>

Requires **Node ≥ 18** (uses the global `fetch`). No `npm install`, no
frameworks, no chart libraries — only Node built-ins (`node:http`, `node:fs`,
`node:path`, `fetch`). Set a custom port with `PORT=8080 npm start`.

---

## How it works

All external data is fetched **server-side** (so the browser never hits CORS),
merged, scored, and cached in memory for **60 seconds** to respect rate limits.
Every source adapter is wrapped so a single failure logs a warning, returns
empty, and the app keeps going. **If every live source is unreachable, a clearly
labeled DEMO dataset is served** (`demo: true`) with a banner on both surfaces —
demo data is never presented as live.

### Two-phase scoring pipeline

1. **Cheap batch phase** — pull Hacker News front page + a broad tech search,
   Reddit *hot* across ~10 subreddits, and a broad Google News tech feed. Match
   every catalog item against those titles and compute a preliminary attention
   score. Keep the **top ~18 candidates**.
2. **Enrichment phase** — for those candidates only, fetch the expensive
   per-item signals: **Wikipedia daily pageviews** (the primary metric + the
   30-day chart series), a per-item Google News search (headline count), and
   GitHub stars for software/AI items. Re-score and keep the **10 highest-buzz
   items that actually have Wikipedia data**.

### Item matching

Catalog items are matched against messy source text three ways, with a stopword
guard so common words never produce false hits:

- **Full name** — e.g. `Grand Theft Auto VI`.
- **Bare identifiers / aliases** — e.g. `GTA 6`, `RTX 5090`, `Switch 2`, matched
  on word boundaries.
- **Strict items** — genuinely ambiguous names only match on full/multiword
  forms to avoid false positives.

---

## Scoring formula

Each signal is normalized to **0–100** across the ranked set (relative to the
current max), then combined:

```
buzz = 3.0·HN  +  2.5·Reddit  +  2.0·News  +  1.5·Wikipedia
```

…and the weighted sum is rescaled to **0–100** for display. Weights favor the
signals that best reflect genuine, active discussion (HN, Reddit) over passive
volume (news, pageviews).

- **HN signal** = Σ `points + 2·comments` over matching stories.
- **Reddit signal** = Σ `score + 2·comments` over matching posts.
- **News signal** = count of recent matching articles.
- **Wikipedia signal** = 7-day pageview total (also the displayed core metric).

The **industry-heat gauge** (0–100) is a separate context reading derived from
aggregate HN + Reddit + news volume (Cool / Warm / Hot / Overheated).

The report's **decision-framing page** adds a *conviction score* = 50% buzz
strength + 30% cross-source confirmation (how many independent sources agree) +
20% weekly momentum, and screens for items confirmed by ≥ 2 sources with rising
curiosity.

---

## Data sources

All are **free and require no API key.**

| Source | Role | Field(s) read |
|---|---|---|
| **Hacker News** (Algolia API) | Attention / developer buzz | `points`, `num_comments`, `title` |
| **Reddit** (`r/hardware`, `r/gadgets`, `r/pcgaming`, `r/Games`, `r/technology`, `r/nvidia`, `r/Amd`, `r/intel`, `r/buildapc`, `r/GamingLeaksAndRumours`) | Attention / community interest | `score`, `num_comments`, `title` |
| **Wikipedia Pageviews** (Wikimedia REST) | **Primary metric + 30-day time series** | daily `views` |
| **Google News RSS** | Attention / news volume + headlines | item count, `title`, `source`, `link` |
| **GitHub Search** | Developer interest (software / AI items) | repository `stargazers_count` |

> **Note on running in a sandboxed/offline environment:** some networks block
> outbound access to these hosts. When that happens you'll see `[warn] source …
> failed` lines and the app serves the labeled demo dataset — this is expected
> and correct. Run it on a machine with normal outbound internet to see live
> data.

---

## The report (7 fixed A4 pages)

Served at `/report`, print-first CSS, light theme (reads well printed), built
from the **same** `/api/dashboard` payload. The **Save as PDF** button calls
`window.print()`.

1. **Cover** — title, date, LIVE/DEMO tag, auto-written executive summary,
   headline stats, industry-heat gauge, and "top 3 to watch".
2. **Full ranked leaderboard** — core metric, weekly deltas, buzz, sources, and
   the maker/bias behind each item.
3. **Breakdown** — leaders vs laggards bars, most-discussed threads, and a
   source-contribution chart.
4. **Wikipedia deep-dive** — the primary source in detail, ranked pageviews, and
   what it can/can't tell you.
5. **Decision framing** — *"Worth paying attention to right now?"* — items that
   screen for cross-confirmed momentum, ranked by conviction, with a prominent
   caution.
6. **Per-item detail cards** — each with its own 30-day chart and the normalized
   signals behind its score.
7. **Methodology** — the formula, full source table, limitations, and the
   disclaimer.

---

## Dashboard

Served at `/`. Header with auto-refresh toggle (re-fetches every 60s), manual
refresh, light/dark theme toggle, and a link to the report. Below: summary stat
tiles (incl. the heat gauge), a combined attention chart (Wikipedia series
indexed to 100 at start, with a hover crosshair/tooltip and clickable legend to
toggle series), the ranked top-10 leaderboard (rank, name, sparkline, metric,
delta, buzz, source badges), and a per-item chart grid.

All charts are **hand-drawn on `<canvas>`** — HiDPI-aware, theme-aware, and
accessible (legends + labels, never color alone). The categorical palette is a
CVD-validated set applied in fixed slot order.

---

## Project layout

```
server.js        zero-dep server: source adapters, catalog, scoring, cache, API + static
demo-data.js     labeled offline fallback dataset (served only if all live sources fail)
package.json     npm start → node server.js
public/
  index.html     dashboard markup
  styles.css     dashboard styles (light/dark, responsive)
  app.js         dashboard logic + canvas charts
  report.html    printable report markup
  report.css     print-first A4 styles (7 pages)
  report.js      report builder (7 pages from /api/dashboard)
README.md        this file
```

---

## License

MIT.
