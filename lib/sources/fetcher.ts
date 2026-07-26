import fs from 'node:fs';
import path from 'node:path';

/**
 * Shared HTTP client for every adapter.
 *
 * Enforces three things the HTML adapters must not skip: an honest
 * User-Agent, a robots.txt check per host, and a per-host rate limit. The
 * on-disk cache keeps repeated development runs from hammering retailers.
 */

const DEFAULT_RATE_LIMIT_MS = 3000;
const CACHE_DIR = path.join(process.cwd(), '.cache', 'http');

const lastRequestAt = new Map<string, number>();
const robotsCache = new Map<string, Promise<RobotsRules>>();

export interface FetchOptions {
  headers?: Record<string, string>;
  /** Seconds to reuse a cached response for. 0 disables caching. */
  cacheTtl?: number;
  timeoutMs?: number;
  /** Skips the robots.txt check — only for first-party APIs we hold a key for. */
  skipRobots?: boolean;
}

export function userAgent(): string {
  const contact = process.env.SOURCE_CONTACT?.trim();
  const suffix = contact ? `; +${contact}` : '';
  return `ram-watch/0.1 (price comparison aggregator${suffix})`;
}

function rateLimitMs(): number {
  const raw = Number.parseInt(process.env.SOURCE_RATE_LIMIT_MS ?? '', 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_RATE_LIMIT_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Serialises requests per host to at most one per `SOURCE_RATE_LIMIT_MS`. */
async function throttle(host: string): Promise<void> {
  const gap = rateLimitMs();
  if (gap === 0) return;

  const previous = lastRequestAt.get(host) ?? 0;
  const wait = previous + gap - Date.now();
  // Reserve the slot before awaiting so concurrent callers queue behind us
  // rather than all reading the same stale timestamp.
  lastRequestAt.set(host, Math.max(Date.now(), previous + gap));
  if (wait > 0) await sleep(wait);
}

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------

interface RobotsRules {
  disallow: string[];
  allow: string[];
}

function parseRobots(body: string, agent: string): RobotsRules {
  const rules: RobotsRules = { disallow: [], allow: [] };
  const groups: { agents: string[]; allow: string[]; disallow: string[] }[] = [];
  let current: { agents: string[]; allow: string[]; disallow: string[] } | null = null;
  let lastLineWasAgent = false;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (key === 'user-agent') {
      if (!current || !lastLineWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastLineWasAgent = true;
      continue;
    }
    lastLineWasAgent = false;
    if (!current) continue;
    if (key === 'disallow') current.disallow.push(value);
    else if (key === 'allow') current.allow.push(value);
  }

  const name = agent.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && name.includes(a)));
  const applicable = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));

  for (const group of applicable) {
    rules.disallow.push(...group.disallow.filter(Boolean));
    rules.allow.push(...group.allow.filter(Boolean));
  }
  return rules;
}

function pathMatches(rule: string, pathname: string): boolean {
  // robots.txt wildcards: * matches any run, $ anchors the end.
  const escaped = rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const anchored = escaped.endsWith('$') ? `^${escaped.slice(0, -1)}$` : `^${escaped}`;
  try {
    return new RegExp(anchored).test(pathname);
  } catch {
    return false;
  }
}

async function loadRobots(origin: string): Promise<RobotsRules> {
  const cached = robotsCache.get(origin);
  if (cached) return cached;

  const promise = (async (): Promise<RobotsRules> => {
    try {
      const response = await fetch(`${origin}/robots.txt`, {
        headers: { 'user-agent': userAgent() },
        signal: AbortSignal.timeout(10_000),
      });
      // No robots.txt (404) means no restrictions; a 5xx means we don't know,
      // and the safe reading of "don't know" is to stay out.
      if (response.status === 404) return { disallow: [], allow: [] };
      if (!response.ok) return { disallow: ['/'], allow: [] };
      return parseRobots(await response.text(), userAgent());
    } catch {
      return { disallow: ['/'], allow: [] };
    }
  })();

  robotsCache.set(origin, promise);
  return promise;
}

/** True when robots.txt permits our agent to fetch `url`. */
export async function isAllowedByRobots(url: string): Promise<boolean> {
  const parsed = new URL(url);
  const rules = await loadRobots(parsed.origin);
  const pathname = parsed.pathname + parsed.search;

  // Longest matching rule wins; Allow beats Disallow at equal length.
  let verdict = true;
  let bestLength = -1;
  for (const rule of rules.disallow) {
    if (pathMatches(rule, pathname) && rule.length > bestLength) {
      bestLength = rule.length;
      verdict = false;
    }
  }
  for (const rule of rules.allow) {
    if (pathMatches(rule, pathname) && rule.length >= bestLength) {
      bestLength = rule.length;
      verdict = true;
    }
  }
  return verdict;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

function cacheKey(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i += 1) {
    hash = (hash * 31 + url.charCodeAt(i)) | 0;
  }
  return `${Math.abs(hash).toString(36)}.json`;
}

function readCache(url: string, ttlSeconds: number): string | null {
  if (ttlSeconds <= 0) return null;
  const file = path.join(CACHE_DIR, cacheKey(url));
  try {
    const stat = fs.statSync(file);
    if (Date.now() - stat.mtimeMs > ttlSeconds * 1000) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { url: string; body: string };
    return parsed.url === url ? parsed.body : null;
  } catch {
    return null;
  }
}

function writeCache(url: string, body: string): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(path.join(CACHE_DIR, cacheKey(url)), JSON.stringify({ url, body }));
  } catch {
    // A cache write failure must never fail the request.
  }
}

// ---------------------------------------------------------------------------
// Public fetchers
// ---------------------------------------------------------------------------

export class RobotsDisallowedError extends Error {
  constructor(url: string) {
    super(`robots.txt disallows ${url}`);
    this.name = 'RobotsDisallowedError';
  }
}

export async function politeFetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const ttl = options.cacheTtl ?? 0;
  const cached = readCache(url, ttl);
  if (cached != null) return cached;

  if (!options.skipRobots && !(await isAllowedByRobots(url))) {
    throw new RobotsDisallowedError(url);
  }

  const host = new URL(url).host;
  await throttle(host);

  const response = await fetch(url, {
    headers: {
      'user-agent': userAgent(),
      accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      ...options.headers,
    },
    signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }

  const body = await response.text();
  if (ttl > 0) writeCache(url, body);
  return body;
}

export async function politeFetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const text = await politeFetchText(url, {
    ...options,
    headers: { accept: 'application/json', ...options.headers },
  });
  return JSON.parse(text) as T;
}

/** Test seam: clears memoised robots rules and rate-limit timestamps. */
export function resetFetcherState(): void {
  robotsCache.clear();
  lastRequestAt.clear();
}
