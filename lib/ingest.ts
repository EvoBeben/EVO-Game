import { getDb, nowIso, type DB } from './db';
import { recordUnmatched, upsertMarketPoint, upsertOffer } from './db/upsert';
import { matchProduct, type MatchCandidate } from './match';
import { indexSources, sources as allSources } from './sources/registry';
import type { IndexSource, RawOffer, Source } from './sources/types';

export interface SourceRunResult {
  sourceKey: string;
  status: 'ok' | 'skipped' | 'error';
  detail: string | null;
  offersSeen: number;
  offersUpserted: number;
  unmatched: number;
}

export interface IngestResult {
  startedAt: string;
  finishedAt: string;
  runs: SourceRunResult[];
}

/**
 * Search phrases derived from the catalogue. Adapters take these and hand back
 * whatever their retailer sells — matching then decides what belongs to which
 * canonical product.
 */
export function buildSearchTerms(db: DB = getDb(), limit = 60): string[] {
  const rows = db
    .prepare('SELECT brand, model, name FROM products ORDER BY category, brand, model LIMIT ?')
    .all(limit) as { brand: string; model: string; name: string }[];

  const terms = new Set<string>();
  for (const row of rows) {
    terms.add(`${row.brand} ${row.model}`.trim());
  }
  return [...terms];
}

function loadCandidates(db: DB, category?: string): MatchCandidate[] {
  const rows = category
    ? (db
        .prepare('SELECT id, name, brand, model, mpn, upc FROM products WHERE category = ?')
        .all(category) as MatchCandidate[])
    : (db.prepare('SELECT id, name, brand, model, mpn, upc FROM products').all() as MatchCandidate[]);
  return rows;
}

function storeIdMap(db: DB): Map<string, number> {
  const rows = db.prepare('SELECT id, slug FROM stores').all() as { id: number; slug: string }[];
  return new Map(rows.map((r) => [r.slug, r.id]));
}

function recordRun(db: DB, result: SourceRunResult, startedAt: string, finishedAt: string): void {
  db.prepare(
    `INSERT INTO source_runs (source_key, started_at, finished_at, status, detail,
                              offers_seen, offers_upserted, unmatched)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    result.sourceKey,
    startedAt,
    finishedAt,
    result.status,
    result.detail,
    result.offersSeen,
    result.offersUpserted,
    result.unmatched,
  );
}

/** Applies one adapter's harvest to the database. */
export function persistOffers(
  sourceKey: string,
  raws: RawOffer[],
  db: DB = getDb(),
  observedAt: string = nowIso(),
): { upserted: number; unmatched: number } {
  const candidates = loadCandidates(db);
  const stores = storeIdMap(db);

  let upserted = 0;
  let unmatched = 0;

  const apply = db.transaction((batch: RawOffer[]) => {
    for (const raw of batch) {
      const storeId = stores.get(raw.storeSlug);
      if (storeId == null) {
        // An adapter named a store that isn't registered — a config bug, not
        // a data problem, so surface it rather than silently dropping.
        unmatched += 1;
        recordUnmatched(sourceKey, raw, db);
        continue;
      }

      const match = matchProduct(
        { title: raw.title, mpn: raw.mpn, upc: raw.upc, brand: raw.brand },
        candidates,
      );

      if (!match) {
        unmatched += 1;
        recordUnmatched(sourceKey, raw, db);
        continue;
      }

      upsertOffer(match.productId, storeId, raw, observedAt, db);
      upserted += 1;
    }
  });

  apply(raws);
  return { upserted, unmatched };
}

async function runSource(source: Source, terms: string[], db: DB): Promise<SourceRunResult> {
  const availability = source.availability();
  if (!availability.enabled) {
    return {
      sourceKey: source.key,
      status: 'skipped',
      detail: availability.reason,
      offersSeen: 0,
      offersUpserted: 0,
      unmatched: 0,
    };
  }

  try {
    const raws = await source.search({ terms });
    const { upserted, unmatched } = persistOffers(source.key, raws, db);
    return {
      sourceKey: source.key,
      status: 'ok',
      detail: null,
      offersSeen: raws.length,
      offersUpserted: upserted,
      unmatched,
    };
  } catch (error) {
    return {
      sourceKey: source.key,
      status: 'error',
      detail: error instanceof Error ? error.message : String(error),
      offersSeen: 0,
      offersUpserted: 0,
      unmatched: 0,
    };
  }
}

async function runIndexSource(source: IndexSource, db: DB): Promise<SourceRunResult> {
  const availability = source.availability();
  if (!availability.enabled) {
    return {
      sourceKey: source.key,
      status: 'skipped',
      detail: availability.reason,
      offersSeen: 0,
      offersUpserted: 0,
      unmatched: 0,
    };
  }

  try {
    const points = await source.fetchSeries();
    const apply = db.transaction(() => {
      for (const point of points) upsertMarketPoint(point, db);
    });
    apply();
    return {
      sourceKey: source.key,
      status: 'ok',
      detail: null,
      offersSeen: points.length,
      offersUpserted: points.length,
      unmatched: 0,
    };
  } catch (error) {
    return {
      sourceKey: source.key,
      status: 'error',
      detail: error instanceof Error ? error.message : String(error),
      offersSeen: 0,
      offersUpserted: 0,
      unmatched: 0,
    };
  }
}

export interface IngestOptions {
  /** Restrict the run to these adapter keys. */
  only?: string[];
  /** Skip the seeded fixture adapter (used once live sources are configured). */
  skipFixtures?: boolean;
  db?: DB;
}

/**
 * Runs every configured adapter and writes the results.
 *
 * Adapters run sequentially rather than in parallel: they share one per-host
 * rate limiter and one SQLite writer, so concurrency would buy nothing and
 * make the /stores timeline harder to read. A failing adapter is recorded and
 * the run continues — one blocked retailer must not take the site down.
 */
export async function runIngest(options: IngestOptions = {}): Promise<IngestResult> {
  const db = options.db ?? getDb();
  const startedAt = nowIso();
  const terms = buildSearchTerms(db);
  const runs: SourceRunResult[] = [];

  for (const source of allSources) {
    if (options.only && !options.only.includes(source.key)) continue;
    if (options.skipFixtures && source.key === 'fixtures') continue;

    const sourceStarted = nowIso();
    const result = await runSource(source, terms, db);
    recordRun(db, result, sourceStarted, nowIso());
    runs.push(result);
  }

  for (const source of indexSources) {
    if (options.only && !options.only.includes(source.key)) continue;

    const sourceStarted = nowIso();
    const result = await runIndexSource(source, db);
    recordRun(db, result, sourceStarted, nowIso());
    runs.push(result);
  }

  return { startedAt, finishedAt: nowIso(), runs };
}
