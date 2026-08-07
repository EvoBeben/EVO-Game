#!/usr/bin/env python3
"""
Embed real player stats into index.html and make every player name clickable.

Reads the player names already present in the markup, resolves them against
nflverse season files, and writes back two things:

  * a <script type="application/json" id="player-data"> block holding per-season
    and career lines for every resolved player
  * a <button class="pl"> wrapper around each of those names

Both are generated from the same pass, so the markup and the data cannot drift.
Re-running is idempotent: existing wrappers are stripped before rewriting.

The build fails loudly if a name is neither a known non-player nor resolvable in
any season file — a silent fallback is how a blank or wrong sheet ships.

    python3 build-data.py            # fetch (cached), embed, rewrite markup
    python3 build-data.py --check    # resolve only, touch nothing
"""
import csv
import io
import json
import os
import re
import subprocess
import sys

SRC = 'index.html'
CACHE = '.cache'
BASE = 'https://github.com/nflverse/nflverse-data/releases/download/stats_player'
SEASONS = range(2013, 2026)          # 2013 covers the oldest player on the board
LAST = 2025

# Strings that appear in player-name slots but are not players.
TEAMS = (
    'Cardinals', 'Falcons', 'Ravens', 'Bills', 'Panthers', 'Bears', 'Bengals',
    'Browns', 'Cowboys', 'Broncos', 'Lions', 'Packers', 'Texans', 'Colts',
    'Jaguars', 'Chiefs', 'Raiders', 'Chargers', 'Rams', 'Dolphins', 'Vikings',
    'Patriots', 'Saints', 'Giants', 'Jets', 'Eagles', 'Steelers', 'Seahawks',
    '49ers', 'Buccaneers', 'Titans', 'Commanders',
)

NON_PLAYERS = {
    *TEAMS, *(t + ' D/ST' for t in TEAMS), 'Kicker', 'Defense',
    'Klint Kubiak', 'Jesse Minter',                      # coaches
    'Trent McDuffie &middot; Jaylen Watson',             # combined ledger cell
}

# Page spelling -> nflverse display name. Each verified against the 2025 file.
ALIASES = {
    'Chris Rodriguez': 'Chris Rodriguez Jr.',
    'D.J. Moore': 'DJ Moore',
    'Kenneth Gainwell': 'Kenny Gainwell',
    'Michael Pittman Jr.': 'Michael Pittman',
    'Travis Etienne Jr.': 'Travis Etienne',
}

# Players with no nflverse line, each with the accurate reason. The sheet prints
# the reason instead of a row of zeroes.
NO_STATS = {
    **{n: 'Enters the league in 2026 — no NFL stats yet.' for n in (
        'Carnell Tate', 'Jeremiyah Love', 'Jadarian Price', 'Jordyn Tyson',
        'Fernando Mendoza', 'KC Concepcion', 'Omar Cooper Jr.', 'Makai Lemon',
        'Ty Simpson')},
    'Jordan James': 'No regular-season stats recorded through 2025.',
}

# Per-season row layout. Stored as arrays; the UI picks columns by position.
FIELDS = ['games', 'completions', 'attempts', 'passing_yards', 'passing_tds',
          'passing_interceptions', 'carries', 'rushing_yards', 'rushing_tds',
          'receptions', 'targets', 'receiving_yards', 'receiving_tds',
          'fantasy_points_ppr']

# Kicker rows are shaped differently. nflverse does not score kickers, so the
# last column is computed here under standard scoring: 3 points inside 40,
# 4 from 40-49, 5 from 50+, 1 per extra point.
K_FIELDS = ['games', 'fg_made', 'fg_att', 'fg_long',
            'fg_made_40_49', 'fg_50_plus', 'pat_made', 'pat_att', 'k_points']


def kicker_row(r):
    g = lambda k: int(num(r.get(k)) or 0)
    fifty = g('fg_made_50_59') + g('fg_made_60_')
    short = g('fg_made_0_19') + g('fg_made_20_29') + g('fg_made_30_39')
    points = short * 3 + g('fg_made_40_49') * 4 + fifty * 5 + g('pat_made')
    return [g('games'), g('fg_made'), g('fg_att'), g('fg_long'),
            g('fg_made_40_49'), fifty, g('pat_made'), g('pat_att'), points]

# Where player names live in the markup.
PATTERNS = [
    (re.compile(r'(<span class="plr">)([^<]+?)(\s*<span class="tm">)'), 2),
    (re.compile(r'(<h4>)([^<]+?)(</h4>)'), 2),
    (re.compile(r'(<td class="name">)([^<]+?)(\s*<small>)'), 2),
    (re.compile(r'(<span class="nm">)([^<]+?)(</span>)'), 2),
]

WRAPPED = re.compile(r'<button class="pl"[^>]*>([^<]*)</button>')


def slug(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def unwrap(html):
    """Strip previously generated buttons so the script is idempotent."""
    return WRAPPED.sub(r'\1', html)


def page_names(html):
    names = []
    for pat, grp in PATTERNS:
        names += [m.group(grp).strip() for m in pat.finditer(html)]
    return sorted(set(n for n in names if n))


def fetch(year):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, 'reg_%d.csv' % year)
    if os.path.exists(path) and os.path.getsize(path) > 10000:
        return path
    url = '%s/stats_player_reg_%d.csv' % (BASE, year)
    print('  fetching %d ...' % year, end='', flush=True)
    r = subprocess.run(['curl', '-sSL', '--max-time', '90', '-o', path, url],
                       capture_output=True, text=True)
    if r.returncode or not os.path.exists(path) or os.path.getsize(path) < 10000:
        raise SystemExit('\nfailed to fetch %s\n%s' % (url, r.stderr))
    print(' %d KB' % (os.path.getsize(path) // 1024))
    return path


SKILL = {'QB', 'RB', 'FB', 'WR', 'TE'}


def load_seasons():
    """{display_name: {player_id: {season: row}}}.

    Keyed by id, not name: the data contains a 2014 center named Josh Allen and a
    cornerback named Lamar Jackson, and merging those into the quarterbacks'
    careers silently corrupts both.
    """
    index = {}
    for year in SEASONS:
        with open(fetch(year), newline='', encoding='utf-8') as fh:
            for row in csv.DictReader(fh):
                index.setdefault(row['player_display_name'], {}) \
                     .setdefault(row['player_id'], {})[year] = row
    return index


def pick(name, candidates):
    """Choose which same-named player the board means: the fantasy-relevant one."""
    def score(seasons):
        rows = list(seasons.values())
        skill = any(r['position'] in SKILL for r in rows)
        return (skill, sum(num(r.get('fantasy_points_ppr')) for r in rows))

    ranked = sorted(candidates.items(), key=lambda kv: score(kv[1]), reverse=True)
    if len(ranked) > 1:
        chosen = ranked[0][1]
        pos = sorted({r['position'] for r in chosen.values()})
        print('  name collision: %s -> %s (%s), discarded %d other'
              % (name, ranked[0][0], '/'.join(pos), len(ranked) - 1))
    return ranked[0][1]


def num(v):
    if v in (None, '', 'NA'):
        return 0
    try:
        f = float(v)
    except ValueError:
        return 0
    return int(f) if f == int(f) else round(f, 1)


def build_player(name, seasons):
    latest = seasons[max(seasons)]
    pos, team, group = latest['position'], latest['recent_team'], latest['position_group']
    kicker = pos == 'K'
    fields = K_FIELDS if kicker else FIELDS
    rows = []
    for year in sorted(seasons):
        r = seasons[year]
        vals = kicker_row(r) if kicker else [num(r.get(f)) for f in FIELDS]
        rows.append([year, r['recent_team']] + vals)

    career = [0] * len(fields)
    for row in rows:
        for i, v in enumerate(row[2:]):
            career[i] += v
    career = [round(v, 1) if isinstance(v, float) else v for v in career]
    if kicker:                      # a career "long" is the best, not the sum
        career[K_FIELDS.index('fg_long')] = max(r[2 + K_FIELDS.index('fg_long')] for r in rows)

    return {
        'n': name,
        'p': pos,
        't': team,
        'g': group,
        's': rows,
        'c': career,
        'l': next((r for r in rows if r[0] == LAST), None),
    }


def main():
    check_only = '--check' in sys.argv
    html = unwrap(open(SRC, encoding='utf-8').read())
    names = page_names(html)

    print('names in markup: %d' % len(names))
    wanted = [n for n in names if n not in NON_PLAYERS]

    print('loading nflverse seasons %d-%d' % (SEASONS[0], SEASONS[-1]))
    index = load_seasons()

    players, unresolved = {}, []
    for name in wanted:
        if name in NO_STATS:
            players[slug(name)] = {'n': name, 'note': NO_STATS[name]}
            continue
        key = ALIASES.get(name, name)
        if key not in index:
            unresolved.append(name)
            continue
        players[slug(name)] = build_player(name, pick(name, index[key]))

    if unresolved:
        raise SystemExit(
            'unresolved player names (add to NON_PLAYERS, ALIASES or NO_STATS):\n  '
            + '\n  '.join(unresolved))

    real = [p for p in players.values() if p.get('s')]
    print('resolved: %d players (%d with stats, %d without), %d player-seasons'
          % (len(players), len(real), len(players) - len(real),
             sum(len(p['s']) for p in real)))

    if check_only:
        return

    # wrap names -> buttons
    def wrap(m):
        name = m.group(2).strip()
        key = slug(name)
        if key not in players:
            return m.group(0)
        return '%s<button class="pl" data-p="%s" aria-expanded="false">%s</button>%s' % (
            m.group(1), key, name, m.group(3))

    for pat, _ in PATTERNS:
        html = pat.sub(wrap, html)

    payload = json.dumps(players, separators=(',', ':'))
    block = ('<script type="application/json" id="player-data">%s</script>' % payload)
    if re.search(r'<script type="application/json" id="player-data">.*?</script>', html, re.S):
        html = re.sub(r'<script type="application/json" id="player-data">.*?</script>',
                      lambda m: block, html, flags=re.S)
    else:
        html = html.replace('</main>', '</main>\n\n' + block, 1)

    open(SRC, 'w', encoding='utf-8').write(html)
    print('embedded %.1f KB of stats; wrapped %d names'
          % (len(payload) / 1024, len(WRAPPED.findall(html))))


if __name__ == '__main__':
    SEASONS = list(SEASONS)
    main()
