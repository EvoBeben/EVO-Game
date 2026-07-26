/**
 * Runs every configured source adapter and writes fresh offers.
 *
 *   npm run refresh                 # all adapters
 *   npm run refresh -- --only=bestbuy
 *   npm run refresh -- --skip-fixtures
 *
 * With no API keys set this reports each adapter as skipped and changes
 * nothing — which is the expected result in CI and in network-restricted
 * sandboxes.
 */

import { closeDb } from '../lib/db';
import { runIngest } from '../lib/ingest';

function parseArgs(argv: string[]): { only?: string[]; skipFixtures: boolean } {
  let only: string[] | undefined;
  let skipFixtures = false;

  for (const arg of argv) {
    if (arg.startsWith('--only=')) {
      only = arg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (arg === '--skip-fixtures') {
      skipFixtures = true;
    }
  }
  return { only, skipFixtures };
}

async function main(): Promise<void> {
  const { only, skipFixtures } = parseArgs(process.argv.slice(2));
  const result = await runIngest({ only, skipFixtures });

  const width = Math.max(...result.runs.map((r) => r.sourceKey.length), 8);
  console.log(`\nIngest ${result.startedAt} → ${result.finishedAt}\n`);

  for (const run of result.runs) {
    const label = run.sourceKey.padEnd(width);
    const icon = run.status === 'ok' ? '✓' : run.status === 'skipped' ? '–' : '✗';
    const summary =
      run.status === 'ok'
        ? `${run.offersUpserted} upserted, ${run.unmatched} unmatched (of ${run.offersSeen} seen)`
        : (run.detail ?? run.status);
    console.log(`  ${icon} ${label}  ${summary}`);
  }

  const errors = result.runs.filter((r) => r.status === 'error');
  console.log('');
  if (errors.length) {
    console.log(`${errors.length} source(s) failed. See /stores in the app for detail.`);
  }

  closeDb();
  // A failing adapter is a data-quality event, not a build failure — the cron
  // should keep running. Only a total wipeout is worth a non-zero exit.
  if (errors.length === result.runs.length && result.runs.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
