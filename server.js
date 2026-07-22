'use strict';

/**
 * TechPulse — zero-dependency Node.js server.
 *
 * Ranks the top tech / gaming items trending right now by aggregating live,
 * key-free public signals (Hacker News, Reddit, Wikipedia pageviews, Google
 * News, GitHub) into a weighted "buzz score", then serves a dashboard and a
 * printable PDF report from the same in-memory payload.
 *
 * Uses only Node built-ins: node:http, node:fs, node:path, node:url, fetch.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { buildDemo, SOURCE_META } = require('./demo-data.js');

const PORT = process.env.PORT || 3000;
const CACHE_SECONDS = 60;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------------------------------------------------------------------------
// Catalog — the universe of tech/gaming items we track. Matching uses three
// strategies: full name, curated aliases (bare identifiers), and category tags.
// `wiki` is the exact Wikipedia article title used for the pageviews time
// series. `strict` items only match by full name / multiword alias to avoid
// false positives on common words.
// ---------------------------------------------------------------------------
const CATALOG = [
  { name: 'GeForce RTX 5090', cat: 'GPU', tag: 'NVIDIA', wiki: 'GeForce_RTX_50_series', aliases: ['RTX 5090', '5090'] },
  { name: 'GeForce RTX 5080', cat: 'GPU', tag: 'NVIDIA', wiki: 'GeForce_RTX_50_series', aliases: ['RTX 5080', '5080'] },
  { name: 'Radeon RX 9070 XT', cat: 'GPU', tag: 'AMD', wiki: 'Radeon_RX_9000_series', aliases: ['RX 9070 XT', 'RX 9070', '9070 XT'] },
  { name: 'Intel Arc B580', cat: 'GPU', tag: 'Intel', wiki: 'Intel_Arc', aliases: ['Arc B580', 'B580'] },
  { name: 'Ryzen 9 9950X3D', cat: 'CPU', tag: 'AMD', wiki: 'Zen_5', aliases: ['9950X3D', 'Ryzen 9 9950X3D'] },
  { name: 'Intel Core Ultra 9 285K', cat: 'CPU', tag: 'Intel', wiki: 'Arrow_Lake_(microprocessor)', aliases: ['Core Ultra 9 285K', '285K', 'Arrow Lake'] },
  { name: 'Snapdragon X Elite', cat: 'Chip', tag: 'Qualcomm', wiki: 'Qualcomm_Snapdragon_X', aliases: ['Snapdragon X Elite', 'Snapdragon X', 'X Elite'] },
  { name: 'Apple M4 Max', cat: 'Chip', tag: 'Apple', wiki: 'Apple_M4', aliases: ['M4 Max', 'Apple M4'] },
  { name: 'NVIDIA Blackwell', cat: 'AI Chip', tag: 'NVIDIA', wiki: 'Blackwell_(microarchitecture)', aliases: ['Blackwell', 'GB200', 'B200'] },
  { name: 'AMD Instinct MI350', cat: 'AI Chip', tag: 'AMD', wiki: 'AMD_Instinct', aliases: ['MI350', 'MI300', 'Instinct MI350'] },
  { name: 'PlayStation 5 Pro', cat: 'Console', tag: 'Sony', wiki: 'PlayStation_5_Pro', aliases: ['PS5 Pro', 'PlayStation 5 Pro'] },
  { name: 'Nintendo Switch 2', cat: 'Console', tag: 'Nintendo', wiki: 'Nintendo_Switch_2', aliases: ['Switch 2'] },
  { name: 'Xbox Series X', cat: 'Console', tag: 'Microsoft', wiki: 'Xbox_Series_X_and_Series_S', aliases: ['Xbox Series X', 'Series X'] },
  { name: 'Steam Deck OLED', cat: 'Handheld', tag: 'Valve', wiki: 'Steam_Deck', aliases: ['Steam Deck OLED', 'Steam Deck'] },
  { name: 'ROG Ally X', cat: 'Handheld', tag: 'Asus', wiki: 'Asus_ROG_Ally', aliases: ['ROG Ally X', 'ROG Ally'] },
  { name: 'Grand Theft Auto VI', cat: 'Game', tag: 'Rockstar', wiki: 'Grand_Theft_Auto_VI', aliases: ['GTA VI', 'GTA 6', 'GTA6'] },
  { name: 'Monster Hunter Wilds', cat: 'Game', tag: 'Capcom', wiki: 'Monster_Hunter_Wilds', aliases: ['Monster Hunter Wilds', 'MH Wilds'] },
  { name: 'Elden Ring Nightreign', cat: 'Game', tag: 'FromSoftware', wiki: 'Elden_Ring:_Nightreign', aliases: ['Elden Ring Nightreign', 'Nightreign'] },
  { name: 'Death Stranding 2', cat: 'Game', tag: 'Kojima', wiki: 'Death_Stranding_2:_On_the_Beach', aliases: ['Death Stranding 2'] },
  { name: 'Assassin’s Creed Shadows', cat: 'Game', tag: 'Ubisoft', wiki: 'Assassin\'s_Creed_Shadows', aliases: ['Assassin\'s Creed Shadows', 'AC Shadows'], strict: true },
  { name: 'iPhone 16', cat: 'Phone', tag: 'Apple', wiki: 'IPhone_16', aliases: ['iPhone 16'] },
  { name: 'Samsung Galaxy S25', cat: 'Phone', tag: 'Samsung', wiki: 'Samsung_Galaxy_S25', aliases: ['Galaxy S25', 'S25'] },
  { name: 'Google Pixel 9', cat: 'Phone', tag: 'Google', wiki: 'Pixel_9', aliases: ['Pixel 9'] },
  { name: 'DeepSeek', cat: 'Software', tag: 'DeepSeek', wiki: 'DeepSeek', aliases: ['DeepSeek'] },
  { name: 'ChatGPT', cat: 'Software', tag: 'OpenAI', wiki: 'ChatGPT', aliases: ['ChatGPT'] },
  { name: 'Windows 11', cat: 'Software', tag: 'Microsoft', wiki: 'Windows_11', aliases: ['Windows 11'] },
  { name: 'DLSS 4', cat: 'Software', tag: 'NVIDIA', wiki: 'Deep_learning_super_sampling', aliases: ['DLSS 4', 'DLSS'] },
  { name: 'Apple Vision Pro', cat: 'VR', tag: 'Apple', wiki: 'Apple_Vision_Pro', aliases: ['Vision Pro'] },
  { name: 'Meta Quest 3', cat: 'VR', tag: 'Meta', wiki: 'Meta_Quest_3', aliases: ['Quest 3', 'Meta Quest 3'] },
];

// Common words we never treat as a bare identifier match.
const STOPWORDS = new Set(['the', 'dark', 'ages', 'shadows', 'series', 'x', 'pro', 'max', 'elite', 'wilds', 'deck', 'core', 'arc']);

// Subreddits scanned for community attention.
const SUBREDDITS = ['hardware', 'gadgets', 'pcgaming', 'Games', 'technology', 'nvidia', 'Amd', 'intel', 'buildapc', 'GamingLeaksAndRumours'];

// Precompute a matcher per catalog item.
for (const it of CATALOG) {
  it.id = it.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const parts = [it.name, ...it.aliases].filter((a) => {
    if (it.strict && !a.includes(' ')) return false; // strict: multiword only
    return !STOPWORDS.has(a.toLowerCase());
  });
  const escaped = parts
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length);
  it.re = new RegExp('(?:^|[^\\w])(' + escaped.join('|') + ')(?![\\w])', 'i');
}

// ---------------------------------------------------------------------------
// Fetch helpers — every source is wrapped so one failure can't break the app.
// ---------------------------------------------------------------------------
const UA = 'TechPulse/1.0 (zero-dep aggregator; +https://example.com)';

async function getText(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

async function getJSON(url, timeoutMs = 8000) {
  return JSON.parse(await getText(url, timeoutMs));
}

async function safe(label, fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[warn] source "${label}" failed: ${err.message}`);
    return fallback;
  }
}

function decodeEntities(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
}

// ---------------------------------------------------------------------------
// Source adapters.
// ---------------------------------------------------------------------------

// Hacker News via Algolia: front-page + a broad tech query. Attention signal.
async function fetchHN() {
  const urls = [
    'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=50',
    'https://hn.algolia.com/api/v1/search_by_date?tags=story&query=gpu%20OR%20console%20OR%20chip&hitsPerPage=50',
  ];
  const posts = [];
  for (const u of urls) {
    const data = await getJSON(u);
    for (const h of data.hits || []) {
      if (!h.title) continue;
      posts.push({
        title: h.title,
        points: h.points || 0,
        comments: h.num_comments || 0,
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      });
    }
  }
  return posts;
}

// Reddit hot posts across tech subreddits. Community attention signal.
async function fetchReddit() {
  const posts = [];
  await Promise.all(
    SUBREDDITS.map((sub) =>
      safe(`reddit/${sub}`, async () => {
        const data = await getJSON(`https://www.reddit.com/r/${sub}/hot.json?limit=40`);
        for (const c of data.data.children || []) {
          const d = c.data;
          if (!d || d.stickied) continue;
          posts.push({ title: d.title, score: d.score || 0, comments: d.num_comments || 0, url: 'https://reddit.com' + d.permalink, sub });
        }
      }, null)
    )
  );
  return posts;
}

// Broad tech Google News RSS (cheap, batch). Attention signal + fallback headlines.
async function fetchNewsBatch() {
  const xml = await getText('https://news.google.com/rss/search?q=technology%20OR%20gaming%20hardware%20when:7d&hl=en-US&gl=US&ceid=US:en');
  return parseRss(xml);
}

// Per-item Google News search (enrichment phase). Returns count + headlines.
async function fetchNewsFor(item) {
  const q = encodeURIComponent(`"${item.name}" when:14d`);
  const xml = await getText(`https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`, 7000);
  return parseRss(xml).slice(0, 6);
}

function parseRss(xml) {
  const items = [];
  const blocks = xml.split('<item>').slice(1);
  for (const b of blocks) {
    const title = (b.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
    const link = (b.match(/<link>([\s\S]*?)<\/link>/) || [])[1];
    const date = (b.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1];
    const src = (b.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1];
    if (!title) continue;
    let t = decodeEntities(title.trim());
    let source = src ? decodeEntities(src.trim()) : '';
    // Google News appends " - Publisher" to titles.
    if (!source) {
      const m = t.match(/^(.*)\s-\s([^-]+)$/);
      if (m) { t = m[1].trim(); source = m[2].trim(); }
    }
    items.push({ title: t, source, url: link ? decodeEntities(link.trim()) : '#', date: date ? date.trim() : '' });
  }
  return items;
}

// Wikipedia daily pageviews (primary metric + time series). Per-item, enrichment.
async function fetchWikiSeries(item) {
  const end = new Date();
  const start = new Date(end.getTime() - 31 * 86400000);
  const fmt = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const title = encodeURIComponent(item.wiki);
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/${title}/daily/${fmt(start)}/${fmt(end)}`;
  const data = await getJSON(url, 9000);
  const series = (data.items || []).map((d) => ({
    date: `${d.timestamp.slice(0, 4)}-${d.timestamp.slice(4, 6)}-${d.timestamp.slice(6, 8)}`,
    value: d.views,
  }));
  if (series.length < 5) throw new Error('insufficient series');
  return series.slice(-30);
}

// GitHub developer interest (software/AI items). Best-effort, unauthenticated.
async function fetchGitHub(item) {
  const q = encodeURIComponent(item.name);
  const data = await getJSON(`https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=5`, 7000);
  return (data.items || []).reduce((a, r) => a + (r.stargazers_count || 0), 0);
}

// ---------------------------------------------------------------------------
// Matching + scoring.
// ---------------------------------------------------------------------------
function matchInto(bucket, text, weightPoints) {
  for (const it of CATALOG) {
    if (it.re.test(text)) {
      const rec = bucket[it.id] || (bucket[it.id] = { count: 0, weight: 0 });
      rec.count += 1;
      rec.weight += weightPoints;
    }
  }
}

function normalize(items, key) {
  const max = Math.max(1, ...items.map((i) => i.raw[key] || 0));
  return (v) => (v / max) * 100;
}

async function buildLive() {
  // --- Phase 1: cheap batch signals -------------------------------------
  const [hn, reddit, newsBatch] = await Promise.all([
    safe('hackernews', fetchHN, []),
    safe('reddit', fetchReddit, []),
    safe('googlenews-batch', fetchNewsBatch, []),
  ]);

  const hnBucket = {}, reBucket = {}, neBucket = {};
  for (const p of hn) matchInto(hnBucket, p.title, p.points + 2 * p.comments);
  for (const p of reddit) matchInto(reBucket, p.title, p.score + 2 * p.comments);
  for (const n of newsBatch) matchInto(neBucket, n.title, 5);

  // Preliminary candidates: any item with at least one batch signal.
  let candidates = CATALOG.map((it) => {
    const hnR = hnBucket[it.id] || { count: 0, weight: 0 };
    const reR = reBucket[it.id] || { count: 0, weight: 0 };
    const neR = neBucket[it.id] || { count: 0, weight: 0 };
    return {
      ref: it,
      id: it.id, name: it.name, category: it.cat, tag: it.tag,
      counts: { hn: hnR.count, reddit: reR.count, news: neR.count },
      raw: { hn: hnR.weight, reddit: reR.weight, news: neR.count, wiki: 0 },
      prelim: 3 * hnR.weight + 2.5 * reR.weight + 2 * neR.count,
    };
  }).filter((c) => c.prelim > 0);

  if (candidates.length === 0) throw new Error('no live candidates from batch signals');

  // Two-phase: keep the top ~18 by cheap score, then enrich the expensive bits.
  candidates.sort((a, b) => b.prelim - a.prelim);
  candidates = candidates.slice(0, 18);

  // --- Phase 2: per-item enrichment (Wikipedia + per-item news + GitHub) -
  await Promise.all(
    candidates.map(async (c) => {
      const [series, news, gh] = await Promise.all([
        safe(`wiki/${c.id}`, () => fetchWikiSeries(c.ref), null),
        safe(`news/${c.id}`, () => fetchNewsFor(c.ref), []),
        c.category === 'Software' || c.category === 'AI Chip'
          ? safe(`github/${c.id}`, () => fetchGitHub(c.ref), 0)
          : Promise.resolve(0),
      ]);
      c.series = series;
      c.headlines = news;
      c.githubStars = gh;
      if (news.length) { c.counts.news = news.length; c.raw.news = news.length; }
    })
  );

  // Keep only candidates that actually have primary (Wikipedia) data.
  let items = candidates.filter((c) => c.series && c.series.length >= 5);
  if (items.length === 0) throw new Error('no candidates with primary data');

  // Compute Wikipedia-derived metric + delta.
  for (const it of items) {
    const s = it.series;
    const last7 = s.slice(-7).reduce((a, b) => a + b.value, 0);
    const prev7 = s.slice(-14, -7).reduce((a, b) => a + b.value, 0);
    it.metric = last7;
    it.metricLabel = '7-day Wikipedia views';
    it.delta = prev7 ? ((last7 - prev7) / prev7) * 100 : 0;
    it.raw.wiki = last7;
  }

  // Normalize each signal 0..100 across the surviving set, then weight.
  const nHn = normalize(items, 'hn'), nRe = normalize(items, 'reddit');
  const nNe = normalize(items, 'news'), nWi = normalize(items, 'wiki');
  for (const it of items) {
    it.signals = {
      hn: Math.round(nHn(it.raw.hn)),
      reddit: Math.round(nRe(it.raw.reddit)),
      news: Math.round(nNe(it.raw.news)),
      wiki: Math.round(nWi(it.raw.wiki)),
    };
    it.buzzRaw = 3.0 * nHn(it.raw.hn) + 2.5 * nRe(it.raw.reddit) + 2.0 * nNe(it.raw.news) + 1.5 * nWi(it.raw.wiki);
  }
  const maxBuzz = Math.max(1, ...items.map((i) => i.buzzRaw));
  for (const it of items) {
    it.buzzScore = Math.round((it.buzzRaw / maxBuzz) * 1000) / 10;
    it.sources = [
      it.counts.hn > 0 ? 'HN' : null,
      it.counts.reddit > 0 ? 'Reddit' : null,
      it.counts.news > 0 ? 'News' : null,
      'Wikipedia',
    ].filter(Boolean);
  }

  items.sort((a, b) => b.buzzScore - a.buzzScore);
  const top = items.slice(0, 10).map((it, i) => {
    const { ref, prelim, buzzRaw, ...rest } = it;
    return { ...rest, rank: i + 1 };
  });

  // Context gauge: industry heat from overall attention volume.
  const totalHn = hn.reduce((a, p) => a + p.points + p.comments, 0);
  const totalRe = reddit.reduce((a, p) => a + p.score, 0);
  const heat = Math.max(0, Math.min(100, Math.round(totalHn / 60 + totalRe / 1500 + newsBatch.length * 0.4)));
  const heatLabel = heat >= 80 ? 'Overheated' : heat >= 60 ? 'Hot' : heat >= 35 ? 'Warm' : 'Cool';

  const avgMetric = Math.round(top.reduce((a, b) => a + b.metric, 0) / top.length);

  return {
    generatedAt: new Date().toISOString(),
    demo: false,
    context: { heatIndex: heat, label: heatLabel, note: 'Live industry-heat gauge from aggregate HN + Reddit + news volume.' },
    counts: { items: top.length, candidates: candidates.length, sources: SOURCE_META.length, avgMetric },
    meta: { cacheSeconds: CACHE_SECONDS, sources: SOURCE_META, generatedFrom: 'live' },
    items: top,
  };
}

// ---------------------------------------------------------------------------
// In-memory cache with demo fallback.
// ---------------------------------------------------------------------------
let cache = { at: 0, payload: null, inflight: null };

async function getDashboard() {
  const now = Date.now();
  if (cache.payload && now - cache.at < CACHE_SECONDS * 1000) return cache.payload;
  if (cache.inflight) return cache.inflight;

  cache.inflight = (async () => {
    let payload;
    try {
      payload = await buildLive();
      console.log(`[info] live payload: ${payload.items.length} items, heat ${payload.context.heatIndex}`);
    } catch (err) {
      console.warn(`[warn] all live sources failed (${err.message}); serving DEMO dataset.`);
      payload = buildDemo();
    }
    cache = { at: Date.now(), payload, inflight: null };
    return payload;
  })();
  return cache.inflight;
}

// ---------------------------------------------------------------------------
// Static file serving.
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(res, urlPath) {
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  if (rel === '/report') rel = '/report.html';
  const safePath = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  const file = path.join(PUBLIC_DIR, safePath);
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403).end('Forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------------------------------------------------------------------------
// HTTP server.
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api/dashboard') {
    try {
      const payload = await getDashboard();
      const body = JSON.stringify(payload);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `max-age=${CACHE_SECONDS}` });
      res.end(body);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }
  if (url === '/report') { serveStatic(res, '/report.html'); return; }
  serveStatic(res, url);
});

server.listen(PORT, () => {
  console.log(`TechPulse running at http://localhost:${PORT}`);
  console.log(`Dashboard: /   Report: /report   API: /api/dashboard`);
});

module.exports = { buildLive, getDashboard, CATALOG };
