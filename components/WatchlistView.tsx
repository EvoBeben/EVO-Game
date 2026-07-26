'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ProductList } from './ProductRow';
import { readWatchlist } from './WatchButton';
import type { ProductSummary } from '@/lib/types';

/**
 * The watchlist lives in localStorage, so the list of slugs is only known on
 * the client; the products themselves are fetched from the API once we have it.
 */
export function WatchlistView() {
  const [products, setProducts] = useState<ProductSummary[] | null>(null);

  const load = useCallback(async () => {
    const slugs = readWatchlist();
    if (slugs.length === 0) {
      setProducts([]);
      return;
    }

    const results = await Promise.all(
      slugs.map(async (slug) => {
        const response = await fetch(`/api/products/${encodeURIComponent(slug)}`);
        if (!response.ok) return null;
        const data = (await response.json()) as { product: ProductSummary };
        return data.product;
      }),
    );

    setProducts(results.filter((p): p is ProductSummary => p !== null));
  }, []);

  useEffect(() => {
    void load();
    const handler = () => void load();
    window.addEventListener('watchlist-change', handler);
    return () => window.removeEventListener('watchlist-change', handler);
  }, [load]);

  if (products === null) {
    return <div className="card px-4 py-10 text-center text-sm text-ink-muted">Loading…</div>;
  }

  if (products.length === 0) {
    return (
      <div className="card px-4 py-10 text-center text-sm text-ink-secondary">
        Nothing watched yet. Open any product and hit{' '}
        <span className="whitespace-nowrap font-medium">☆ Watch</span> to track it here.
        <div className="mt-3">
          <Link href="/c/ram" className="underline underline-offset-2">
            Browse memory
          </Link>
        </div>
      </div>
    );
  }

  return <ProductList products={products} />;
}
