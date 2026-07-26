import { latestRunsBySource } from './queries';
import { indexSources, sources } from './sources/registry';
import type { SourceStatus } from './types';

/**
 * Combines each adapter's static definition with its configuration state and
 * last run, for the /stores transparency page. This is what answers "why is
 * store X missing?" without anyone reading the code.
 */
export function sourceStatuses(): SourceStatus[] {
  const runs = latestRunsBySource();

  const offerSources = sources.map((source) => {
    const availability = source.availability();
    return {
      key: source.key,
      name: source.name,
      kind: source.kind,
      enabled: availability.enabled,
      reason: availability.reason,
      storeSlugs: source.storeSlugs,
      lastRun: runs.get(source.key) ?? null,
    } satisfies SourceStatus;
  });

  const marketSources = indexSources.map((source) => {
    const availability = source.availability();
    return {
      key: source.key,
      name: source.name,
      kind: source.kind,
      enabled: availability.enabled,
      reason: availability.reason,
      storeSlugs: [],
      lastRun: runs.get(source.key) ?? null,
    } satisfies SourceStatus;
  });

  return [...offerSources, ...marketSources];
}
