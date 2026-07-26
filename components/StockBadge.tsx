import { STOCK_LABELS, type StockStatus } from '@/lib/types';

/**
 * Stock state never rides on colour alone — each badge pairs its status colour
 * with a glyph and a written label, which is also what makes it readable in
 * forced-colors mode and in print.
 */
const STYLES: Record<StockStatus, { glyph: string; color: string; bg: string }> = {
  in_stock: { glyph: '●', color: 'var(--status-good)', bg: 'color-mix(in srgb, var(--status-good) 12%, transparent)' },
  limited: { glyph: '◐', color: 'var(--status-warning)', bg: 'color-mix(in srgb, var(--status-warning) 16%, transparent)' },
  preorder: { glyph: '◔', color: 'var(--status-serious)', bg: 'color-mix(in srgb, var(--status-serious) 14%, transparent)' },
  backorder: { glyph: '◔', color: 'var(--status-serious)', bg: 'color-mix(in srgb, var(--status-serious) 14%, transparent)' },
  out_of_stock: { glyph: '○', color: 'var(--status-critical)', bg: 'color-mix(in srgb, var(--status-critical) 12%, transparent)' },
  unknown: { glyph: '?', color: 'var(--text-muted)', bg: 'transparent' },
};

export function StockBadge({
  status,
  qty,
  compact = false,
}: {
  status: StockStatus;
  qty?: number | null;
  compact?: boolean;
}) {
  const style = STYLES[status] ?? STYLES.unknown;
  const label = STOCK_LABELS[status] ?? 'Unknown';
  const text = qty != null && status === 'limited' ? `${qty} left` : label;

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium ${
        compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs'
      }`}
      style={{ background: style.bg, color: style.color }}
    >
      <span aria-hidden>{style.glyph}</span>
      {text}
    </span>
  );
}
