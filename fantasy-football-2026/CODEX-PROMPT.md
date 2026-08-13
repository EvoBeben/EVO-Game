# Prompt for rebuilding this app elsewhere

Paste the block below into Codex. Everything expensive about building this the first
time was *discovery* — which data hosts are reachable, a name collision that silently
corrupts two players' careers, five palette attempts before one stuck. The prompt hands
all of that over as constants so none of it gets rediscovered.

What it does not carry is the editorial content (tiers, prose, player notes). That is
~100 players of judgement; specifying it inline would make the prompt longer than the
app. The prompt gives a bounded research budget instead and tells Codex to keep the
structure even where its rankings differ.

---

```
Build a single-file, self-contained fantasy football draft app: one index.html plus one
build script. No framework, no CDN, no runtime network calls. Work to the spec below and
do not explore alternatives — every constant here was verified and re-deriving it is the
expensive part.

BUDGET
Minimise tokens. Do not read files you just wrote. Do not print file contents to reason
about them — grep for the line you need. Cap research at 6 web searches total. Do not
iterate on visual design; the palette and type are pinned below. One build script run is
enough; it prints a summary, do not dump its output.

ARCHITECTURE
- index.html holds everything: styles, markup, data, script. No external requests — a
  strict CSP blocks them, so all data must be embedded.
- Hash router. Each section is <div class="view" id="v-<name>">, all in the DOM, only one
  with class "active" (display:block; others display:none). window.onhashchange swaps.
- Inside a section, tabbed panels: <button class="tab" aria-controls="p-x"> paired with
  <div class="panel" id="p-x">. Exactly one panel per view has "active", and it must be
  the one the FIRST tab controls. Reset to the first tab whenever a view is entered.
- Landing view is an index of buttons linking to each section by hash.
- Layout invariant: with everything closed, no panel may exceed the viewport at 1280x800
  or 1440x900. Verify this, do not assume it.

SECTIONS
Recap, Strategy, Running Back, Wide Receiver, Tight End, Quarterback, Defense, Kicker,
Draft Plan, Mock Drafts, Sources. Position sections run tabs: Board, Moves, Names,
Rookies, Gems. Defense runs Board, Moves, Streamers. Kicker runs Board, 2025, Streamers.
Board is always the landing tab. Defense lists all 32 teams; rank the top tier from
sources and pool the rest alphabetically, stating plainly that they are unranked because
public rankings stop separating defenses that deep.

DATA — this is the part worth reading twice
Real per-player stats are available and free:
  https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_reg_<YEAR>.csv
Seasons 2013-2025 cover any current player. 143 columns, schema identical across all
years. Fetch with curl -sSL, cache to a gitignored .cache/, ~800KB per season.

Most fantasy sites (FantasyPros, ESPN, PFF, Wikipedia, pro-football-reference) return 403
to direct fetches. Do not waste calls on them; use web search for editorial content and
nflverse for numbers.

Gotchas that will silently corrupt output if ignored:
1. KEY ON player_id, NOT display name. The data contains a 2014 center named Josh Allen
   and a cornerback named Lamar Jackson. Matching by name merges them into the
   quarterbacks' careers and nothing errors. When a name maps to several ids, pick the
   one with a skill position (QB/RB/FB/WR/TE) and the most career fantasy points, and log
   every collision resolved.
2. nflverse does NOT score kickers — fantasy_points_ppr is meaningless for them. Compute
   from distance buckets: 3 points for fg_made_0_19 + 20_29 + 30_39, 4 for fg_made_40_49,
   5 for fg_made_50_59 + fg_made_60_, 1 per pat_made. (Sanity check: this puts Tyler Loop
   12th and Chase McLaughlin 7th in 2025, which matches published rankings.)
3. Kickers need their own row layout and their own column map in the UI. A career
   "longest field goal" is the MAX across seasons, not the sum.
4. These page spellings differ from nflverse: Chris Rodriguez -> Chris Rodriguez Jr.,
   D.J. Moore -> DJ Moore, Kenneth Gainwell -> Kenny Gainwell, Michael Pittman Jr. ->
   Michael Pittman, Travis Etienne Jr. -> Travis Etienne.
5. Incoming rookies and some depth players have no nflverse row. That is correct, not a
   failure. Emit them with a short reason ("Enters the league in <year> — no NFL stats
   yet") so the UI prints the reason instead of a row of zeroes.
6. All 32 team nicknames and any coach names must be excluded from player resolution.

BUILD SCRIPT (build-data.py)
One pass that does both jobs so markup and data cannot drift:
- Scrape player names out of index.html's own markup (the name-bearing selectors), not a
  separate list.
- Resolve each against the season files; emit per-season rows plus a career total as
  compact arrays under short keys, embedded as
  <script type="application/json" id="player-data">.
- Wrap each resolved name in <button class="pl" data-p="slug">. Strip existing wrappers
  first so re-running is idempotent.
- FAIL LOUDLY with a non-zero exit and the offending string if a name resolves to
  nothing. A silent fallback is how a blank or wrong stat sheet ships. Test this by
  feeding it a fake name and confirming it writes nothing.
- Content edits must be made against UNWRAPPED markup. Once names are wrapped in
  buttons, any find-and-replace spanning a player name silently fails to match.

PLAYER SHEETS
Every resolved name is clickable and expands IN PLACE, showing last season and career
side by side with a season-by-season table beneath. One sheet element, relocated on
click rather than duplicated. The insertion point depends on context: after the enclosing
tier row; as a new <tr> with a colspan cell inside tables; spanning the grid after a
card. Mock-draft lists are a column-flow grid where an inline insert reorders the picks —
attach after the whole list there. One open at a time; Escape and re-click close it;
buttons carry aria-expanded.

DESIGN — pinned, do not iterate
Dark, single theme. Warm near-black ground #0C0907 with a soft radial bloom; no pure
black. Structure comes from hairline rules and whitespace, not nested boxes — one border
radius in the whole system, one filled surface.
Type: system sans for headings in heavy uppercase, system sans for body, monospace for
labels, stats and team codes. No webfonts (CSP blocks them; a silent fallback is worse
than choosing the stack).
Five position hues, fall-toned: QB #C2603C, RB #9CAE58, WR #D9A441, TE #BE7FA8,
DST #94856C. Amber doubles as house chrome. Each section rebinds --pc so its accent flows
to headings, tab underline, chips and any sheet opened from it.
Text tones: bone #F2EDE3, body #DAD3C5, muted #A79C88, dim #8E8371.
Every foreground must clear 4.5:1 on the ground — verify with a script, do not eyeball.
The "dim" tone carries team codes and round numbers and has slipped under AA repeatedly;
check it specifically.

VERIFY BEFORE CLAIMING DONE
Headless browser, not inspection:
- every hash route resolves; every tab activates exactly one panel
- player sheets open from every context and close on Escape
- no panel exceeds the viewport at 1280x800 and 1440x900
- the build script exits non-zero on an unresolvable name
- generated numbers reproduce any figure asserted in the prose; if they disagree, the
  prose is wrong
Report what actually passed. Do not report success for anything you did not run.
```

---

## What this does and does not guarantee

It reproduces the architecture, the data pipeline, the interaction model and the visual
system exactly. It will not reproduce the editorial content word for word — rankings and
notes are judgement, and Codex will reach its own. The structure holds either way.

The single highest-value paragraph is the collision warning. That bug produced a
plausible-looking Josh Allen career starting in 2014, four years before he was drafted,
and nothing anywhere errored.
