import { NextResponse } from 'next/server';
import { getMarketSeries } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const days = Number.parseInt(params.get('days') ?? '', 10);
  const series = getMarketSeries(
    params.get('series') ?? undefined,
    Number.isFinite(days) ? days : 180,
  );
  return NextResponse.json({ count: series.length, series });
}
