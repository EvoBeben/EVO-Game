import { NextResponse } from 'next/server';
import { getPriceHistory, getProduct } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const days = Number.parseInt(new URL(request.url).searchParams.get('days') ?? '', 10);
  const history = getPriceHistory(product.id, Number.isFinite(days) ? days : 90);

  return NextResponse.json({ product, history });
}
