'use strict';

/* TechPulse printable report — 7 fixed A4 pages, built from /api/dashboard. */

const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
const fmtK = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(Math.round(n)));
const pct = (n) => (n >= 0 ? '+' : '') + n.toFixed(1) + '%';

document.getElementById('print').onclick = () => window.print();

fetch('/api/dashboard', { cache: 'no-store' })
  .then((r) => r.json())
  .then(build)
  .catch((e) => { document.getElementById('report').innerHTML = `<p class="loading">Failed to load data: ${e.message}</p>`; });

function build(D) {
  const root = document.getElementById('report');
  root.innerHTML = '';
  const items = D.items;
  const date = new Date(D.generatedAt);
  const dateStr = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const live = !D.demo;

  const foot = (n) =>
    `<div class="page-foot"><span>TechPulse · ${dateStr} · ${live ? 'LIVE' : 'DEMO'} data</span><span>Page ${n} of 7</span></div>`;

  const canvases = []; // {id, series, color} to draw after DOM insert

  // ---------- Page 1: Cover ----------
  const top3 = items.slice(0, 3);
  const risers = items.filter((i) => i.delta > 0).length;
  const avgBuzz = (items.reduce((a, b) => a + b.buzzScore, 0) / items.length).toFixed(1);
  const summary =
    `As of ${dateStr}, the tech &amp; gaming conversation is led by <b>${items[0].name}</b> ` +
    `(buzz ${items[0].buzzScore.toFixed(1)}), followed by <b>${items[1].name}</b> and <b>${items[2].name}</b>. ` +
    `${risers} of the top ${items.length} items are gaining attention week-over-week, and the overall ` +
    `industry-heat gauge reads <b>${D.context.heatIndex}/100 (${D.context.label})</b>. ` +
    `Rankings aggregate Hacker News, Reddit, Google News and Wikipedia interest — a measure of ` +
    `<i>attention</i>, not product quality or value.`;

  root.appendChild(page(`
    ${D.demo ? '<div class="demo-flag">⚠ DEMO DATASET — live sources were unreachable; figures are illustrative.</div>' : ''}
    <div class="cover-head">
      <div class="eyebrow">TechPulse · Trend &amp; News Report</div>
      <h1>What tech &amp; gaming is trending right now</h1>
      <div class="cover-meta">
        <span class="tag ${live ? 'live' : 'demo'}">${live ? 'Live data' : 'Demo data'}</span>
        <span>${dateStr}</span>
        <span class="muted">Top ${items.length} of ${D.counts.candidates} tracked items</span>
      </div>
    </div>
    <h3>Executive summary</h3>
    <div class="summary-box">${summary}</div>
    <div class="stat-row">
      ${stat('Items ranked', items.length, `of ${D.counts.candidates} candidates`)}
      ${stat('Avg 7-day views', fmtK(D.counts.avgMetric), 'Wikipedia')}
      ${stat('Avg buzz score', avgBuzz, 'weighted, 0–100')}
      ${stat('Gaining attention', `${risers}/${items.length}`, 'week-over-week')}
    </div>
    <h3>Industry heat</h3>
    <div class="stat" style="margin-bottom:16px">
      <div class="k">Aggregate attention gauge</div>
      <div class="v">${D.context.heatIndex}<span class="muted" style="font-size:15px"> / 100 · ${D.context.label}</span></div>
      <div class="gauge-track"><div class="gauge-fill" style="width:${D.context.heatIndex}%"></div></div>
      <div class="s">${D.context.note || ''}</div>
    </div>
    <h3>Top 3 to watch</h3>
    <div class="watch">
      ${top3.map((it) => `<div class="w"><div class="rank">#${it.rank}</div><div class="nm">${it.name}</div>
        <div class="why">${it.category} · ${it.tag}<br>Buzz ${it.buzzScore.toFixed(1)} · ${pct(it.delta)} views · ${it.sources.length} sources</div></div>`).join('')}
    </div>
    ${foot(1)}
  `));

  // ---------- Page 2: Full ranked table ----------
  root.appendChild(page(`
    <div class="eyebrow">Section 1</div>
    <h2>Full ranked leaderboard</h2>
    <p class="small muted">Ranked by buzz score — a weighted blend of Hacker News, Reddit, news volume and Wikipedia pageviews (see methodology, p.7).</p>
    <table>
      <thead><tr>
        <th>#</th><th>Item</th><th>Category</th><th>Maker / bias</th>
        <th class="num">7-day views</th><th class="num">Δ wk</th><th class="num">Buzz</th><th>Sources</th>
      </tr></thead>
      <tbody>
        ${items.map((it) => `<tr>
          <td class="pill">${it.rank}</td>
          <td><b>${it.name}</b></td>
          <td>${it.category}</td>
          <td>${it.tag}</td>
          <td class="num">${fmtInt(it.metric)}</td>
          <td class="num ${it.delta >= 0 ? 'up' : 'down'}">${pct(it.delta)}</td>
          <td class="num pill">${it.buzzScore.toFixed(1)}</td>
          <td>${it.sources.map((s) => `<span class="chip">${s}</span>`).join('')}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <p class="small muted" style="margin-top:12px">“Maker / bias” names the vendor behind each item — useful context, since coverage volume often tracks marketing cycles as much as merit.</p>
    ${foot(2)}
  `));

  // ---------- Page 3: Breakdown ----------
  const byDelta = [...items].sort((a, b) => b.delta - a.delta);
  const leaders = byDelta.slice(0, 5);
  const laggards = byDelta.slice(-5).reverse();
  const discussed = [...items].sort((a, b) => (b.counts.hn + b.counts.reddit) - (a.counts.hn + a.counts.reddit)).slice(0, 6);
  const maxDisc = Math.max(1, ...discussed.map((i) => i.counts.hn + i.counts.reddit));
  // source contribution = sum of normalized signals across items
  const contrib = { hn: 0, reddit: 0, news: 0, wiki: 0 };
  items.forEach((i) => { contrib.hn += i.signals.hn; contrib.reddit += i.signals.reddit; contrib.news += i.signals.news; contrib.wiki += i.signals.wiki; });
  const contribTotal = contrib.hn + contrib.reddit + contrib.news + contrib.wiki || 1;

  root.appendChild(page(`
    <div class="eyebrow">Section 2</div>
    <h2>Momentum &amp; discussion breakdown</h2>
    <div class="cols2">
      <div class="section">
        <h2>Leaders — biggest weekly gains</h2>
        ${leaders.map((it) => bar(it.name, Math.min(100, 50 + it.delta), pct(it.delta), 'g')).join('')}
      </div>
      <div class="section">
        <h2>Laggards — cooling off</h2>
        ${laggards.map((it) => bar(it.name, Math.max(3, Math.min(100, 50 + it.delta)), pct(it.delta), 'r')).join('')}
      </div>
    </div>
    <div class="section">
      <h2>Most discussed (HN + Reddit threads)</h2>
      ${discussed.map((it) => bar(it.name, ((it.counts.hn + it.counts.reddit) / maxDisc) * 100, `${it.counts.hn + it.counts.reddit}`, 'h')).join('')}
    </div>
    <div class="section">
      <h2>Where the buzz comes from</h2>
      <p class="small muted">Share of total normalized signal across the top ${items.length}, by source role.</p>
      ${bar('Hacker News', contrib.hn / contribTotal * 100, (contrib.hn / contribTotal * 100).toFixed(0) + '%')}
      ${bar('Reddit', contrib.reddit / contribTotal * 100, (contrib.reddit / contribTotal * 100).toFixed(0) + '%')}
      ${bar('Google News', contrib.news / contribTotal * 100, (contrib.news / contribTotal * 100).toFixed(0) + '%')}
      ${bar('Wikipedia', contrib.wiki / contribTotal * 100, (contrib.wiki / contribTotal * 100).toFixed(0) + '%')}
    </div>
    ${foot(3)}
  `));

  // ---------- Page 4: Wikipedia deep-dive ----------
  const wikiSorted = [...items].sort((a, b) => b.metric - a.metric);
  const maxWiki = Math.max(...wikiSorted.map((i) => i.metric));
  root.appendChild(page(`
    <div class="eyebrow">Section 3 · Source deep-dive</div>
    <h2>Wikipedia pageviews — the primary metric</h2>
    <p class="small">Wikipedia's pageview API supplies each item's core metric and 30-day trend line. It is a clean, key-free proxy for genuine public curiosity: people look something up when they hear about it. Below, the top ${items.length} ranked by 7-day pageviews, independent of social buzz.</p>
    <div class="section" style="margin-top:14px">
      <h2>7-day pageviews, ranked</h2>
      ${wikiSorted.map((it) => bar(it.name, it.metric / maxWiki * 100, fmtK(it.metric))).join('')}
    </div>
    <div class="cols2">
      <div class="section">
        <h3>Fastest-rising curiosity</h3>
        <table><thead><tr><th>Item</th><th class="num">Δ 7-day</th></tr></thead><tbody>
          ${[...items].sort((a, b) => b.delta - a.delta).slice(0, 5).map((it) => `<tr><td>${it.name}</td><td class="num up">${pct(it.delta)}</td></tr>`).join('')}
        </tbody></table>
      </div>
      <div class="section">
        <h3>What this source can &amp; can't tell you</h3>
        <ul class="tight">
          <li>Reflects search + curiosity, not sentiment or intent.</li>
          <li>Shared articles (e.g. GPU generations) attribute views to a family, not one SKU.</li>
          <li>Weekend dips are normal; the 7-day window smooths them.</li>
          <li>New products may lack a stable article, understating early interest.</li>
        </ul>
      </div>
    </div>
    ${foot(4)}
  `));

  // ---------- Page 5: Decision framing ----------
  // Conviction = buzz strength confirmed across multiple independent sources + positive momentum.
  const scored = items.map((it) => {
    const confirms = [it.signals.hn, it.signals.reddit, it.signals.news, it.signals.wiki].filter((s) => s >= 25).length;
    const momentum = Math.max(0, Math.min(1, (it.delta + 20) / 60));
    const conviction = Math.round((it.buzzScore * 0.5) + (confirms / 4 * 100) * 0.3 + momentum * 100 * 0.2);
    return { ...it, confirms, conviction };
  }).sort((a, b) => b.conviction - a.conviction);
  const screened = scored.filter((it) => it.confirms >= 2 && it.delta > 0).slice(0, 6);

  root.appendChild(page(`
    <div class="eyebrow">Section 4 · Decision framing</div>
    <h2>Worth paying attention to right now?</h2>
    <p class="small">This page screens for items with <b>real, cross-confirmed momentum</b> — buzz that shows up in
      at least two independent sources <i>and</i> rising Wikipedia curiosity. Conviction blends buzz strength (50%),
      cross-source confirmation (30%) and weekly momentum (20%). It ranks <i>attention durability</i>, nothing more.</p>
    <table style="margin-top:10px">
      <thead><tr><th>Item</th><th class="num">Buzz</th><th class="num">Sources confirming</th><th class="num">Δ wk</th><th class="num">Conviction</th></tr></thead>
      <tbody>
        ${(screened.length ? screened : scored.slice(0, 6)).map((it) => `<tr>
          <td><b>${it.name}</b> <span class="muted">· ${it.category}</span></td>
          <td class="num">${it.buzzScore.toFixed(1)}</td>
          <td class="num">${it.confirms} / 4</td>
          <td class="num ${it.delta >= 0 ? 'up' : 'down'}">${pct(it.delta)}</td>
          <td class="num"><span class="conv-badge">${it.conviction}</span></td>
        </tr>`).join('')}
      </tbody>
    </table>
    ${screened.length === 0 ? '<p class="small muted" style="margin-top:10px">No item currently clears the cross-confirmation + positive-momentum screen; the table shows the highest-conviction items regardless.</p>' : ''}
    <div class="caution">
      <b>Caution.</b> High buzz is not a buy signal. Attention spikes around launches, leaks and controversy alike —
      and often peaks exactly when hype (and price) is highest. Treat this as a “what to research” list, not a
      recommendation. <b>For research and general interest only — not purchasing, financial, or investment advice.</b>
    </div>
    ${foot(5)}
  `));

  // ---------- Page 6: Per-item detail cards ----------
  root.appendChild(page(`
    <div class="eyebrow">Section 5</div>
    <h2>Per-item detail</h2>
    <p class="small muted">Each card: 30-day Wikipedia trend and the normalized signals (0–100) behind the buzz score.</p>
    <div class="cards" style="margin-top:10px">
      ${items.map((it) => {
        const cid = 'c-' + it.id;
        canvases.push({ id: cid, series: it.series, up: it.delta >= 0 });
        return `<div class="card">
          <div class="c-head"><span class="c-name">${it.name}</span><span class="c-rank">#${it.rank} · buzz ${it.buzzScore.toFixed(1)}</span></div>
          <canvas id="${cid}"></canvas>
          <div class="c-sig">
            <span>HN ${it.signals.hn}</span><span>Reddit ${it.signals.reddit}</span>
            <span>News ${it.signals.news}</span><span>Wiki ${it.signals.wiki}</span>
            <span>${it.metric.toLocaleString('en-US')} views</span><span>${pct(it.delta)}</span>
          </div>
        </div>`;
      }).join('')}
    </div>
    ${foot(6)}
  `));

  // ---------- Page 7: Methodology ----------
  root.appendChild(page(`
    <div class="eyebrow">Section 6</div>
    <h2>Methodology, sources &amp; limitations</h2>
    <div class="section">
      <h3>Buzz score formula</h3>
      <div class="formula">buzz = 3.0·HN + 2.5·Reddit + 2.0·News + 1.5·Wikipedia<br>
        <span class="muted">— each signal normalized 0–100 across the ranked set, then rescaled to 0–100.</span></div>
      <p class="small">A two-phase pipeline: cheap batch signals (HN front page, Reddit hot, broad news) score the full
        catalog; the top ~18 candidates are then enriched with per-item Wikipedia pageviews and news search, and re-ranked.
        Only items with a valid Wikipedia series (the primary metric) are kept.</p>
    </div>
    <div class="section">
      <h3>Data sources</h3>
      <table>
        <thead><tr><th>Source</th><th>Role</th><th>Field(s) read</th></tr></thead>
        <tbody>
          ${D.meta.sources.map((s) => `<tr><td><b>${s.name}</b></td><td>${s.role}</td><td class="muted">${s.field}</td></tr>`).join('')}
        </tbody>
      </table>
      <p class="small muted" style="margin-top:6px">All sources are free and require no API key. Every fetch is wrapped so a single failure can't break the report; if all sources are unreachable, a labeled demo dataset is served instead.</p>
    </div>
    <div class="section">
      <h3>Limitations</h3>
      <ul class="tight">
        <li>Measures <b>attention</b>, not quality, reliability or value.</li>
        <li>English-language sources; global/non-English interest is under-counted.</li>
        <li>Catalog is curated — items outside it are invisible, however trendy.</li>
        <li>Shared Wikipedia articles attribute views to a product family, not a single model.</li>
        <li>Cached ${D.meta.cacheSeconds}s; a snapshot, not a real-time feed.</li>
      </ul>
    </div>
    <div class="caution">
      <b>Disclaimer.</b> TechPulse is for research and general interest only. It is <b>not</b> purchasing,
      financial, investment, or professional advice. Do your own research before making any decision.
    </div>
    ${foot(7)}
  `));

  // draw per-item card canvases
  requestAnimationFrame(() => canvases.forEach((c) => {
    const cv = document.getElementById(c.id);
    if (cv) drawCard(cv, c.series, c.up ? '#006300' : '#c0392b');
  }));
}

// ---- helpers ----
function page(html) {
  const s = document.createElement('section');
  s.className = 'page';
  s.innerHTML = html;
  return s;
}
function stat(k, v, s) {
  return `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s || ''}</div></div>`;
}
function bar(label, widthPct, val, cls) {
  const w = Math.max(2, Math.min(100, widthPct));
  return `<div class="barrow"><span class="lbl" title="${label}">${label}</span>
    <span class="bar ${cls || ''}" style="width:${w}%"></span><span class="val">${val}</span></div>`;
}
function drawCard(cv, series, color) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || 220, h = 46;
  cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const vals = series.map((d) => d.value);
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1, pad = 3;
  const X = (i) => pad + (i / (vals.length - 1)) * (w - 2 * pad);
  const Y = (v) => h - pad - ((v - min) / span) * (h - 2 * pad);
  ctx.beginPath(); ctx.moveTo(X(0), Y(vals[0]));
  vals.forEach((v, i) => ctx.lineTo(X(i), Y(v)));
  ctx.lineTo(X(vals.length - 1), h - pad); ctx.lineTo(X(0), h - pad); ctx.closePath();
  ctx.fillStyle = color + '20'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(X(0), Y(vals[0]));
  vals.forEach((v, i) => ctx.lineTo(X(i), Y(v)));
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke();
}
