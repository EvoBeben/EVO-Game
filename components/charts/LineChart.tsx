'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { seriesVar } from '../series';

export interface ChartPoint {
  /** Epoch milliseconds. */
  x: number;
  /** Null means "no reading" — the line breaks rather than interpolating. */
  y: number | null;
}

export interface ChartSeries {
  key: string;
  label: string;
  /** Categorical palette slot; stable per entity, never per rank. */
  slot: number;
  points: ChartPoint[];
}

interface Props {
  series: ChartSeries[];
  height?: number;
  /** Prices hold until they change, so step-after is the honest shape. */
  interpolation?: 'linear' | 'step';
  formatValue: (value: number) => string;
  formatValueShort?: (value: number) => string;
  /** Draws the series name at its final point. Required relief for low-contrast slots. */
  directLabels?: boolean;
  ariaLabel: string;
}

const PADDING = { top: 12, right: 16, bottom: 26, left: 52 };
const DIRECT_LABEL_LIMIT = 4;

function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min];
  const raw = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? magnitude * 10;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function LineChart({
  series,
  height = 220,
  interpolation = 'linear',
  formatValue,
  formatValueShort,
  directLabels = false,
  ariaLabel,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hoverX, setHoverX] = useState<number | null>(null);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    setWidth(node.clientWidth);
    return () => observer.disconnect();
  }, []);

  const domain = useMemo(() => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const s of series) {
      for (const p of s.points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y == null) continue;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
    if (!Number.isFinite(minY)) return null;

    // Pad the value axis so the extremes don't sit on the frame. The axis does
    // not start at zero: these are prices in a narrow band, where a zero
    // baseline would flatten every movement worth seeing.
    const span = maxY - minY || Math.max(maxY * 0.1, 1);
    return {
      minX,
      maxX: maxX === minX ? minX + 1 : maxX,
      minY: Math.max(0, minY - span * 0.12),
      maxY: maxY + span * 0.12,
    };
  }, [series]);

  const plotWidth = Math.max(80, width - PADDING.left - PADDING.right);
  const plotHeight = height - PADDING.top - PADDING.bottom;

  const scaleX = useCallback(
    (x: number) => {
      if (!domain) return 0;
      return PADDING.left + ((x - domain.minX) / (domain.maxX - domain.minX)) * plotWidth;
    },
    [domain, plotWidth],
  );

  const scaleY = useCallback(
    (y: number) => {
      if (!domain) return 0;
      return PADDING.top + (1 - (y - domain.minY) / (domain.maxY - domain.minY)) * plotHeight;
    },
    [domain, plotHeight],
  );

  /** Splits a series at nulls so gaps stay gaps. */
  const pathsFor = useCallback(
    (points: ChartPoint[]): string[] => {
      const paths: string[] = [];
      let current: string[] = [];
      let previous: ChartPoint | null = null;

      for (const point of points) {
        if (point.y == null) {
          if (current.length) paths.push(current.join(' '));
          current = [];
          previous = null;
          continue;
        }
        const px = scaleX(point.x);
        const py = scaleY(point.y);
        if (current.length === 0) {
          current.push(`M ${px.toFixed(1)} ${py.toFixed(1)}`);
        } else if (interpolation === 'step' && previous?.y != null) {
          current.push(`L ${px.toFixed(1)} ${scaleY(previous.y).toFixed(1)}`);
          current.push(`L ${px.toFixed(1)} ${py.toFixed(1)}`);
        } else {
          current.push(`L ${px.toFixed(1)} ${py.toFixed(1)}`);
        }
        previous = point;
      }
      if (current.length) paths.push(current.join(' '));
      return paths;
    },
    [scaleX, scaleY, interpolation],
  );

  const allX = useMemo(
    () => [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b),
    [series],
  );

  const hovered = useMemo(() => {
    if (hoverX == null || allX.length === 0) return null;
    let nearest = allX[0];
    for (const x of allX) {
      if (Math.abs(x - hoverX) < Math.abs(nearest - hoverX)) nearest = x;
    }
    // Last reading at or before the crosshair — matches how a step line reads.
    const rows = series
      .map((s) => {
        const eligible = s.points.filter((p) => p.x <= nearest && p.y != null);
        const point = eligible[eligible.length - 1];
        return point ? { series: s, value: point.y as number } : null;
      })
      .filter((row): row is { series: ChartSeries; value: number } => row !== null)
      .sort((a, b) => a.value - b.value);

    return { x: nearest, rows };
  }, [hoverX, allX, series]);

  const handleMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!domain) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const offset = event.clientX - rect.left - PADDING.left;
    const ratio = Math.min(1, Math.max(0, offset / plotWidth));
    setHoverX(domain.minX + ratio * (domain.maxX - domain.minX));
  };

  if (!domain) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-ink-muted">
        No price history recorded yet.
      </div>
    );
  }

  const yTicks = niceTicks(domain.minY, domain.maxY);
  const xTicks = [domain.minX, (domain.minX + domain.maxX) / 2, domain.maxX];
  const shortFormat = formatValueShort ?? formatValue;
  const showDirectLabels = directLabels && series.length <= DIRECT_LABEL_LIMIT;

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverX(null)}
        style={{ touchAction: 'pan-y' }}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={PADDING.left}
              x2={PADDING.left + plotWidth}
              y1={scaleY(tick)}
              y2={scaleY(tick)}
              stroke="var(--gridline)"
              strokeWidth={1}
            />
            <text
              x={PADDING.left - 8}
              y={scaleY(tick) + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--text-muted)"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {shortFormat(tick)}
            </text>
          </g>
        ))}

        <line
          x1={PADDING.left}
          x2={PADDING.left + plotWidth}
          y1={PADDING.top + plotHeight}
          y2={PADDING.top + plotHeight}
          stroke="var(--baseline)"
          strokeWidth={1}
        />

        {xTicks.map((tick, index) => (
          <text
            key={tick}
            x={scaleX(tick)}
            y={height - 8}
            textAnchor={index === 0 ? 'start' : index === xTicks.length - 1 ? 'end' : 'middle'}
            fontSize={11}
            fill="var(--text-muted)"
          >
            {formatDay(tick)}
          </text>
        ))}

        {hovered ? (
          <line
            x1={scaleX(hovered.x)}
            x2={scaleX(hovered.x)}
            y1={PADDING.top}
            y2={PADDING.top + plotHeight}
            stroke="var(--baseline)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ) : null}

        {series.map((s) => (
          <g key={s.key}>
            {pathsFor(s.points).map((d, index) => (
              <path
                key={index}
                d={d}
                fill="none"
                stroke={seriesVar(s.slot)}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </g>
        ))}

        {/* Hover markers carry a 2px surface ring so overlapping series stay readable. */}
        {hovered?.rows.map((row) => (
          <circle
            key={row.series.key}
            cx={scaleX(hovered.x)}
            cy={scaleY(row.value)}
            r={4.5}
            fill={seriesVar(row.series.slot)}
            stroke="var(--surface-1)"
            strokeWidth={2}
          />
        ))}

        {showDirectLabels
          ? series.map((s) => {
              const last = [...s.points].reverse().find((p) => p.y != null);
              if (!last?.y) return null;
              return (
                <text
                  key={`label-${s.key}`}
                  x={Math.min(scaleX(last.x) + 6, width - 4)}
                  y={scaleY(last.y) + 3}
                  fontSize={11}
                  fontWeight={600}
                  textAnchor="end"
                  fill="var(--text-secondary)"
                >
                  {s.label}
                </text>
              );
            })
          : null}
      </svg>

      {hovered && hovered.rows.length ? (
        <div
          className="card pointer-events-none absolute top-2 z-10 min-w-[9rem] px-2.5 py-2 text-xs shadow-sm"
          style={{
            left: Math.min(Math.max(scaleX(hovered.x) + 12, 8), Math.max(8, width - 170)),
          }}
        >
          <div className="mb-1 font-medium text-ink-secondary">{formatDay(hovered.x)}</div>
          {hovered.rows.map((row) => (
            <div key={row.series.key} className="flex items-center justify-between gap-3 py-0.5">
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: seriesVar(row.series.slot) }}
                />
                <span className="text-ink-secondary">{row.series.label}</span>
              </span>
              <span className="tabular font-medium">{formatValue(row.value)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
