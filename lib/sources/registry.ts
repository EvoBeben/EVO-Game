import { bestBuySource } from './bestbuy';
import { dramIndexSource } from './dram-index';
import { ebaySource } from './ebay';
import { fixtureSource } from './fixtures';
import { htmlSources } from './retailers';
import type { IndexSource, Source } from './types';

/** Every offer-producing adapter, in the order the ingest run executes them. */
export const sources: Source[] = [bestBuySource, ebaySource, ...htmlSources, fixtureSource];

/** Adapters that write market index series rather than offers. */
export const indexSources: IndexSource[] = [dramIndexSource];

export function sourceByKey(key: string): Source | undefined {
  return sources.find((s) => s.key === key);
}

/** Adapters whose configuration is satisfied and that will actually run. */
export function enabledSources(): Source[] {
  return sources.filter((s) => s.availability().enabled);
}
