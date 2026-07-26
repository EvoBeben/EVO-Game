import { timeAgo } from '@/lib/format';
import { listStores } from '@/lib/queries';
import { sourceStatuses } from '@/lib/source-status';
import { seriesVar } from '@/components/series';
import type { SourceStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

const KIND_LABELS: Record<SourceStatus['kind'], string> = {
  'official-api': 'Official API',
  html: 'HTML adapter',
  index: 'Market index',
  fixture: 'Sample data',
};

function StatusPill({ source }: { source: SourceStatus }) {
  const run = source.lastRun;

  if (!source.enabled) {
    return (
      <span className="rounded-full px-2 py-0.5 text-xs font-medium text-ink-muted" style={{ background: 'var(--surface-sunken)' }}>
        ○ Not configured
      </span>
    );
  }
  if (run?.status === 'error') {
    return (
      <span
        className="rounded-full px-2 py-0.5 text-xs font-medium"
        style={{
          background: 'color-mix(in srgb, var(--status-critical) 14%, transparent)',
          color: 'var(--status-critical)',
        }}
      >
        ✕ Failing
      </span>
    );
  }
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        background: 'color-mix(in srgb, var(--status-good) 14%, transparent)',
        color: 'var(--status-good)',
      }}
    >
      ● Live
    </span>
  );
}

export default function StoresPage() {
  const sources = sourceStatuses();
  const stores = listStores();
  const liveCount = sources.filter((s) => s.enabled && s.lastRun?.status !== 'error').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Data sources</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-secondary">
          Every adapter this site can pull from, whether it is configured, and how its last run
          went. {liveCount} of {sources.length} are currently live — if a store looks missing or
          stale, the reason is here.
        </p>
      </div>

      <div className="card scroll-x">
        <table className="w-full min-w-[48rem] text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-ink-muted">
              <th scope="col" className="px-4 py-2 font-medium">Source</th>
              <th scope="col" className="px-4 py-2 font-medium">Type</th>
              <th scope="col" className="px-4 py-2 font-medium">Status</th>
              <th scope="col" className="px-4 py-2 font-medium">Last run</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Offers</th>
              <th scope="col" className="px-4 py-2 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.key} className="border-b border-hairline align-top last:border-0">
                <th scope="row" className="px-4 py-2.5 text-left font-medium">
                  {source.name}
                  <span className="mt-0.5 block font-mono text-xs font-normal text-ink-muted">
                    {source.key}
                  </span>
                </th>
                <td className="px-4 py-2.5 text-ink-secondary">{KIND_LABELS[source.kind]}</td>
                <td className="px-4 py-2.5">
                  <StatusPill source={source} />
                </td>
                <td className="px-4 py-2.5 text-ink-secondary">
                  {source.lastRun ? timeAgo(source.lastRun.startedAt) : 'never'}
                </td>
                <td className="tabular px-4 py-2.5 text-right text-ink-secondary">
                  {source.lastRun?.status === 'ok'
                    ? `${source.lastRun.offersUpserted}${source.lastRun.unmatched ? ` (+${source.lastRun.unmatched} unmatched)` : ''}`
                    : '—'}
                </td>
                {/*
                  Keep this column consistent with the status pill. When a
                  source isn't configured, the config reason is the actionable
                  thing to show — an error from an earlier run under different
                  environment variables would just be confusing.
                */}
                <td className="max-w-md px-4 py-2.5 text-xs text-ink-muted">
                  {!source.enabled
                    ? source.reason
                    : (source.lastRun?.detail ?? '')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">Retailers in the catalogue</h2>
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {stores.map((store) => (
            <li key={store.id} className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: seriesVar(store.seriesSlot) }}
              />
              <a
                href={store.homepage}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="hover:underline"
              >
                {store.name}
              </a>
              {store.isMarketplace ? (
                <span className="text-xs text-ink-muted">marketplace</span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-4 text-sm text-ink-secondary">
        <h2 className="mb-2 text-sm font-semibold text-ink">Adding a live source</h2>
        <p>
          Copy <code className="rounded bg-[var(--surface-sunken)] px-1">.env.example</code> to{' '}
          <code className="rounded bg-[var(--surface-sunken)] px-1">.env.local</code> and fill in
          whichever keys you have, then run{' '}
          <code className="rounded bg-[var(--surface-sunken)] px-1">npm run refresh</code>. The Best
          Buy Products API key is free and is the quickest way to get real prices on the board.
        </p>
        <p className="mt-2">
          The HTML adapters stay off unless you set{' '}
          <code className="rounded bg-[var(--surface-sunken)] px-1">ENABLE_HTML_SOURCES=true</code>.
          They read public product pages, which several retailers&apos; terms prohibit and most
          block in practice — read the README before enabling them.
        </p>
      </section>
    </div>
  );
}
