import type { ReactNode } from 'react';

/**
 * A single number that answers one question. Deliberately not a chart — one
 * value with no trend has no shape worth plotting.
 */
export function StatTile({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {detail ? <div className="mt-0.5 text-xs text-ink-secondary">{detail}</div> : null}
    </div>
  );
}
