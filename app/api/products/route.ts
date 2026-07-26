import { NextResponse } from 'next/server';
import { listProducts, type ListOptions, type SortKey } from '@/lib/queries';
import { CATEGORIES } from '@/lib/types';

export const dynamic = 'force-dynamic';

const SORTS: SortKey[] = ['price', 'per_gb', 'drop', 'rise', 'name', 'stock'];

/** Query keys that are not spec facets. */
const RESERVED = new Set(['category', 'q', 'sort', 'limit', 'offset', 'in_stock', 'max_price']);

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const category = params.get('category') ?? undefined;
  if (category && !CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    return NextResponse.json({ error: `Unknown category: ${category}` }, { status: 400 });
  }

  const sortParam = params.get('sort');
  const sort = SORTS.includes(sortParam as SortKey) ? (sortParam as SortKey) : 'price';

  // Every remaining repeated param is a spec filter: ?ddr_gen=DDR5&ddr_gen=DDR4
  const specs: Record<string, string[]> = {};
  for (const key of new Set(params.keys())) {
    if (RESERVED.has(key)) continue;
    const values = params.getAll(key).filter(Boolean);
    if (values.length) specs[key] = values;
  }

  const maxPrice = Number.parseFloat(params.get('max_price') ?? '');
  const limit = Number.parseInt(params.get('limit') ?? '', 10);
  const offset = Number.parseInt(params.get('offset') ?? '', 10);

  const options: ListOptions = {
    category,
    q: params.get('q') ?? undefined,
    specs: Object.keys(specs).length ? specs : undefined,
    inStockOnly: params.get('in_stock') === '1',
    maxPriceCents: Number.isFinite(maxPrice) ? Math.round(maxPrice * 100) : undefined,
    sort,
    limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 60,
    offset: Number.isFinite(offset) ? Math.max(offset, 0) : 0,
  };

  const { items, total } = listProducts(options);
  return NextResponse.json({ total, count: items.length, items });
}
