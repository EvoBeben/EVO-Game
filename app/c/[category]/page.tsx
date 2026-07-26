import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Filters } from '@/components/Filters';
import { ProductList } from '@/components/ProductRow';
import { facetsForCategory, listProducts, type SortKey } from '@/lib/queries';
import { CATEGORIES, CATEGORY_LABELS, PER_GB_CATEGORIES, type Category } from '@/lib/types';

export const dynamic = 'force-dynamic';

const RESERVED = new Set(['sort', 'in_stock', 'max_price', 'q']);
const SORTS: SortKey[] = ['price', 'per_gb', 'drop', 'rise', 'name', 'stock'];

// Deliberately no generateStaticParams: this page reads live prices and stock
// from the database, so prerendering it would bake in build-time numbers.

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { category } = await params;
  if (!CATEGORIES.includes(category as Category)) notFound();

  const query = await searchParams;

  // Anything that isn't a known control is a spec facet.
  const specs: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(query)) {
    if (RESERVED.has(key) || value == null) continue;
    specs[key] = Array.isArray(value) ? value : [value];
  }

  const sortParam = typeof query.sort === 'string' ? query.sort : undefined;
  const maxPrice = typeof query.max_price === 'string' ? Number.parseFloat(query.max_price) : NaN;

  const { items, total } = listProducts({
    category,
    specs: Object.keys(specs).length ? specs : undefined,
    inStockOnly: query.in_stock === '1',
    maxPriceCents: Number.isFinite(maxPrice) ? Math.round(maxPrice * 100) : undefined,
    sort: SORTS.includes(sortParam as SortKey) ? (sortParam as SortKey) : 'price',
  });

  const facets = facetsForCategory(category);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          {CATEGORY_LABELS[category as Category]}
        </h1>
        <p className="mt-0.5 text-sm text-ink-secondary">
          {total} product{total === 1 ? '' : 's'} · prices are landed totals including shipping
        </p>
      </div>

      <Suspense fallback={<div className="h-24" />}>
        <Filters facets={facets} showPerGb={PER_GB_CATEGORIES.has(category)} />
      </Suspense>

      <ProductList products={items} />
    </div>
  );
}
