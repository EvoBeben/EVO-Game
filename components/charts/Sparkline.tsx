/**
 * A trend shape with no axes, for use inside a table row or tile. It carries no
 * values of its own — the row always shows the number beside it, so the
 * sparkline is a supporting mark rather than the source of truth.
 */
export function Sparkline({
  values,
  width = 72,
  height = 22,
  color = 'var(--text-muted)',
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  const points = values.filter((v) => Number.isFinite(v));
  if (points.length < 2) return <span className="text-ink-muted">—</span>;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);

  const d = points
    .map((value, index) => {
      const x = index * step;
      const y = height - 2 - ((value - min) / span) * (height - 4);
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} aria-hidden className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
