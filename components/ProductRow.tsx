import Link from 'next/link';
import { Delta } from './Delta';
import { StockBadge } from './StockBadge';
import { seriesVar } from './series';
import { money, perGb } from '@/lib/format';
import { PER_GB_CATEGORIES, type ProductSummary } from '@/lib/types';

/** Compact per-store availability strip — who has it, at a glance. */
function StoreStrip({ product }: { product: ProductSummary }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {product.offerCount === 0 ? (
        <span className="text-xs text-ink-muted">No offers</span>
      ) : null}
      {product.inStockCount > 0 ? (
        <span className="text-xs text-ink-secondary">
          {product.inStockCount} of {product.offerCount} in stock
        </span>
      ) : (
        <span className="text-xs" style={{ color: 'var(--status-critical)' }}>
          Out of stock everywhere
        </span>
      )}
    </div>
  );
}

export function ProductRow({ product }: { product: ProductSummary }) {
  const best = product.bestOffer;
  const showPerGb = PER_GB_CATEGORIES.has(product.category);

  return (
    <li className="border-b border-hairline last:border-0">
      <Link
        href={`/p/${product.slug}`}
        className="grid grid-cols-1 gap-3 px-4 py-3 hover:bg-[var(--surface-sunken)] sm:grid-cols-[1fr_auto] sm:items-center"
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{product.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <StoreStrip product={product} />
            {best ? (
              <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: seriesVar(best.store.seriesSlot) }}
                />
                best at {best.store.name}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-4 sm:justify-end">
          {showPerGb ? (
            <div className="text-right">
              <div className="text-xs text-ink-muted">per GB</div>
              <div className="tabular text-sm">{perGb(product.centsPerGb)}</div>
            </div>
          ) : null}

          <div className="text-right">
            <div className="text-xs text-ink-muted">7d</div>
            <Delta value={product.change7d} className="text-sm" />
          </div>

          <div className="min-w-[5.5rem] text-right">
            <div className="tabular text-base font-semibold">{money(product.bestCents)}</div>
            {best ? <StockBadge status={best.stockStatus} qty={best.stockQty} compact /> : null}
          </div>
        </div>
      </Link>
    </li>
  );
}

export function ProductList({ products }: { products: ProductSummary[] }) {
  if (products.length === 0) {
    return (
      <div className="card px-4 py-10 text-center text-sm text-ink-secondary">
        Nothing matches those filters. Try widening the price cap or clearing a facet.
      </div>
    );
  }

  return (
    <ul className="card divide-y divide-[var(--border)] overflow-hidden">
      {products.map((product) => (
        <ProductRow key={product.id} product={product} />
      ))}
    </ul>
  );
}
