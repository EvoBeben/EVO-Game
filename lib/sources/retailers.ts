import { createHtmlSource } from './html';
import type { Source } from './types';

/**
 * HTML adapters for retailers without a usable public API.
 *
 * All of these are disabled unless ENABLE_HTML_SOURCES=true. Read the warning
 * at the top of lib/sources/html.ts before turning them on — this is an
 * opt-in, unsupported path, and Newegg/Amazon in particular will challenge or
 * block automated requests.
 */

export const neweggSource: Source = createHtmlSource({
  key: 'newegg',
  name: 'Newegg',
  storeSlug: 'newegg',
  searchUrl: (term) =>
    `https://www.newegg.com/p/pl?d=${encodeURIComponent(term)}&N=4131`,
});

export const microCenterSource: Source = createHtmlSource({
  key: 'microcenter',
  name: 'Micro Center',
  storeSlug: 'microcenter',
  searchUrl: (term) =>
    `https://www.microcenter.com/search/search_results.aspx?Ntt=${encodeURIComponent(term)}`,
});

export const bhPhotoSource: Source = createHtmlSource({
  key: 'bhphoto',
  name: 'B&H Photo Video',
  storeSlug: 'bhphoto',
  searchUrl: (term) =>
    `https://www.bhphotovideo.com/c/search?q=${encodeURIComponent(term)}`,
});

export const amazonSource: Source = createHtmlSource({
  key: 'amazon',
  name: 'Amazon',
  storeSlug: 'amazon',
  searchUrl: (term) => `https://www.amazon.com/s?k=${encodeURIComponent(term)}`,
});

export const htmlSources: Source[] = [
  neweggSource,
  microCenterSource,
  bhPhotoSource,
  amazonSource,
];
