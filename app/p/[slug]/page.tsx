import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Delta } from '@/components/Delta';
import { OfferTable } from '@/components/OfferTable';
import { StatTile } from '@/components/StatTile';
import { WatchButton } from '@/components/WatchButton';
import { PriceHistoryChart } from '@/components/charts/PriceHistoryChart';
import { money, perGb } from '@/lib/format';
import { getPriceHistory, getProduct, totalGigabytes } from '@/lib/queries';
import { CATEGORY_LABELS, PER_GB_CATEGORIES, type Category } from '@/lib/types';

export const dynamic = 'force-dynamic';

const SPEC_LABELS: Record<string, string> = {
  ddr_gen: 'Generation',
  capacity_gb: 'Module capacity',
  kit_count: 'Modules',
  speed_mts: 'Speed',
  cas: 'CAS latency',
  form_factor: 'Form factor',
  chipset: 'Chipset',
  vram_gb: 'VRAM',
  cores: 'Cores',
  socket: 'Socket',
  interface: 'Interface',
  wattage: 'Wattage',
  efficiency: 'Efficiency',
};

function formatSpec(key: string, value: unknown): string {
  switch (key) {
    case 'capacity_gb':
      return Number(value) >= 1000 ? `${Number(value) / 1000}TB` : `${value}GB`;
    case 'speed_mts':
      return `${value} MT/s`;
    case 'cas':
      return `CL${value}`;
    case 'vram_gb':
      return `${value}GB`;
    case 'wattage':
      return `${value}W`;
    default:
      return String(value);
  }
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();

  const history = getPriceHistory(product.id, 90);
  const gb = totalGigabytes(product);
  const spread =
    product.lowestCents != null && product.highestCents != null
      ? product.highestCents - product.lowestCents
      : null;

  return (
    <div className="space-y-6">
      <nav className="text-xs text-ink-muted">
        <Link href={`/c/${product.category}`} className="hover:text-ink">
          {CATEGORY_LABELS[product.category as Category]}
        </Link>
        <span className="mx-1.5">/</span>
        <span>{product.brand}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{product.name}</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            {product.mpn ? <span className="tabular">MPN {product.mpn} · </span> : null}
            {product.offerCount} offer{product.offerCount === 1 ? '' : 's'} tracked ·{' '}
            {product.inStockCount} in stock
          </p>
        </div>
        <WatchButton slug={product.slug} />
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Best landed price"
          value={money(product.bestCents)}
          detail={
            product.bestOffer
              ? `at ${product.bestOffer.store.name}${product.inStockCount === 0 ? ' (out of stock)' : ''}`
              : 'no priced offers'
          }
        />
        <StatTile
          label="7-day change"
          value={<Delta value={product.change7d} />}
          detail="vs cheapest a week ago"
        />
        {PER_GB_CATEGORIES.has(product.category) ? (
          <StatTile
            label="Price per GB"
            value={perGb(product.centsPerGb)}
            detail={gb ? `${gb}GB total` : undefined}
          />
        ) : (
          <StatTile label="Stores carrying" value={product.offerCount} detail="tracked retailers" />
        )}
        <StatTile
          label="Spread across stores"
          value={money(spread)}
          detail={
            product.lowestCents != null && product.highestCents != null
              ? `${money(product.lowestCents)} – ${money(product.highestCents)}`
              : undefined
          }
        />
      </section>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">
          Price by retailer, last 90 days
          <span className="ml-2 font-normal text-ink-muted">
            — gaps are periods with no price listed
          </span>
        </h2>
        <PriceHistoryChart history={history} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Every offer, cheapest landed total first</h2>
        <OfferTable offers={product.offers} />
      </section>

      {Object.keys(product.specs).length > 0 ? (
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Specifications</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {Object.entries(product.specs).map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs text-ink-muted">{SPEC_LABELS[key] ?? key}</dt>
                <dd className="tabular">{formatSpec(key, value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}
