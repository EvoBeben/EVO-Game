import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { SampleDataBanner } from '@/components/SampleDataBanner';
import { ThemeToggle } from '@/components/ThemeToggle';
import { dashboardStats } from '@/lib/queries';
import { CATEGORIES, CATEGORY_LABELS } from '@/lib/types';
import { timeAgo } from '@/lib/format';

export const metadata: Metadata = {
  title: 'RAM Watch — PC component price & stock tracker',
  description:
    'Compare prices and live stock for RAM, GPUs, CPUs, SSDs and more across US retailers, with the DRAM spot index behind it.',
};

export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const stats = dashboardStats();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased">
        <SampleDataBanner sampleOnly={stats.sampleOnly} />

        <header className="border-b border-hairline bg-surface">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="text-base font-semibold tracking-tight">
              RAM<span className="text-ink-muted">Watch</span>
            </Link>

            <nav className="scroll-x flex items-center gap-4 text-sm text-ink-secondary">
              {CATEGORIES.map((category) => (
                <Link key={category} href={`/c/${category}`} className="whitespace-nowrap hover:text-ink">
                  {CATEGORY_LABELS[category]}
                </Link>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-3 text-sm text-ink-secondary">
              <Link href="/watchlist" className="hover:text-ink">
                Watchlist
              </Link>
              <Link href="/stores" className="hover:text-ink">
                Sources
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>

        <footer className="mt-12 border-t border-hairline">
          <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-ink-muted">
            <p>
              {stats.productCount} products · {stats.offerCount} offers · {stats.storeCount} stores ·
              last reading {timeAgo(stats.lastUpdatedAt)}
            </p>
            <p className="mt-1">
              Prices and availability change constantly and may be wrong or stale by the time you
              read them. Always confirm on the retailer&apos;s own page before buying.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
