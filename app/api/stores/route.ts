import { NextResponse } from 'next/server';
import { dashboardStats, listStores } from '@/lib/queries';
import { sourceStatuses } from '@/lib/source-status';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    stores: listStores(),
    sources: sourceStatuses(),
    stats: dashboardStats(),
  });
}
