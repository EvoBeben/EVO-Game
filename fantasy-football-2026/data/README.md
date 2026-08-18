# Merged football data

This directory keeps the Player Lab inputs auditable and independent of the UI.

| File | Records | Provenance |
| --- | ---: | --- |
| `rankings-2026.json` | 144 players | Copied from `EvoBeben/Bebo-FantasyFootball`, branch `claude/fantasy-football-draft-assistant-kj82xs`. The positional order is based on the FantasyPros 2026 cheat sheet. Its `adp` and `ppr_projected_points` fields are derived/calibrated values, not vendor projections. |
| `sleeper-projections-2026.json` | 634 players/units | Static snapshot combining Sleeper's 2026 regular-season projections with its NFL player directory. The merged fields include active/roster status, depth-chart position and order, number, age, college, and search rank. The projection feed identifies Rotowire as its projection company. |
| `who-to-watch-2026.json` | 12 notes | Copied from the Bebo draft-assistant branch. |
| `draft-tips-2026.json` | 18 notes | Copied from the Bebo draft-assistant branch and written for its stated 12-team full-PPR league settings. |
| `sources-bebo.json` | 8 outlets | Source allowlist and methodology copied from the Bebo draft-assistant branch. |
| `team-reports-2026.json` | 32 teams | All team JSON reports copied from `EvoBeben/EVO-Game`, branch `claude/chicago-bears-news-pdf-dfi2c3`. |
| `espn-league-history.json` | 2 seasons | Authenticated ESPN league archive snapshot for league `1634171350`: final standings plus PINOY BOYZ end-of-season rosters and player scoring for 2025 and 2024. Missing archive fields remain `null`; roster rows are not represented as original draft results. |

Historical player profiles remain embedded in `../index.html` and are generated
from NFLverse seasons 2013–2025 by `../build-data.py`.

Run `python3 ../refresh-merged-data.py` from this directory, or
`python3 refresh-merged-data.py` from `fantasy-football-2026/`, to refresh the
Sleeper snapshot. Re-run `python3 build-data.py --check` from
`fantasy-football-2026/` to validate the historical player mapping.
