'use client';

import { LineChart } from './LineChart';
import type { MarketPoint } from '@/lib/types';

/**
 * DRAM spot index. A single series, so no legend — the heading names it.
 * Slot 1 (blue) clears 3:1 on both surfaces, so no relief labelling is needed.
 */
export function MarketIndexChart({ points }: { points: MarketPoint[] }) {
  if (points.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-ink-muted">
        No index data. Set DRAM_INDEX_URL or seed the sample series.
      </div>
    );
  }

  return (
    <LineChart
      ariaLabel="DRAM spot price index over the last six months"
      height={200}
      series={[
        {
          key: points[0].seriesKey,
          label: points[0].label,
          slot: 1,
          points: points.map((p) => ({ x: new Date(`${p.observedOn}T00:00:00Z`).getTime(), y: p.value })),
        },
      ]}
      formatValue={(v) => `$${v.toFixed(2)}`}
      formatValueShort={(v) => `$${v.toFixed(0)}`}
    />
  );
}
