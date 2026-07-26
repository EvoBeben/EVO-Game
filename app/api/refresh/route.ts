import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { runIngest } from '@/lib/ingest';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Triggers an ingest run. Guarded by REFRESH_TOKEN — a refresh makes outbound
 * requests to every configured retailer, so it must not be open to the world.
 * With no token configured the endpoint stays closed; use `npm run refresh`.
 */
export async function POST(request: Request) {
  const expected = process.env.REFRESH_TOKEN?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: 'Refresh endpoint disabled: REFRESH_TOKEN is not configured.' },
      { status: 503 },
    );
  }

  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!provided || !tokenMatches(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    only?: string[];
    skipFixtures?: boolean;
  };

  const result = await runIngest({
    only: Array.isArray(body.only) ? body.only : undefined,
    skipFixtures: body.skipFixtures === true,
  });

  const failed = result.runs.filter((r) => r.status === 'error').length;
  return NextResponse.json(result, { status: failed && failed === result.runs.length ? 502 : 200 });
}
