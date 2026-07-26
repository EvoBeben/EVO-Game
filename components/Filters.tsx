'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import type { Facet } from '@/lib/queries';

const SORTS: { value: string; label: string }[] = [
  { value: 'price', label: 'Lowest price' },
  { value: 'per_gb', label: 'Lowest $/GB' },
  { value: 'drop', label: 'Biggest drop' },
  { value: 'rise', label: 'Biggest rise' },
  { value: 'stock', label: 'Most in stock' },
  { value: 'name', label: 'Name' },
];

/** Facet values that read better with a unit attached. */
function decorate(key: string, value: string): string {
  switch (key) {
    case 'capacity_gb':
      return Number(value) >= 1000 ? `${Number(value) / 1000}TB` : `${value}GB`;
    case 'speed_mts':
      return `${value} MT/s`;
    case 'cas':
      return `CL${value}`;
    case 'kit_count':
      return `${value} module${value === '1' ? '' : 's'}`;
    case 'vram_gb':
      return `${value}GB`;
    case 'wattage':
      return `${value}W`;
    default:
      return value;
  }
}

/**
 * Filters live in the URL, so any view is shareable and the back button works.
 * All controls sit in one row above the results.
 */
export function Filters({ facets, showPerGb }: { facets: Facet[]; showPerGb: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const update = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      mutate(next);
      router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const toggleFacet = (key: string, value: string) =>
    update((next) => {
      const current = next.getAll(key);
      next.delete(key);
      const remaining = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      for (const v of remaining) next.append(key, v);
    });

  const sorts = showPerGb ? SORTS : SORTS.filter((s) => s.value !== 'per_gb');
  const activeSort = params.get('sort') ?? 'price';
  const inStockOnly = params.get('in_stock') === '1';
  const hasFilters = [...params.keys()].length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-secondary">Sort</span>
          <select
            value={activeSort}
            onChange={(event) =>
              update((next) => {
                if (event.target.value === 'price') next.delete('sort');
                else next.set('sort', event.target.value);
              })
            }
            className="rounded-md border border-hairline bg-surface px-2 py-1 text-sm"
          >
            {sorts.map((sort) => (
              <option key={sort.value} value={sort.value}>
                {sort.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(event) =>
              update((next) => {
                if (event.target.checked) next.set('in_stock', '1');
                else next.delete('in_stock');
              })
            }
          />
          <span className="text-ink-secondary">In stock only</span>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-secondary">Max $</span>
          <input
            type="number"
            min={0}
            step={10}
            defaultValue={params.get('max_price') ?? ''}
            placeholder="any"
            onBlur={(event) =>
              update((next) => {
                if (event.target.value) next.set('max_price', event.target.value);
                else next.delete('max_price');
              })
            }
            className="tabular w-24 rounded-md border border-hairline bg-surface px-2 py-1 text-sm"
          />
        </label>

        {hasFilters ? (
          <button
            type="button"
            onClick={() => router.replace(pathname, { scroll: false })}
            className="text-sm text-ink-secondary underline underline-offset-2 hover:text-ink"
          >
            Clear all
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {facets.map((facet) => {
          const selected = new Set(params.getAll(facet.key));
          return (
            <fieldset key={facet.key} className="min-w-0">
              <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">
                {facet.label}
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {facet.values.map(({ value, count }) => {
                  const active = selected.has(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleFacet(facet.key, value)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        active
                          ? 'border-transparent font-medium'
                          : 'border-hairline text-ink-secondary hover:text-ink'
                      }`}
                      style={
                        active
                          ? { background: 'var(--series-1)', color: '#ffffff' }
                          : undefined
                      }
                    >
                      {decorate(facet.key, value)}
                      <span className={active ? 'ml-1 opacity-80' : 'ml-1 text-ink-muted'}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
