import { WatchlistView } from '@/components/WatchlistView';

export const dynamic = 'force-dynamic';

export default function WatchlistPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Watchlist</h1>
        <p className="mt-0.5 text-sm text-ink-secondary">
          Stored in this browser only — no account, nothing sent to a server.
        </p>
      </div>
      <WatchlistView />
    </div>
  );
}
