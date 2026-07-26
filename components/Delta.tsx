import { percent } from '@/lib/format';

/**
 * A price change, from a shopper's point of view: a rise is bad (red, ▲), a
 * fall is good (green, ▼). The arrow carries the direction so the meaning
 * survives without colour.
 */
export function Delta({ value, className = '' }: { value: number | null; className?: string }) {
  if (value == null || !Number.isFinite(value)) {
    return <span className={`text-ink-muted ${className}`}>—</span>;
  }

  const flat = Math.abs(value) < 0.05;
  const color = flat ? 'var(--text-muted)' : value > 0 ? 'var(--delta-up)' : 'var(--delta-down)';
  const arrow = flat ? '–' : value > 0 ? '▲' : '▼';

  return (
    <span className={`tabular inline-flex items-center gap-1 ${className}`} style={{ color }}>
      <span aria-hidden>{arrow}</span>
      {percent(value)}
    </span>
  );
}
