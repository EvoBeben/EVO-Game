import { StockBadge } from './StockBadge';
import { seriesVar } from './series';
import { money, timeAgo } from '@/lib/format';
import { isBuyable, type Offer } from '@/lib/types';

const CONDITION_LABELS: Record<string, string> = {
  new: 'New',
  refurbished: 'Refurbished',
  open_box: 'Open box',
  used: 'Used',
};

/**
 * The comparison table — the reason the site exists. Sorted by landed total
 * (price + shipping), because the sticker price alone is not what you pay, and
 * doubling as the required table view for the price chart above it.
 */
export function OfferTable({ offers }: { offers: Offer[] }) {
  if (offers.length === 0) {
    return (
      <div className="card px-4 py-8 text-center text-sm text-ink-secondary">
        No retailer offers recorded for this product yet.
      </div>
    );
  }

  const cheapestBuyable = offers.find((o) => isBuyable(o.stockStatus) && o.totalCents != null);

  return (
    <div className="card scroll-x">
      <table className="w-full min-w-[46rem] text-sm">
        <caption className="sr-only">
          Price and stock by retailer, sorted by total landed cost
        </caption>
        <thead>
          <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-ink-muted">
            <th scope="col" className="px-4 py-2 font-medium">Store</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Price</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Shipping</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Total</th>
            <th scope="col" className="px-4 py-2 font-medium">Stock</th>
            <th scope="col" className="px-4 py-2 font-medium">Checked</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              <span className="sr-only">Link</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {offers.map((offer) => {
            const isBest = offer.id === cheapestBuyable?.id;
            return (
              <tr
                key={offer.id}
                className="border-b border-hairline last:border-0"
                style={
                  isBest
                    ? { background: 'color-mix(in srgb, var(--status-good) 8%, transparent)' }
                    : undefined
                }
              >
                <th scope="row" className="px-4 py-2.5 text-left font-normal">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: seriesVar(offer.store.seriesSlot) }}
                    />
                    <span className="font-medium">{offer.store.name}</span>
                    {isBest ? (
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                        style={{
                          background: 'color-mix(in srgb, var(--status-good) 18%, transparent)',
                          color: 'var(--status-good)',
                        }}
                      >
                        Best
                      </span>
                    ) : null}
                    {offer.isSample ? (
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase text-ink-muted"
                        style={{ background: 'var(--surface-sunken)' }}
                        title="Generated demo data, not a live reading"
                      >
                        Sample
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    {CONDITION_LABELS[offer.condition] ?? offer.condition}
                    {offer.store.isMarketplace ? ' · marketplace' : ''}
                    {offer.limitPerOrder ? ` · limit ${offer.limitPerOrder}/order` : ''}
                  </span>
                </th>

                <td className="tabular px-4 py-2.5 text-right">{money(offer.priceCents)}</td>
                <td className="tabular px-4 py-2.5 text-right text-ink-secondary">
                  {offer.priceCents == null
                    ? '—'
                    : offer.shippingCents === 0
                      ? 'Free'
                      : money(offer.shippingCents)}
                </td>
                <td className="tabular px-4 py-2.5 text-right font-semibold">
                  {money(offer.totalCents)}
                </td>

                <td className="px-4 py-2.5">
                  <StockBadge status={offer.stockStatus} qty={offer.stockQty} />
                  {offer.pickupAvailable ? (
                    <span className="mt-0.5 block text-xs text-ink-muted">Store pickup</span>
                  ) : null}
                </td>

                <td className="px-4 py-2.5 text-xs text-ink-muted">{timeAgo(offer.lastSeenAt)}</td>

                <td className="px-4 py-2.5 text-right">
                  <a
                    href={offer.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="whitespace-nowrap rounded-md border border-hairline px-2.5 py-1 text-xs font-medium hover:bg-[var(--surface-sunken)]"
                  >
                    View<span className="sr-only"> {offer.store.name} listing</span> ↗
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
