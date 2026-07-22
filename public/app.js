'use strict';

/* TechPulse dashboard — hand-drawn canvas charts, zero libraries. */

// --- Categorical palette (dataviz reference instance), per theme. Assigned in
// fixed slot order, never cycled. Combined chart caps at the safe leading set. ---
const SERIES = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'],
};
const MAX_SERIES = 6; // strongest items overlaid on the combined chart

const els = {
  banner: document.getElementById('demo-banner'),
  tiles: document.getElementById('tiles'),
  combined: document.getElementById('combined'),
  legend: document.getElementById('combined-legend'),
  body: document.getElementById('rank-body'),
  grid: document.getElementById('mini-grid'),
  meta: document.getElementById('meta-line'),
  refresh: document.getElementById('refresh'),
  auto: document.getElementById('autorefresh'),
  theme: document.getElementById('theme'),
};

let DATA = null;
let hidden = new Set(); // combined-chart series toggled off (by item id)
let autoTimer = null;

// ---- theme ----
function theme() {
  return document.documentElement.getAttribute('data-theme')
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('tp-theme', t); } catch (_) {}
  if (DATA) render();
}
(function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('tp-theme'); } catch (_) {}
  if (saved) document.documentElement.setAttribute('data-theme', saved);
})();

// ---- HiDPI canvas ----
function setupCanvas(cv, cssHeight) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || cv.parentElement.clientWidth;
  const h = cssHeight || cv.clientHeight || 120;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

// ---- number formatting ----
const fmtInt = (n) => n.toLocaleString('en-US');
const fmtK = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n));

// ---- sparkline ----
function drawSpark(cv, series, color) {
  const { ctx, w, h } = setupCanvas(cv, cv.clientHeight || 28);
  ctx.clearRect(0, 0, w, h);
  const vals = series.map((d) => d.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const pad = 3, span = max - min || 1;
  const x = (i) => pad + (i / (vals.length - 1)) * (w - 2 * pad);
  const y = (v) => h - pad - ((v - min) / span) * (h - 2 * pad);
  // area
  ctx.beginPath();
  ctx.moveTo(x(0), y(vals[0]));
  vals.forEach((v, i) => ctx.lineTo(x(i), y(v)));
  ctx.lineTo(x(vals.length - 1), h - pad);
  ctx.lineTo(x(0), h - pad);
  ctx.closePath();
  ctx.fillStyle = color + '22';
  ctx.fill();
  // line
  ctx.beginPath();
  ctx.moveTo(x(0), y(vals[0]));
  vals.forEach((v, i) => ctx.lineTo(x(i), y(v)));
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();
  // end dot
  ctx.beginPath();
  ctx.arc(x(vals.length - 1), y(vals[vals.length - 1]), 2.2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

// ---- mini chart (bigger sparkline with baseline) ----
function drawMini(cv, series, color) {
  drawSpark(cv, series, color);
}

// ---- combined multi-series chart, indexed to 100 ----
let combinedState = null; // { items, geom } for hover
function drawCombined() {
  const cv = els.combined;
  const { ctx, w, h } = setupCanvas(cv, 320);
  ctx.clearRect(0, 0, w, h);
  const pal = SERIES[theme()];
  const gridC = cssVar('--grid'), axisC = cssVar('--muted'), textC = cssVar('--text-2');

  const items = DATA.items.slice(0, MAX_SERIES).map((it, i) => ({
    it, color: pal[i % pal.length],
    indexed: it.series.map((d) => (it.series[0].value ? (d.value / it.series[0].value) * 100 : 100)),
  }));
  const active = items.filter((s) => !hidden.has(s.it.id));

  const padL = 44, padR = 14, padT = 14, padB = 26;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const len = DATA.items[0].series.length;

  let lo = 100, hi = 100;
  for (const s of active) for (const v of s.indexed) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (!isFinite(lo)) { lo = 80; hi = 120; }
  lo = Math.floor(lo / 10) * 10 - 5; hi = Math.ceil(hi / 10) * 10 + 5;
  const span = hi - lo || 1;

  const X = (i) => padL + (i / (len - 1)) * plotW;
  const Y = (v) => padT + (1 - (v - lo) / span) * plotH;

  // gridlines + y labels
  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const steps = 4;
  for (let g = 0; g <= steps; g++) {
    const v = lo + (span * g) / steps;
    const yy = Y(v);
    ctx.strokeStyle = gridC; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w - padR, yy); ctx.stroke();
    ctx.fillStyle = axisC; ctx.textAlign = 'right';
    ctx.fillText(Math.round(v), padL - 8, yy);
  }
  // baseline (100) emphasized
  ctx.strokeStyle = axisC; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(padL, Y(100)); ctx.lineTo(w - padR, Y(100)); ctx.stroke();
  ctx.setLineDash([]);

  // x labels (first / mid / last date)
  ctx.fillStyle = axisC; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const dates = DATA.items[0].series;
  [0, Math.floor(len / 2), len - 1].forEach((i) => {
    ctx.fillText(dates[i].date.slice(5), X(i), h - padB + 6);
  });

  // series lines
  for (const s of active) {
    ctx.beginPath();
    s.indexed.forEach((v, i) => { const px = X(i), py = Y(v); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.stroke();
  }
  combinedState = { items, active, X, Y, len, padL, padR, padT, padB, w, h, lo, span };
}

function combinedHover(evt) {
  if (!combinedState) return;
  const cv = els.combined;
  const rect = cv.getBoundingClientRect();
  const mx = evt.clientX - rect.left;
  const { active, X, Y, len, padL, padT, padB, w, padR } = combinedState;
  const plotW = w - padL - padR;
  if (mx < padL || mx > w - padR || !active.length) { hideTip(); redrawOverlayClear(); return; }
  const i = Math.round(((mx - padL) / plotW) * (len - 1));
  drawCombined();
  const { ctx, h } = { ctx: cv.getContext('2d'), h: cv.clientHeight };
  ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
  // crosshair
  ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
  ctx.beginPath(); ctx.moveTo(X(i), padT); ctx.lineTo(X(i), h - padB); ctx.stroke();
  ctx.setLineDash([]);
  const rows = [];
  for (const s of active) {
    const v = s.indexed[i];
    ctx.beginPath(); ctx.arc(X(i), Y(v), 3.5, 0, Math.PI * 2);
    ctx.fillStyle = s.color; ctx.fill();
    ctx.strokeStyle = cssVar('--surface'); ctx.lineWidth = 1.5; ctx.stroke();
    rows.push({ color: s.color, name: s.it.name, val: Math.round(v) });
  }
  rows.sort((a, b) => b.val - a.val);
  const date = DATA.items[0].series[i].date;
  showTip(evt, `<div style="font-weight:600;margin-bottom:4px">${date}</div>` +
    rows.map((r) => `<div class="tt-row"><span><span class="tt-dot" style="background:${r.color}"></span>${r.name}</span><b>${r.val}</b></div>`).join(''));
}
function redrawOverlayClear() { if (combinedState) drawCombined(); }

// ---- tooltip ----
let tipEl = null;
function tip() {
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tooltip'; document.body.appendChild(tipEl); }
  return tipEl;
}
function showTip(evt, html) {
  const t = tip(); t.innerHTML = html; t.classList.add('on');
  const pad = 14; let x = evt.clientX + pad, y = evt.clientY + pad;
  const r = t.getBoundingClientRect();
  if (x + r.width > innerWidth) x = evt.clientX - r.width - pad;
  if (y + r.height > innerHeight) y = evt.clientY - r.height - pad;
  t.style.left = x + 'px'; t.style.top = y + 'px';
}
function hideTip() { if (tipEl) tipEl.classList.remove('on'); }

// ---- render ----
function render() {
  // banner
  els.banner.hidden = !DATA.demo;

  // tiles
  const c = DATA.counts, ctx = DATA.context;
  const topItem = DATA.items[0];
  els.tiles.innerHTML = `
    ${tile('Items ranked', c.items, `from ${c.candidates} candidates`)}
    ${tile('Avg 7-day views', fmtInt(c.avgMetric), 'across the top 10')}
    ${tile('Top by buzz', topItem.name, `buzz ${topItem.buzzScore.toFixed(1)}`)}
    ${gaugeTile('Industry heat', ctx.heatIndex, ctx.label)}
  `;

  // combined + legend
  drawCombined();
  const pal = SERIES[theme()];
  els.legend.innerHTML = '';
  DATA.items.slice(0, MAX_SERIES).forEach((it, i) => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (hidden.has(it.id) ? ' off' : '');
    chip.setAttribute('role', 'listitem');
    chip.innerHTML = `<span class="dot" style="background:${pal[i % pal.length]}"></span>${it.name}`;
    chip.onclick = () => { hidden.has(it.id) ? hidden.delete(it.id) : hidden.add(it.id); render(); };
    els.legend.appendChild(chip);
  });

  // table
  els.body.innerHTML = '';
  DATA.items.forEach((it) => {
    const tr = document.createElement('tr');
    const up = it.delta >= 0;
    tr.innerHTML = `
      <td class="col-rank"><span class="rank-badge ${it.rank <= 3 ? 'top' : ''}">${it.rank}</span></td>
      <td class="col-name"><div class="item-name">${it.name}</div><div class="item-cat">${it.category} · ${it.tag}</div></td>
      <td class="col-spark"><canvas class="spark" width="120" height="30" style="width:120px;height:30px"></canvas></td>
      <td class="col-num">${fmtInt(it.metric)}</td>
      <td class="col-num delta ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(it.delta).toFixed(1)}%</td>
      <td class="col-num buzz-cell">${it.buzzScore.toFixed(1)}</td>
      <td class="col-src"><div class="badges">${it.sources.map((s) => `<span class="badge">${s}</span>`).join('')}</div></td>`;
    els.body.appendChild(tr);
    const cv = tr.querySelector('canvas');
    requestAnimationFrame(() => drawSpark(cv, it.series, up ? cssVar('--good') : cssVar('--bad')));
  });

  // mini grid
  els.grid.innerHTML = '';
  DATA.items.forEach((it, i) => {
    const div = document.createElement('div');
    div.className = 'mini';
    div.innerHTML = `<div class="m-head"><span class="m-name">${it.rank}. ${it.name}</span><span class="m-metric">${fmtK(it.metric)}</span></div>
      <canvas></canvas>`;
    els.grid.appendChild(div);
    const cv = div.querySelector('canvas');
    const color = SERIES[theme()][i % SERIES[theme()].length];
    requestAnimationFrame(() => drawMini(cv, it.series, color));
  });

  // meta
  const when = new Date(DATA.generatedAt).toLocaleString();
  els.meta.textContent = `${DATA.demo ? 'DEMO' : 'LIVE'} · generated ${when} · sources: ${DATA.meta.sources.length} · cache ${DATA.meta.cacheSeconds}s`;
}

function tile(k, v, s) {
  return `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s || ''}</div></div>`;
}
function gaugeTile(k, val, label) {
  return `<div class="tile"><div class="k">${k}</div><div class="v">${val}<span style="font-size:15px;color:var(--muted)"> / 100</span></div>
    <div class="gauge-track"><div class="gauge-fill" style="width:${val}%"></div></div>
    <div class="s">${label}</div></div>`;
}

// ---- data ----
async function load() {
  els.refresh.disabled = true;
  els.refresh.textContent = '…';
  try {
    const res = await fetch('/api/dashboard', { cache: 'no-store' });
    DATA = await res.json();
    render();
  } catch (err) {
    els.meta.textContent = 'Failed to load: ' + err.message;
  } finally {
    els.refresh.disabled = false;
    els.refresh.textContent = '↻ Refresh';
  }
}

// ---- events ----
els.refresh.onclick = load;
els.theme.onclick = () => applyTheme(theme() === 'dark' ? 'light' : 'dark');
els.auto.onchange = () => {
  clearInterval(autoTimer);
  if (els.auto.checked) {
    const secs = (DATA && DATA.meta.cacheSeconds) || 60;
    autoTimer = setInterval(load, secs * 1000);
  }
};
els.combined.addEventListener('mousemove', combinedHover);
els.combined.addEventListener('mouseleave', () => { hideTip(); redrawOverlayClear(); });
let rz;
window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (DATA) render(); }, 150); });
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (DATA && !localStorage.getItem('tp-theme')) render(); });

load();
