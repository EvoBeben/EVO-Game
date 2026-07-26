import Link from 'next/link';

/**
 * Shown whenever the database holds no live readings. Demo prices must never
 * be mistaken for real ones — this is the site-wide version of that promise,
 * and individual rows carry a SAMPLE badge as well.
 */
export function SampleDataBanner({ sampleOnly }: { sampleOnly: boolean }) {
  if (!sampleOnly) return null;

  return (
    <div
      className="border-b px-4 py-2 text-center text-sm"
      style={{
        background: 'color-mix(in srgb, var(--status-warning) 14%, transparent)',
        borderColor: 'color-mix(in srgb, var(--status-warning) 35%, transparent)',
      }}
    >
      <strong className="font-semibold">Sample data.</strong>{' '}
      <span className="text-ink-secondary">
        No live source is configured, so every price and stock figure here is generated demo data —
        not a real reading.{' '}
        <Link href="/stores" className="underline underline-offset-2">
          Connect a source
        </Link>
        .
      </span>
    </div>
  );
}
