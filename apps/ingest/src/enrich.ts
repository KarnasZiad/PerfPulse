import type { Device } from '@perfpulse/protocol';

export interface Client {
  browser: string;
  os: string;
  device: Device;
}

// Order matters: Edge and Opera also announce Chrome, Chrome also announces Safari.
const BROWSERS: [RegExp, string][] = [
  [/Edg(A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Version\/[\d.]+.*Safari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/Android/, 'Android'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/CrOS/, 'ChromeOS'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux/, 'Linux'],
];

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|pingdom|uptime/i;

/** Synthetic traffic (crawlers, Lighthouse, headless browsers) is not what users experience. */
export function isBot(userAgent: string): boolean {
  return BOT.test(userAgent);
}

/**
 * Coarse categories from the User-Agent, which is itself never stored. Patterns are anchored on
 * short tokens, linear, and the input is capped by the caller.
 */
export function describeClient(userAgent: string): Client {
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? 'Other';
  const os = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? 'Other';
  const device: Device =
    /iPad|Tablet/.test(userAgent) ||
    (userAgent.includes('Android') && !userAgent.includes('Mobile'))
      ? 'tablet'
      : /Mobi|iPhone|iPod|Android/.test(userAgent)
        ? 'mobile'
        : 'desktop';
  return { browser, os, device };
}

const ID_SEGMENT =
  /^(?:\d+|[0-9a-f]{16,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{20,})$/i;

/**
 * One page per route, not per object: /orders/1834 and /orders/1835 are the same page. Without it,
 * a catalog of 100 000 products would be 100 000 "pages" (cardinality) and leak identifiers.
 */
export function normalizePath(path: string): string {
  const clean = path.split(/[?#]/)[0] ?? '/';
  const segments = clean.split('/').map((segment) => (ID_SEGMENT.test(segment) ? ':id' : segment));
  return segments.join('/') || '/';
}

/** ISO 3166-1 alpha-2 from a trusted header, or nothing. */
export function countryOf(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && /^[A-Z]{2}$/.test(value) && value !== 'XX' ? value : null;
}
