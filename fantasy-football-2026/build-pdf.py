#!/usr/bin/env python3
"""
Generate a print-ready HTML companion from index.html.

The dashboard is a tabbed app: only one panel per section is visible at a time,
so printing it directly yields a handful of panels and a lot of dead chrome.
This script pulls every panel out in order and re-lays them as a linear
document with a cover, a contents page and one section per page break.

Content is extracted rather than duplicated, so a daily edit to index.html
flows into the PDF on the next build.

    python3 build-pdf.py            # writes print.html
    python3 build-pdf.py --toc "3,4,6,..."   # second pass, fills TOC page numbers
"""
import re
import sys
import html as _html

SRC = 'index.html'
OUT = 'print.html'

# Section order as it appears in the dashboard.
ORDER = ['recap', 'strategy', 'rb', 'wr', 'te', 'qb', 'def', 'plan', 'mocks', 'sources']

# Screen is gold-on-black duotone, so print carries a single accent. Metallic
# gold is unreadable on paper (2.1:1), so this is a deeper bronze at 5.9:1.
PRINT_ACCENT = '#7A6117'


def balanced(src, start):
    """Return end index of the <div> opened at `start`."""
    j = src.index('>', start) + 1
    depth = 1
    while depth:
        m = re.search(r'<div\b|</div>', src[j:])
        if not m:
            raise ValueError('unbalanced div')
        j += m.end()
        depth += 1 if m.group(0) == '<div' else -1
    return j


def grab_views(src):
    views = {}
    for m in re.finditer(r'<div class="view[^"]*" id="v-([^"]+)"', src):
        vid = m.group(1)
        if vid == 'home':
            continue
        views[vid] = src[m.start():balanced(src, m.start())]
    return views


def parse_view(vid, blk):
    glyph = re.search(r'<span class="sec-glyph">(.*?)</span>', blk, re.S)
    title = re.search(r'<div class="sec-title">\s*<h2>(.*?)</h2>\s*<p>(.*?)</p>', blk, re.S)
    pos = re.search(r'--pc:var\(--(\w+)\)', blk)

    # Tab order is the authored order; DOM order is not guaranteed to match it.
    tab_order = re.findall(r'aria-controls="([^"]+)">([^<]*)</button>', blk)

    bodies = {}
    for pm in re.finditer(r'<div class="panel[^"]*" id="([^"]+)" role="tabpanel">', blk):
        pid = pm.group(1)
        bodies[pid] = blk[blk.index('>', pm.start()) + 1: balanced(blk, pm.start()) - len('</div>')].strip()

    panels = [(label, bodies[pid]) for pid, label in tab_order if pid in bodies]
    leftover = [p for p in bodies if p not in dict(tab_order)]
    if leftover:
        raise SystemExit('panel not reachable from any tab: %s' % leftover)

    if not panels:  # untabbed section (recap, sources)
        body = re.search(r'<div class="wrap body-\w+">(.*)</div>\s*</div>\s*$', blk, re.S)
        panels = [('', body.group(1).strip() if body else '')]

    return {
        'id': vid,
        'glyph': glyph.group(1).strip() if glyph else '',
        'title': title.group(1).strip() if title else vid,
        'blurb': title.group(2).strip() if title else '',
        'pos': (pos.group(1).upper() if pos else None),
        'panels': panels,
    }


def clean(fragment):
    """Strip interaction-only affordances that mean nothing on paper."""
    f = fragment
    f = re.sub(r'\s*style="--pc[^"]*"', '', f)
    f = re.sub(r'<div class="tablewrap">\s*(.*?)\s*</div>', r'\1', f, flags=re.S)
    f = re.sub(r'\s+class="stack"', '', f)
    return f


CSS = """
@page { size: Letter; margin: 17mm 15mm 15mm; }
@page :first { margin: 0; }

*{ box-sizing:border-box; }
html,body{ margin:0; padding:0; }
body{
  background:#fff; color:#1B1E1D;
  font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;
  font-size:9.6pt; line-height:1.5;
  -webkit-print-color-adjust:exact; print-color-adjust:exact;
}
h1,h2,h3,h4{ margin:0; font-weight:700; }
p{ margin:0 0 6pt; }
strong{ font-weight:700; }
a{ color:#1B1E1D; text-decoration:none; }

/* ---------- cover ---------- */
.cover{
  height:279.4mm; padding:32mm 22mm 20mm; break-after:page;
  background:#000000; color:#F3F0EA; position:relative; overflow:hidden;
}
.cover::after{
  content:""; position:absolute; inset:0;
  background:repeating-linear-gradient(90deg,transparent 0 17mm,#FFFFFF0D 17mm 17.2mm);
}
.cover-kick{ font-family:ui-monospace,"SFMono-Regular",Menlo,monospace; font-size:8pt; letter-spacing:.22em; text-transform:uppercase; color:#D4AF37; margin-bottom:10mm; }
.cover h1{ font-size:44pt; line-height:.98; letter-spacing:-.03em; max-width:15ch; margin-bottom:8mm; }
.cover h1 em{ font-style:normal; color:#D4AF37; }
.cover-sub{ font-size:12pt; color:#C9C4BA; max-width:44ch; }
.cover-meta{
  position:absolute; left:22mm; right:22mm; bottom:20mm; padding-top:5mm;
  border-top:.4pt solid #4A443A; display:flex; justify-content:space-between;
  font-family:ui-monospace,"SFMono-Regular",Menlo,monospace; font-size:7.6pt;
  letter-spacing:.12em; text-transform:uppercase; color:#9A9287;
}

/* ---------- contents ---------- */
.toc{ break-after:page; }
.toc h2{ font-size:19pt; letter-spacing:-.02em; margin-bottom:2mm; }
.toc-note{ font-size:9pt; color:#5C625F; margin-bottom:8mm; max-width:62ch; }
.toc-row{
  display:flex; align-items:baseline; gap:4mm; padding:2.6mm 0;
  border-bottom:.4pt solid #E2E0DA;
}
.toc-row .n{ font-family:ui-monospace,"SFMono-Regular",Menlo,monospace; font-size:8pt; color:#8A8078; width:7mm; }
.toc-row .t{ font-size:11pt; font-weight:700; letter-spacing:-.01em; }
.toc-row .d{ font-size:8.6pt; color:#5C625F; }
.toc-row .dots{ flex:1; border-bottom:.4pt dotted #C9C6BE; margin:0 2mm; transform:translateY(-1mm); }
.toc-row .p{ font-family:ui-monospace,"SFMono-Regular",Menlo,monospace; font-size:9pt; color:#1B1E1D; }

/* ---------- sections ---------- */
.section{ break-before:page; }
.sec-head{ border-bottom:1.4pt solid var(--pc,#7A6117); padding-bottom:3mm; margin-bottom:6mm; display:flex; align-items:baseline; gap:5mm; }
.sec-glyph{ font-size:22pt; font-weight:800; letter-spacing:-.04em; color:var(--pc,#7A6117); line-height:1; }
.sec-head h2{ font-size:19pt; letter-spacing:-.025em; }
.sec-head .blurb{ font-size:9pt; color:#5C625F; margin-left:auto; text-align:right; max-width:42ch; }

.panel-h{
  font-family:ui-monospace,"SFMono-Regular",Menlo,monospace; font-size:8pt;
  letter-spacing:.2em; text-transform:uppercase; color:var(--pc,#7A6117);
  margin:7mm 0 3mm; padding-bottom:1.4mm; border-bottom:.4pt solid #E2E0DA;
  break-after:avoid;
}
.panel-h:first-of-type{ margin-top:0; }
.panel{ break-inside:auto; }

/* ---------- rules list ---------- */
.rules{ list-style:none; margin:0; padding:0; }
.rules li{ display:flex; gap:3mm; margin-bottom:2.4mm; break-inside:avoid; }
.rules li::before{ content:"—"; color:var(--pc,#7A6117); flex:none; }
.rules b{ font-weight:700; }

/* ---------- tier board ---------- */
.board{ border:.5pt solid #DAD8D1; border-radius:1.5mm; overflow:hidden; }
.tier{ display:flex; flex-wrap:wrap; border-bottom:.5pt solid #DAD8D1; break-inside:avoid; }
.tier:last-child{ border-bottom:0; }
.tier-label{ width:30mm; padding:3mm; background:#F4F3EF; border-right:.5pt solid #DAD8D1; }
.tier-label .n{ display:block; font-weight:700; font-size:10pt; }
.tier-label .d{ display:block; font-family:ui-monospace,"SFMono-Regular",Menlo,monospace; font-size:7pt; letter-spacing:.1em; text-transform:uppercase; color:#7A807C; }
.tier-body{ flex:1; padding:2.6mm 3mm; display:flex; flex-wrap:wrap; gap:1.6mm; }
.plr{
  display:inline-block; border:.4pt solid #DAD8D1; border-left:1.2pt solid var(--pc,#7A6117);
  border-radius:1mm; padding:1.2mm 2.2mm; font-size:8.6pt; font-weight:700;
}
.plr .tm{ font-family:ui-monospace,"SFMono-Regular",Menlo,monospace; font-size:6.8pt; letter-spacing:.08em; color:#7A807C; font-weight:400; margin-left:1.4mm; }
.tier-note{ width:100%; padding:0 3mm 2.6mm; font-size:8.4pt; color:#5C625F; }

/* ---------- cards ---------- */
.cards{ display:grid; grid-template-columns:1fr 1fr; gap:3mm; }
.pcard{ border:.5pt solid #DAD8D1; border-top:1.2pt solid var(--pc,#7A6117); border-radius:1.5mm; padding:3mm; break-inside:avoid; }
.pcard-head{ display:flex; align-items:baseline; gap:2mm; flex-wrap:wrap; }
.pcard h4{ font-size:10pt; }
.pcard .team{ font-family:ui-monospace,"SFMono-Regular",Menlo,monospace; font-size:7pt; letter-spacing:.08em; color:#7A807C; }
.pcard .cost{ margin-left:auto; font-family:ui-monospace,"SFMono-Regular",Menlo,monospace; font-size:7pt; letter-spacing:.06em; text-transform:uppercase; color:var(--pc,#7A6117); border:.4pt solid currentColor; border-radius:1mm; padding:.5mm 1.4mm; }
.pcard .facts{ list-style:none; margin:2.4mm 0 0; padding:2mm 0 0; border-top:.4pt solid #E2E0DA; }
.pcard .facts li{ font-size:8.2pt; line-height:1.42; color:#4A504D; display:flex; gap:1.6mm; margin-bottom:1mm; }
.pcard .facts li::before{ content:"›"; color:var(--pc,#7A6117); }
.pos-badge{ font-family:ui-monospace,"SFMono-Regular",Menlo,monospace; font-size:6.6pt; font-weight:700; letter-spacing:.08em; padding:.5mm 1.4mm; border-radius:.8mm; color:#fff; background:var(--pc,#7A6117); }
.p-RB,.p-WR,.p-TE,.p-QB{ background:#7A6117; }
.p-DST,.p-K{ background:#6E736F; }

/* ---------- tables ---------- */
table{ border-collapse:collapse; width:100%; font-size:8.6pt; border:.5pt solid #DAD8D1; }
caption{ text-align:left; font-family:ui-monospace,"SFMono-Regular",Menlo,monospace; font-size:7.4pt; letter-spacing:.14em; text-transform:uppercase; color:#7A807C; padding:0 0 1.8mm; }
thead{ display:table-header-group; }
th{ text-align:left; padding:2mm 2.6mm; background:#F4F3EF; border-bottom:.5pt solid #DAD8D1; font-family:ui-monospace,"SFMono-Regular",Menlo,monospace; font-size:7pt; letter-spacing:.1em; text-transform:uppercase; color:#7A807C; }
td{ padding:2mm 2.6mm; border-bottom:.4pt solid #E8E6E0; vertical-align:top; color:#3A403D; }
tr{ break-inside:avoid; }
tbody tr:last-child td{ border-bottom:0; }
td.name{ font-weight:700; color:#1B1E1D; white-space:nowrap; }
td.num, th.num{ font-family:ui-monospace,"SFMono-Regular",Menlo,monospace; white-space:nowrap; color:#5C625F; }
td small{ display:block; font-family:ui-monospace,"SFMono-Regular",Menlo,monospace; font-size:6.8pt; letter-spacing:.06em; color:#8A8078; font-weight:400; }

/* ---------- move ledger ---------- */
.ledger{ border:.5pt solid #DAD8D1; border-radius:1.5mm; overflow:hidden; }
.move{ display:flex; gap:4mm; padding:2.6mm 3mm; border-bottom:.5pt solid #E8E6E0; break-inside:avoid; }
.move:last-child{ border-bottom:0; }
.move > div{ width:52mm; flex:none; }
.move .nm{ font-weight:700; font-size:9pt; }
.move .path{ display:block; font-family:ui-monospace,"SFMono-Regular",Menlo,monospace; font-size:7pt; letter-spacing:.06em; color:#8A8078; }
.move .path .to{ color:var(--pc,#7A6117); }
.move .why{ font-size:8.6pt; color:#4A504D; margin:0; }

/* ---------- slots + mocks ---------- */
.slots{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:2.6mm; }
.slot{ border:.5pt solid #DAD8D1; border-radius:1.5mm; padding:2.6mm; break-inside:avoid; }
.slot-top{ display:flex; align-items:baseline; gap:2mm; margin-bottom:1.4mm; }
.slot-n{ font-weight:800; font-size:12pt; letter-spacing:-.03em; }
.slot-picks{ font-family:ui-monospace,"SFMono-Regular",Menlo,monospace; font-size:6.8pt; color:#8A8078; }
.verdict{ margin-left:auto; font-family:ui-monospace,"SFMono-Regular",Menlo,monospace; font-size:6.4pt; font-weight:700; letter-spacing:.08em; text-transform:uppercase; padding:.5mm 1.4mm; border-radius:.8mm; color:#fff; }
.v-RB,.v-WR{ background:#7A6117; } .v-any{ background:#6E736F; }
.slot p{ font-size:8.2pt; line-height:1.4; margin:0; color:#4A504D; }

.mock{ border:.5pt solid #DAD8D1; border-radius:1.5mm; overflow:hidden; break-inside:avoid; }
.mock-head{ padding:2mm 3mm; background:#F4F3EF; border-bottom:.5pt solid #DAD8D1; display:flex; justify-content:space-between; }
.mock-head .s{ font-weight:800; font-size:9.6pt; }
.mock-head .t{ font-family:ui-monospace,"SFMono-Regular",Menlo,monospace; font-size:7pt; color:#8A8078; }
.mock ul{ list-style:none; margin:0; padding:0; display:grid; grid-template-columns:1fr 1fr; grid-template-rows:repeat(8,auto); grid-auto-flow:column; }
.mock li{ display:flex; align-items:center; gap:2mm; padding:1.4mm 3mm; border-bottom:.4pt solid #E8E6E0; font-size:8.4pt; }
.mock li:nth-child(-n+8){ border-right:.5pt solid #DAD8D1; }
.mock li:nth-child(8),.mock li:nth-child(16){ border-bottom:0; }
.mock .rd{ font-family:ui-monospace,"SFMono-Regular",Menlo,monospace; font-size:6.8pt; color:#8A8078; width:6mm; }
.mock .nm{ font-weight:700; }
.mock .pos-badge{ margin-left:auto; }
.mocks-stack{ display:flex; flex-direction:column; gap:5mm; }
#sec-mocks .panel-h{ display:none; }
#sec-mocks .panel + .panel{ margin-top:4mm; }
.mock li{ padding-top:1.15mm; padding-bottom:1.15mm; }

/* ---------- callout ---------- */
.callout{ border:.5pt solid #DAD8D1; border-left:1.4pt solid var(--pc,#7A6117); background:#F8F7F4; padding:3mm 3.4mm; border-radius:0 1.5mm 1.5mm 0; break-inside:avoid; }
.callout p{ margin:0; } .callout p + p{ margin-top:2mm; }

/* ---------- sources ---------- */
.srcgrid{ columns:2; column-gap:8mm; list-style:none; margin:0; padding:0; font-size:8.4pt; }
.srcgrid li{ break-inside:avoid; margin-bottom:1.8mm; }
.srcgrid a{ font-weight:700; }
.srcgrid a::after{ content:""; }
.legend{ display:none; }
"""


def build(toc_pages=None):
    src = open(SRC, encoding='utf-8').read()
    views = grab_views(src)
    secs = [parse_view(v, views[v]) for v in ORDER if v in views]

    date = re.search(r'<p class="kicker">.*?·\s*([0-9]{1,2} \w+ 20\d\d)', src)
    date = date.group(1) if date else ''

    out = ['<meta charset="utf-8">',
           '<title>The Board — 2026 Fantasy Football Breakdown</title>',
           '<style>%s</style>' % CSS]

    # cover
    out.append(f'''<div class="cover">
  <p class="cover-kick">2026 Season · Draft Guide</p>
  <h1>Everything you need before you're <em>on the clock</em></h1>
  <p class="cover-sub">Ten sections: the 2025 repricing, a strategy, five position files, a slot-by-slot plan and three mock drafts.</p>
  <div class="cover-meta"><span>12-team · PPR · redraft</span><span>Verified {date}</span></div>
</div>''')

    # contents
    rows = []
    for i, s in enumerate(secs):
        pg = toc_pages[i] if toc_pages else ''
        rows.append(
            f'<div class="toc-row"><span class="n">{i+1:02d}</span>'
            f'<span class="t">{s["title"]}</span>'
            f'<span class="d">{s["blurb"]}</span>'
            f'<span class="dots"></span><span class="p">{pg}</span></div>')
    out.append('<div class="toc"><h2>Contents</h2>'
               '<p class="toc-note">Rankings are consensus-leaning composites, not any single board. '
               f'ADP and injury status are perishable — this is the picture as of {date}. '
               'Re-check anything involving a knee before you draft.</p>' + ''.join(rows) + '</div>')

    # sections
    for s in secs:
        pc = PRINT_ACCENT
        body = []
        for label, inner in s['panels']:
            if label:
                body.append(f'<p class="panel-h">{label}</p>')
            body.append('<div class="panel">%s</div>' % clean(inner))
        out.append(
            f'<div class="section" id="sec-{s["id"]}" style="--pc:{pc}">'
            f'<div class="sec-head"><span class="sec-glyph">{s["glyph"]}</span>'
            f'<h2>{s["title"]}</h2><span class="blurb">{s["blurb"]}</span></div>'
            + ''.join(body) + '</div>')

    open(OUT, 'w', encoding='utf-8').write('\n'.join(out))
    return [s['title'] for s in secs]


if __name__ == '__main__':
    pages = None
    if len(sys.argv) > 2 and sys.argv[1] == '--toc':
        pages = [p.strip() for p in sys.argv[2].split(',')]
    titles = build(pages)
    print('wrote %s — %d sections: %s' % (OUT, len(titles), ', '.join(titles)))
