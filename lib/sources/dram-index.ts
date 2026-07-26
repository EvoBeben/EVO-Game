import { politeFetchJson } from './fetcher';
import type { IndexPoint, IndexSource, SourceAvailability } from './types';

/**
 * DRAM spot-price index — the market backdrop behind every retail price on the
 * site. Retail RAM lags the spot market by weeks, so showing the index next to
 * the shelf price explains what a shopper is looking at.
 *
 * There is no free, official, machine-readable DRAM feed: TrendForce and
 * DRAMeXchange both gate their series behind paid subscriptions. So this
 * adapter is generic — point DRAM_INDEX_URL at whichever public
 * TrendForce-derived tracker you have rights to read, and it will ingest it.
 * With the variable unset the dashboard falls back to the seeded series.
 */

/** Shape we expect at DRAM_INDEX_URL: an array, or `{ series: [...] }`. */
interface IndexRow {
  date?: string;
  observed_on?: string;
  key?: string;
  series?: string;
  label?: string;
  value?: number | string;
  price?: number | string;
  unit?: string;
  source?: string;
}

function coerceRows(payload: unknown): IndexRow[] {
  if (Array.isArray(payload)) return payload as IndexRow[];
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    for (const key of ['series', 'data', 'points', 'results']) {
      if (Array.isArray(record[key])) return record[key] as IndexRow[];
    }
  }
  return [];
}

export function normalizeIndexRows(payload: unknown, sourceLabel: string): IndexPoint[] {
  const points: IndexPoint[] = [];

  for (const row of coerceRows(payload)) {
    const date = row.observed_on ?? row.date;
    const rawValue = row.value ?? row.price;
    if (!date) continue;

    const value = typeof rawValue === 'string' ? Number.parseFloat(rawValue) : rawValue;
    if (value == null || !Number.isFinite(value)) continue;

    // Accept both "2026-07-01" and full ISO timestamps.
    const observedOn = date.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(observedOn)) continue;

    const seriesKey = row.key ?? row.series ?? 'dram_ddr5_16gb_spot';
    points.push({
      seriesKey,
      label: row.label ?? 'DDR5 16Gb spot',
      observedOn,
      value,
      unit: row.unit ?? 'USD',
      source: row.source ?? sourceLabel,
    });
  }

  return points;
}

export const dramIndexSource: IndexSource = {
  key: 'dram-index',
  name: 'DRAM spot-price index',
  kind: 'index',

  availability(): SourceAvailability {
    if (!process.env.DRAM_INDEX_URL?.trim()) {
      return {
        enabled: false,
        reason: 'DRAM_INDEX_URL is not set — showing the seeded index series instead',
      };
    }
    return { enabled: true, reason: null };
  },

  async fetchSeries(): Promise<IndexPoint[]> {
    const url = process.env.DRAM_INDEX_URL!;
    const payload = await politeFetchJson<unknown>(url, { cacheTtl: 3600, skipRobots: true });
    return normalizeIndexRows(payload, new URL(url).host);
  },
};
