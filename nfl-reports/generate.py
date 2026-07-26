#!/usr/bin/env python3
"""Render one-page NFL team intel reports (HTML -> PDF) with per-team colors.

Each team is a JSON file in teams/<abbr>.json. Layout auto-shrinks until the
content fits on exactly one letter page.
"""
import json, os, subprocess, sys, glob

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
CHROME = "/opt/pw-browsers/chromium"

CSS = """
  @page {{ size: letter; margin: 0; }}
  :root{{
    --navy:{primary};
    --navy2:{primary2};
    --orange:{secondary};
    --orange-lt:{secondary_lt};
    --ink:#12203A;
    --muted:#5A6879;
    --rule:#D8DEE6;
  }}
  *{{box-sizing:border-box;margin:0;padding:0;}}
  body{{
    font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;
    background:#fff; color:var(--ink);
    width:8.5in; height:11in;
    display:flex; flex-direction:column;
    -webkit-print-color-adjust:exact; print-color-adjust:exact;
  }}
  header{{
    background:var(--navy); color:#fff;
    padding:{hpad_t}in 0.42in {hpad_b}in;
    position:relative; border-bottom:5px solid var(--orange);
  }}
  header:after{{
    content:""; position:absolute; right:0; top:0; bottom:0; width:2.1in;
    background:linear-gradient(115deg, transparent 0%, transparent 42%, {slash} 42%, {slash} 56%, transparent 56%);
  }}
  .kicker{{font-size:{f_kicker}pt; letter-spacing:.20em; text-transform:uppercase;
    color:var(--orange-lt); font-weight:700; margin-bottom:5px;}}
  h1{{font-size:{f_h1}pt; line-height:.98; font-weight:800; letter-spacing:-.015em; text-transform:uppercase;}}
  h1 .b{{color:var(--orange);}}
  .subhead{{margin-top:6px; font-size:{f_sub}pt; color:#C3CCD8; letter-spacing:.02em; max-width:5.6in;}}
  .stamp{{position:absolute; right:.42in; bottom:.22in; text-align:right; z-index:2;}}
  .stamp .lbl{{font-size:6.5pt; letter-spacing:.16em; color:#9BA9BA; text-transform:uppercase;}}
  .stamp .val{{font-size:11pt; font-weight:800; color:#fff;}}

  .strip{{display:flex; background:var(--navy2); color:#fff;}}
  .strip div{{flex:1; padding:{strip_pad}px 4px {strip_pad2}px; text-align:center;
    border-right:1px solid rgba(255,255,255,.13);}}
  .strip div:last-child{{border-right:none;}}
  .strip .n{{font-size:{f_stat}pt; font-weight:800; color:#fff; line-height:1.1;}}
  .strip .n em{{font-style:normal; color:var(--orange-lt);}}
  .strip .k{{font-size:6pt; letter-spacing:.12em; text-transform:uppercase; color:#9FADBE; margin-top:2px;}}

  main{{flex:1; display:grid; grid-template-columns:1fr 1fr; gap:0 .30in; padding:{mpad}in .42in .10in;}}
  .col{{display:flex; flex-direction:column;}}
  section{{margin-bottom:{secmb}in;}}
  h2{{font-size:{f_h2}pt; letter-spacing:.15em; text-transform:uppercase; font-weight:800;
    color:var(--navy); padding-bottom:2.5px; margin-bottom:5px;
    border-bottom:2px solid var(--orange); display:flex; align-items:center; gap:6px;}}
  h2 span.dot{{display:inline-block; width:7px; height:7px; background:var(--orange); transform:rotate(45deg);}}

  ul{{list-style:none;}}
  li{{font-size:{f_li}pt; line-height:1.30; margin-bottom:{li_mb}px; padding-left:8px;
    position:relative; color:#22334D;}}
  li:before{{content:""; position:absolute; left:0; top:4.2px; width:4px; height:4px;
    background:var(--orange); transform:rotate(45deg);}}
  li b{{color:var(--navy); font-weight:800;}}
  .tag{{display:inline-block; font-size:{f_tag}pt; font-weight:800; letter-spacing:.09em;
    text-transform:uppercase; color:#fff; background:var(--navy2);
    padding:1px 4px; border-radius:2px; margin-right:4px; vertical-align:1.2px;}}
  .tag.hot{{background:var(--orange); color:{tagink};}}
  .tag.watch{{background:#6C7A8C;}}

  table{{width:100%; border-collapse:collapse;}}
  td{{font-size:{f_td}pt; padding:{td_pad}px 4px; border-bottom:1px solid var(--rule); vertical-align:top;}}
  tr td:first-child{{font-weight:800; color:var(--navy); width:38%;}}
  tr td:last-child{{color:#3C4C63;}}
  .in td:first-child:before{{content:"\\25B2 "; color:#1E7A4B;}}
  .out td:first-child:before{{content:"\\25BC "; color:var(--orange);}}
  thead td{{font-size:6pt; letter-spacing:.13em; text-transform:uppercase; color:var(--muted);
    font-weight:700 !important; border-bottom:1.5px solid var(--navy);}}

  .note{{background:#F4F6F9; border-left:3px solid var(--orange); padding:6px 8px;
    font-size:{f_note}pt; line-height:1.32; color:#33445E;}}
  .note b{{color:var(--navy);}}

  footer{{background:var(--navy); color:#9BA9BA; font-size:5.9pt; line-height:1.45;
    padding:7px .42in 8px; border-top:4px solid var(--orange);}}
  footer b{{color:#DDE3EA; letter-spacing:.1em; text-transform:uppercase; font-size:5.9pt;}}
"""

BASE = dict(f_kicker=7.5, f_h1=23, f_sub=8, f_stat=12, f_h2=8, f_li=6.9,
            f_tag=5.6, f_td=6.7, f_note=6.8)


def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(c1, c2, t):
    a, b = hex_to_rgb(c1), hex_to_rgb(c2)
    return "#%02X%02X%02X" % tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def luminance(h):
    r, g, b = [c / 255 for c in hex_to_rgb(h)]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def build_html(t, scale=1.0):
    primary, secondary = t["primary"], t["secondary"]
    # Secondary must stay legible on the dark primary header...
    sec_lt = secondary if luminance(secondary) > 0.34 else mix(secondary, "#FFFFFF", 0.42)
    # ...and on the white body, where a near-white secondary (Jets) would vanish.
    if luminance(secondary) > 0.62:
        secondary = mix(secondary, primary, 0.62)
    sizes = {k: round(v * scale, 2) for k, v in BASE.items()}
    css = CSS.format(
        primary=primary,
        primary2=mix(primary, "#FFFFFF", 0.10),
        secondary=secondary,
        secondary_lt=sec_lt,
        slash="rgba(%d,%d,%d,.85)" % hex_to_rgb(sec_lt),
        tagink="#FFFFFF" if luminance(secondary) < 0.55 else "#101820",
        hpad_t=round(0.24 * scale, 3), hpad_b=round(0.20 * scale, 3),
        strip_pad=round(5 * scale, 1), strip_pad2=round(6 * scale, 1),
        mpad=round(0.15 * scale, 3), secmb=round(0.11 * scale, 3),
        li_mb=round(3.2 * scale, 2), td_pad=round(1.8 * scale, 2),
        **sizes)

    def render_section(s):
        h = '<section><h2><span class="dot"></span>%s</h2>' % s["title"]
        if s["type"] == "ul":
            h += "<ul>" + "".join("<li>%s</li>" % i for i in s["items"]) + "</ul>"
        elif s["type"] == "table":
            h += "<table>"
            if s.get("head"):
                h += "<thead><tr><td>%s</td><td>%s</td></tr></thead>" % tuple(s["head"])
            h += "<tbody>"
            for row in s["items"]:
                cls = ' class="%s"' % row[2] if len(row) > 2 and row[2] else ""
                h += "<tr%s><td>%s</td><td>%s</td></tr>" % (cls, row[0], row[1])
            h += "</tbody></table>"
        elif s["type"] == "note":
            h += '<div class="note">%s</div>' % s["items"][0]
        return h + "</section>"

    left = "".join(render_section(s) for s in t["left"])
    right = "".join(render_section(s) for s in t["right"])
    strip = "".join('<div><div class="n">%s</div><div class="k">%s</div></div>' % (s["n"], s["k"])
                    for s in t["strip"])
    name_parts = t["name"].split(" ", 1) if " " in t["name"] else [t["name"], ""]

    return """<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>%(title)s Intel Report</title><style>%(css)s</style></head><body>
<header>
  <div class="kicker">Front Office &middot; Roster &middot; Rumor Mill</div>
  <h1>%(n1)s <span class="b">%(n2)s</span><br>Intel Report</h1>
  <div class="subhead">%(subhead)s</div>
  <div class="stamp"><div class="lbl">Updated</div><div class="val">%(date)s</div></div>
</header>
<div class="strip">%(strip)s</div>
<main><div class="col">%(left)s</div><div class="col">%(right)s</div></main>
<footer><b>Sourced from</b> &nbsp;%(sources)s<br>
Items marked <b>Speculation</b> are analyst projections or unconfirmed reports, not confirmed transactions.
Compiled %(date)s &mdash; roster status changes daily once camp opens. Independent report; not affiliated
with or endorsed by the %(title)s or the NFL.</footer>
</body></html>""" % dict(
        title=t["city"] + " " + t["name"], css=css,
        n1=t["city"], n2=t["name"], subhead=t["subhead"], date=t["date"],
        strip=strip, left=left, right=right, sources=t["sources"])


def page_count(pdf):
    import fitz
    with fitz.open(pdf) as d:
        return d.page_count


def render(team_json, verbose=True):
    t = json.load(open(team_json))
    os.makedirs(OUT, exist_ok=True)
    stem = t["abbr"].lower()
    html_p = os.path.join(OUT, stem + ".html")
    pdf_p = os.path.join(OUT, "%s-%s-report.pdf" % (stem, t["name"].lower().replace(" ", "-")))
    # Largest scale that still fits one page, so short and long reports both fill the sheet.
    for scale in (1.22, 1.18, 1.14, 1.10, 1.06, 1.03, 1.0, 0.97, 0.94, 0.91, 0.88, 0.85, 0.80, 0.75):
        open(html_p, "w").write(build_html(t, scale))
        subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-sandbox",
                        "--no-pdf-header-footer", "--print-to-pdf=" + pdf_p, html_p],
                       capture_output=True)
        n = page_count(pdf_p)
        if n == 1:
            if verbose:
                print("  %-4s OK  scale=%.2f  %s" % (t["abbr"], scale, os.path.basename(pdf_p)))
            return pdf_p, scale
    print("  %-4s STILL %d PAGES - trim content" % (t["abbr"], n))
    return pdf_p, None


if __name__ == "__main__":
    files = sys.argv[1:] or sorted(glob.glob(os.path.join(HERE, "teams", "*.json")))
    for f in files:
        render(f)
