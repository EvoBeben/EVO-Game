# Daily update prompt

Copy the block below into a fresh session pointed at this repo. It is written to
keep the recurring cost low: no full-file reads, a hard cap on searches, and an
immediate exit when nothing has changed.

```
Update /home/user/EVO-Game/fantasy-football-2026/index.html (2026 fantasy football dashboard). Minimal-cost daily refresh.

RULES
- Do NOT Read the file. Grep to locate, Edit to change. No rewrite, no redesign, no rewording of untouched text.
- Max 2 WebSearch calls, issued in parallel. Add a 3rd only if one surfaces a trade or a top-40 injury.
- Sources: NFL.com, ESPN, CBS, PFF, Yahoo, RotoWire, NBC Sports only.
- If nothing material changed: reply "NO CHANGES", make no edits, no commit, stop.

WATCH (only these move the page)
Mahomes (fully cleared 1 Aug; only a setback moves the page) | Nabers Week 1 status (trending yes) | Charbonnet return (Oct-Nov; earlier would cut Jadarian Price) | Rashee Rice (cleared for camp; watch return to team drills) | JAX RB split (Tuten leading; Rodriguez foot) | ARI RB split (Allgeier opened with starters over Love — the live one) | CHI WR split (Odunze/Burden/Loveland) | Brian Thomas Jr role | IND WR (Pierce due back first half of August; would cut Downs) | Raiders QB (Cousins named starter; a change would move Bowers and Mendoza) | defense: any Tier 1 unit losing a starter to IR | any trade, IR or suspension for a player named on the page

IF CHANGED
1. Edit only the affected lines. House voice: short claims, no adjectives, numbers where you have them.
2. Edit "1 August 2026" -> today's date, replace_all (3 occurrences: hero kicker, sources note, footer).
3. Republish: Artifact tool, that file_path, url https://claude.ai/code/artifact/b83b0771-0cda-4cb9-95cd-51cc2fd5342f, favicon 🏈
4. Commit and push to branch claude/fantasy-football-breakdown-t9bnfk.
5. Reply: one line per change, nothing else.
```

## Why this is cheap

- **No full-file read.** The file is ~1,200 lines; reading it costs more than every
  search combined. Grep returns only matching lines, and Edit needs nothing else.
- **Bounded research.** Two parallel searches covers the watchlist on a normal day.
- **Free no-op.** Most days nothing moves. The prompt exits before touching the repo,
  so a quiet day costs two searches and one line of output.
- **Named anchors.** The date string and its three locations are spelled out, so
  there is no hunting.

## Page structure

The page is an indexed app, not a scroll: a table-of-contents landing view opens
into nine section views, each split into tabbed panels. Views are `.view` divs
with `id="v-<section>"`, routed by URL hash. Panels are `.panel` divs wired to
tab buttons via `aria-controls`. An edit to a player almost always lands inside
one panel — grep the player's name and you are already in the right place.

Position sections run Board, Moves, Names, Rookies, Gems (quarterback has no
Names panel; defense runs Board, Moves, Streamers). Board is the landing tab. If you add or remove a panel, keep the
tab button's `aria-controls` and the panel's `id` in sync; exactly one panel per
view carries the `active` class, and it must be the one the first tab controls.

## Player stats

`python3 build-data.py` embeds real per-season and career stats from nflverse and
wraps every player name in a clickable button. Content and data are generated in
one pass, so they cannot drift. Season CSVs cache in `.cache/` (gitignored), so
repeat builds are offline-fast.

Run it after adding or renaming any player. It **fails loudly** on a name it cannot
resolve rather than shipping a blank sheet — fix by adding the name to `NON_PLAYERS`
(teams, coaches), `ALIASES` (page spelling vs nflverse spelling), or `NO_STATS`
(no NFL line yet, with the reason). It also reports any name collision it resolved;
the data contains a different Josh Allen and a different Lamar Jackson.

## When the season starts

Swap the WATCH list for in-season concerns — snap counts, target share, waiver adds —
and drop the ADP and draft-plan sections from scope. Draft-day content stops being
useful the moment your league drafts.
