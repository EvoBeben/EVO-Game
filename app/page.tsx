import Link from 'next/link';
import { Delta } from '@/components/Delta';
import { ProductList } from '@/components/ProductRow';
import { StatTile } from '@/components/StatTile';
import { StockBadge } from '@/components/StockBadge';
import { MarketIndexChart } from '@/components/charts/MarketIndexChart';
import { money, percent, perGb } from '@/lib/format';
import {
  backInStock,
  categoryCounts,
  dashboardStats,
  getMarketSeries,
  listProducts,
  movers,
} from '@/lib/queries';
import { CATEGORIES, CATEGORY_LABELS } from '@/lib/types';

export const dynamic = 'force-dynamic';

function MoverList({ title, items }: { title: string; items: ReturnType<typeof movers> }) {
  return (
    <section className="card overflow-hidden">
      <h2 className="border-b border-hairline px-4 py-2.5 text-sm font-semibold">{title}</h2>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-secondary">
          Nothing moved more than half a percent this week.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {items.map((product) => (
            <li key={product.id}>
              <Link
                href={`/p/${product.slug}`}
                className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-[var(--surface-sunken)]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm">{product.name}</span>
                  <span className="text-xs text-ink-muted">
                    {CATEGORY_LABELS[product.category]}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="tabular block text-sm font-medium">
                    {money(product.bestCents)}
                  </span>
                  <Delta value={product.change7d} className="text-xs" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function DashboardPage() {
  const stats = dashboardStats();
  const counts = categoryCounts();
  const index = getMarketSeries('dram_ddr5_16gb_spot', 180);
  const risers = movers('up', 6);
  const fallers = movers('down', 6);
  const restocked = backInStock(6);
  const bestPerGb = listProducts({ category: 'ram', sort: 'per_gb', inStockOnly: true, limit: 8 });

  // DDR4 is currently the cheaper generation per gigabyte, so it fills the
  // combined leaderboard — query DDR5 on its own rather than fishing for one
  // in a list that may not contain any.
  const bestDdr5 = listProducts({
    category: 'ram',
    specs: { ddr_gen: ['DDR5'] },
    sort: 'per_gb',
    inStockOnly: true,
    limit: 1,
  }).items[0];

  const indexChange =
    index.length >= 2 ? ((index[index.length - 1].value - index[0].value) / index[0].value) * 100 : null;

  const outOfStockShare =
    stats.offerCount > 0
      ? ((stats.offerCount - stats.inStockOffers) / stats.offerCount) * 100
      : 0;

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-xl font-semibold tracking-tight">
          PC component prices &amp; stock, across every store we can reach
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-secondary">
          Memory is the story right now: DRAM contract prices posted their steepest quarterly rise
          on record, and retail stock sells through in hours. This tracks what each retailer is
          charging, what they actually have, and how both have moved.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="DDR5 spot index"
          value={index.length ? `$${index[index.length - 1].value.toFixed(2)}` : '—'}
          detail={indexChange == null ? '180-day change unavailable' : `${percent(indexChange, 0)} over 180 days`}
        />
        <StatTile
          label="Cheapest DDR5"
          value={perGb(bestDdr5?.centsPerGb ?? null)}
          detail={bestDdr5 ? `${bestDdr5.brand} ${bestDdr5.model}` : 'nothing in stock'}
        />
        <StatTile
          label="Out of stock"
          value={`${outOfStockShare.toFixed(0)}%`}
          detail={`${stats.offerCount - stats.inStockOffers} of ${stats.offerCount} offers`}
          accent={outOfStockShare > 40 ? 'var(--status-critical)' : undefined}
        />
        <StatTile
          label="Tracked"
          value={stats.productCount}
          detail={`${stats.offerCount} offers across ${stats.storeCount} stores`}
        />
      </section>

      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">
            DDR5 16Gb spot price
            <span className="ml-2 font-normal text-ink-muted">
              — the wholesale market behind every retail price below
            </span>
          </h2>
          {index.length ? (
            <span className="text-xs text-ink-muted">
              source: {index[index.length - 1].source}
            </span>
          ) : null}
        </div>
        <MarketIndexChart points={index} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <MoverList title="Rising fastest (7 days)" items={risers} />
        <MoverList title="Falling (7 days)" items={fallers} />
      </section>

      {restocked.length > 0 ? (
        <section className="card overflow-hidden">
          <h2 className="border-b border-hairline px-4 py-2.5 text-sm font-semibold">
            Back in stock
          </h2>
          <ul className="divide-y divide-[var(--border)]">
            {restocked.map(({ product, offer }) => (
              <li key={offer.id}>
                <Link
                  href={`/p/${product.slug}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 hover:bg-[var(--surface-sunken)]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{product.name}</span>
                    <span className="text-xs text-ink-muted">at {offer.store.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <StockBadge status={offer.stockStatus} qty={offer.stockQty} />
                    <span className="tabular text-sm font-medium">{money(offer.totalCents)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Best in-stock memory by price per gigabyte</h2>
          <Link href="/c/ram?sort=per_gb&in_stock=1" className="text-xs text-ink-secondary hover:text-ink">
            All memory →
          </Link>
        </div>
        <ProductList products={bestPerGb.items} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Browse by category</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {CATEGORIES.map((category) => (
            <Link
              key={category}
              href={`/c/${category}`}
              className="card px-3 py-3 hover:bg-[var(--surface-sunken)]"
            >
              <div className="text-sm font-medium">{CATEGORY_LABELS[category]}</div>
              <div className="text-xs text-ink-muted">{counts[category] ?? 0} products</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
