# Playtest — EVO-Game (Krillin, 2026-10-18)

**Repo:** EvoBeben/EVO-Game. "Draft Desk for Fantasy Football", a static single-page 2026 draft guide plus draft room (`fantasy-football-2026/`).

**Build tested:** live https://evofantasyfootball.vercel.app. Its `index.html` is byte-identical to main **541579b**. Played with Playwright Chromium on desktop (1280×800) and a 360×740 phone profile.

## Findings (worst first)
1. **P2 · LIVE-PLAYED: the shipped injury and depth data is stale.** Freshness reads "Rankings Jul 30, 2026 · Projections + injuries Aug 17, 2026 · Team reports Jul 25, 2026". Running the in-page live injury refresh (I triggered the button's click on the live page) returned "9422 records read, **172 status changes applied** (57 players cleared)". That refresh is in-memory only, and a reload returns to the August snapshot. Two months into the season, the guide shows wrong injury statuses by default.
2. **P2 · CODE-READ: ADP and "Board PPR" numbers are derived, not sourced.** `data/rankings-2026.json` `researchMethod` says ADP and ppr_projected_points are "DERIVED, not sourced", meaning they're fitted to the FantasyPros rank order. The UI flags this with "Board PPR*" and a method note, but the numbers look like real projections to a casual user.
3. **P3 · LIVE-PLAYED: compare inputs sit on a hidden sub-tab.** The compare search boxes (`#compare-player-1..3`) are inside a collapsed panel (`#p-lab-compare`). Adding players from the board's "Compare" buttons works (2 selected, rail count 2), but the type-to-compare inputs aren't visible from the main Lab view.
4. **Info · LIVE-PLAYED: these work.**
   - The home screen loads in under 300ms.
   - All 13 sections (#recap, #strategy, #rb, #mocks, #plan, #sources, …) render with no horizontal overflow at 360px.
   - Lab search ("Bijan" → 1 row) works.
   - Draft and Queue update the counts (585 available / 1 queued / 1 drafted).
   - State syncs to a second window and survives a reload.
   - "Reset draft room" asks for confirmation, then clears.
   - Player cards expand.
   - An unknown hash falls back to home.
   - 0 console errors and 0 HTTP ≥400.
5. **CODE-READ: tests pass.** `node --test tests/*.test.mjs` gives 15/15.

## Verdict
A polished, working draft tool. The content is frozen at the August preseason snapshot.

## Single biggest risk
Users act on a stale August injury and depth snapshot (172 status changes behind live Sleeper data) with no warning beyond the small freshness line.
