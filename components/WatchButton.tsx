'use client';

import { useEffect, useState } from 'react';

const KEY = 'ramwatch:watchlist';

export function readWatchlist(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function writeWatchlist(slugs: string[]): void {
  window.localStorage.setItem(KEY, JSON.stringify(slugs));
  window.dispatchEvent(new Event('watchlist-change'));
}

/** Watchlist is device-local — no accounts, nothing sent anywhere. */
export function WatchButton({ slug }: { slug: string }) {
  const [watched, setWatched] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setWatched(readWatchlist().includes(slug));
    setReady(true);
  }, [slug]);

  const toggle = () => {
    const current = readWatchlist();
    const next = current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug];
    writeWatchlist(next);
    setWatched(next.includes(slug));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={watched}
      className="rounded-md border border-hairline px-3 py-1.5 text-sm font-medium hover:bg-[var(--surface-sunken)]"
      style={ready && watched ? { borderColor: 'var(--series-1)', color: 'var(--series-1)' } : undefined}
    >
      <span aria-hidden>{ready && watched ? '★' : '☆'}</span> {ready && watched ? 'Watching' : 'Watch'}
    </button>
  );
}
