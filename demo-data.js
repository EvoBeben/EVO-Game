'use strict';

/**
 * TechPulse — labeled OFFLINE fallback dataset.
 *
 * Served only when every live source is unreachable. The payload is shaped
 * identically to the live /api/dashboard response so the UI and report never
 * have to special-case it — the single difference is `demo: true`, which the
 * front-ends surface with a prominent banner. Never present this as live data.
 */

// Deterministic pseudo-random so the demo looks organic but is stable per item.
function seeded(seed) {
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
  return function next() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// Build a plausible 30-day daily series with an upward/downward drift + noise.
function buildSeries(seed, base, drift) {
  const rnd = seeded(seed);
  const days = 30;
  const out = [];
  const now = Date.UTC(2026, 6, 22); // 2026-07-22, matching demo "generatedAt"
  let v = base;
  for (let i = days - 1; i >= 0; i--) {
    const t = new Date(now - i * 86400000);
    v = Math.max(50, v * (1 + drift + (rnd() - 0.5) * 0.22));
    // Weekend dip for realism.
    const dow = t.getUTCDay();
    const weekend = dow === 0 || dow === 6 ? 0.82 : 1;
    out.push({
      date: t.toISOString().slice(0, 10),
      value: Math.round(v * weekend),
    });
  }
  return out;
}

// Seed catalog for the demo. (name, category, tag, base pageviews, drift, hn, reddit, news)
const SEED = [
  ['GeForce RTX 5090', 'GPU', 'NVIDIA', 42000, 0.010, 34, 5100, 41],
  ['Nintendo Switch 2', 'Console', 'Nintendo', 51000, 0.016, 28, 6400, 55],
  ['Grand Theft Auto VI', 'Game', 'Rockstar', 68000, 0.021, 40, 8800, 72],
  ['Radeon RX 9070 XT', 'GPU', 'AMD', 23000, 0.014, 22, 3900, 27],
  ['PlayStation 5 Pro', 'Console', 'Sony', 31000, -0.004, 14, 2600, 19],
  ['Snapdragon X Elite', 'Chip', 'Qualcomm', 15000, 0.006, 19, 1500, 22],
  ['Apple M4 Max', 'Chip', 'Apple', 19500, 0.003, 16, 1800, 24],
  ['Monster Hunter Wilds', 'Game', 'Capcom', 28000, -0.008, 11, 4200, 18],
  ['Steam Deck OLED', 'Handheld', 'Valve', 17000, 0.002, 13, 2900, 12],
  ['NVIDIA Blackwell', 'AI Chip', 'NVIDIA', 21000, 0.012, 31, 1200, 38],
  ['Intel Core Ultra 9 285K', 'CPU', 'Intel', 12500, -0.011, 9, 1400, 10],
  ['Ryzen 9 9950X3D', 'CPU', 'AMD', 16500, 0.007, 15, 2400, 14],
  ['DeepSeek', 'Software', 'DeepSeek', 24000, 0.018, 44, 1900, 49],
  ['iPhone 16', 'Phone', 'Apple', 38000, -0.006, 12, 2100, 33],
  ['Elden Ring Nightreign', 'Game', 'FromSoftware', 22000, 0.009, 10, 3600, 21],
  ['ROG Ally X', 'Handheld', 'Asus', 9800, -0.003, 8, 1300, 7],
  ['Meta Quest 3', 'VR', 'Meta', 13500, -0.007, 7, 1100, 9],
  ['Windows 11', 'Software', 'Microsoft', 29000, 0.001, 18, 1700, 26],
];

function buildDemo() {
  const items = SEED.map((row, idx) => {
    const [name, category, tag, base, drift, hn, reddit, news] = row;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const series = buildSeries(id, base, drift);
    const last7 = series.slice(-7).reduce((a, b) => a + b.value, 0);
    const prev7 = series.slice(-14, -7).reduce((a, b) => a + b.value, 0);
    const delta = prev7 ? ((last7 - prev7) / prev7) * 100 : 0;
    return {
      id, name, category, tag,
      metric: last7,
      metricLabel: '7-day Wikipedia views',
      delta,
      series,
      raw: { hn, reddit, news, wiki: last7 },
      counts: { hn: Math.round(hn / 8), reddit: Math.round(reddit / 300), news },
      headlines: buildHeadlines(name, tag),
    };
  });

  // Score exactly like the live path so the demo exercises the same code shape.
  scoreInPlace(items);
  items.sort((a, b) => b.buzzScore - a.buzzScore);
  const top = items.slice(0, 10).map((it, i) => ({ ...it, rank: i + 1 }));

  const avgMetric = Math.round(top.reduce((a, b) => a + b.metric, 0) / top.length);

  return {
    generatedAt: '2026-07-22T12:00:00.000Z',
    demo: true,
    context: {
      heatIndex: 71,
      label: 'Hot',
      note: 'Sample industry-heat gauge (offline demo).',
    },
    counts: {
      items: top.length,
      candidates: items.length,
      sources: 5,
      avgMetric,
    },
    meta: {
      cacheSeconds: 60,
      sources: SOURCE_META,
      generatedFrom: 'demo-data.js',
    },
    items: top,
  };
}

// Normalize + weight — duplicated intentionally so demo-data.js stays standalone.
function scoreInPlace(items) {
  const maxOf = (k) => Math.max(1, ...items.map((i) => i.raw[k] || 0));
  const mh = maxOf('hn'), mr = maxOf('reddit'), mn = maxOf('news'), mw = maxOf('wiki');
  for (const it of items) {
    const nHn = (it.raw.hn / mh) * 100;
    const nRe = (it.raw.reddit / mr) * 100;
    const nNe = (it.raw.news / mn) * 100;
    const nWi = (it.raw.wiki / mw) * 100;
    it.signals = {
      hn: Math.round(nHn),
      reddit: Math.round(nRe),
      news: Math.round(nNe),
      wiki: Math.round(nWi),
    };
    const raw = 3.0 * nHn + 2.5 * nRe + 2.0 * nNe + 1.5 * nWi;
    it.buzzRaw = raw;
  }
  const maxBuzz = Math.max(1, ...items.map((i) => i.buzzRaw));
  for (const it of items) {
    it.buzzScore = Math.round((it.buzzRaw / maxBuzz) * 1000) / 10; // 0..100, 1dp
    delete it.buzzRaw;
    it.sources = [
      it.counts.hn > 0 ? 'HN' : null,
      it.counts.reddit > 0 ? 'Reddit' : null,
      it.counts.news > 0 ? 'News' : null,
      it.series && it.series.length ? 'Wikipedia' : null,
    ].filter(Boolean);
  }
}

function buildHeadlines(name, tag) {
  return [
    { title: `${name}: what the ${tag} reveal actually means`, source: 'The Verge', url: '#' },
    { title: `Hands-on with ${name} — early impressions`, source: 'Ars Technica', url: '#' },
    { title: `${name} availability and pricing tracker`, source: 'Tom’s Hardware', url: '#' },
  ];
}

const SOURCE_META = [
  { name: 'Hacker News (Algolia)', role: 'Attention / developer buzz', field: 'points, num_comments, title' },
  { name: 'Reddit (tech subreddits)', role: 'Attention / community interest', field: 'score, num_comments, title' },
  { name: 'Wikipedia Pageviews', role: 'Primary metric + time series', field: 'daily views' },
  { name: 'Google News RSS', role: 'Attention / news volume', field: 'item count, headlines' },
  { name: 'GitHub Search', role: 'Developer interest (software items)', field: 'repository stars' },
];

module.exports = { buildDemo, SOURCE_META };
