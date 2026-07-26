'use client';

import { LineChart, type ChartSeries } from './LineChart';
import { seriesVar } from '../series';
import type { PricePoint } from '@/lib/types';

/**
 * Landed price per store over time. Step interpolation, because a listed price
 * holds until the retailer changes it — a straight line between two readings
 * would invent prices that were never offered.
 *
 * A legend is always present for two or more series, and the offer table
 * directly below is the table view that the low-contrast light-mode slots
 * require.
 */
export function PriceHistoryChart({ history }: { history: PricePoint[] }) {
  const byStore = new Map<string, { label: string; slot: number; points: { x: number; y: number | null }[] }>();

  for (const point of history) {
    const entry = byStore.get(point.storeSlug) ?? {
      label: point.storeName,
      slot: point.seriesSlot,
      points: [],
    };
    entry.points.push({
      x: new Date(point.observedAt).getTime(),
      // An out-of-stock reading is a gap in the line, not a price of zero.
      y: point.priceCents == null ? null : point.priceCents / 100,
    });
    byStore.set(point.storeSlug, entry);
  }

  const series: ChartSeries[] = [...byStore.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => a.slot - b.slot);

  if (series.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-ink-muted">
        No price history recorded for this product yet.
      </div>
    );
  }

  return (
    <div>
      <LineChart
        ariaLabel="Price per retailer over the last 90 days"
        series={series}
        interpolation="step"
        height={240}
        directLabels={series.length <= 4}
        formatValue={(v) => `$${v.toFixed(2)}`}
        formatValueShort={(v) => `$${v.toFixed(0)}`}
      />

      {series.length >= 2 ? (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-secondary">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: seriesVar(s.slot) }}
              />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
