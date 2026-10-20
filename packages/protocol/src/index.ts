// Wire format v1, shared by the SDK (constants only, no dependency) and the ingestion.

export const PROTOCOL_VERSION = 1;

export const METRICS = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'] as const;
export type Metric = (typeof METRICS)[number];

export const NAVIGATION_TYPES = [
  'navigate',
  'reload',
  'back-forward',
  'prerender',
  'restore',
] as const;
export type NavigationType = (typeof NAVIGATION_TYPES)[number];

export const ERROR_SOURCES = ['error', 'rejection'] as const;
export type ErrorSource = (typeof ERROR_SOURCES)[number];

export const LIMITS = {
  events: 50,
  path: 512,
  message: 512,
  stack: 4096,
  release: 64,
  bodyBytes: 64 * 1024,
} as const;

export interface VitalEvent {
  t: 'vital';
  n: Metric;
  v: number;
}

export interface ViewEvent {
  t: 'view';
  nt: NavigationType;
}

export interface ErrorEvent {
  t: 'error';
  m: string;
  st?: string;
  src: ErrorSource;
}

export type CollectedEvent = VitalEvent | ViewEvent | ErrorEvent;

export interface Batch {
  v: typeof PROTOCOL_VERSION;
  /** Public key of the project: visible in the page, never a secret. */
  k: string;
  /** Random per tab, kept in sessionStorage: no cookie, no cross-visit tracking. */
  s: string;
  /** Path of the page, without query string nor fragment. */
  p: string;
  r?: string;
  ev: CollectedEvent[];
}

export type Rating = 'good' | 'needs-improvement' | 'poor';

/** Google's thresholds, applied to the 75th percentile: [good up to, needs improvement up to]. */
export const THRESHOLDS: Record<Metric, readonly [number, number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
};

export function rate(metric: Metric, value: number): Rating {
  const [good, poor] = THRESHOLDS[metric];
  if (value <= good) return 'good';
  return value <= poor ? 'needs-improvement' : 'poor';
}

/**
 * Values beyond these come from tabs left in the background or broken clocks, not from what a
 * user experienced; they are dropped rather than skewing the percentiles.
 */
const PLAUSIBLE_MAX: Record<Metric, number> = {
  LCP: 60_000,
  INP: 60_000,
  CLS: 10,
  FCP: 60_000,
  TTFB: 60_000,
};

export function isPlausible(metric: Metric, value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= PLAUSIBLE_MAX[metric];
}

/**
 * Log histogram used by the continuous aggregates (ADR 0004): bucket b holds values in
 * [BASE^b, BASE^(b+1)) of the scaled value, milliseconds or CLS × 1000. Relative error ≤ 2.5 %.
 */
export const BUCKET_BASE = 1.05;

function scale(metric: Metric): number {
  return metric === 'CLS' ? 1000 : 1;
}

export function bucketOf(metric: Metric, value: number): number {
  const scaled = value * scale(metric);
  return scaled < 1 ? 0 : Math.floor(Math.log(scaled) / Math.log(BUCKET_BASE));
}

/** Representative value of a bucket: its geometric middle, back in the metric's unit. */
export function bucketValue(metric: Metric, bucket: number): number {
  return BUCKET_BASE ** (bucket + 0.5) / scale(metric);
}

/** What the ingestion writes to the Redis stream, one message per accepted batch. */
export interface EnrichedBatch {
  project: string;
  receivedAt: number;
  session: string;
  path: string;
  release: string | null;
  browser: string;
  os: string;
  device: Device;
  country: string | null;
  events: CollectedEvent[];
}

export const DEVICES = ['mobile', 'tablet', 'desktop'] as const;
export type Device = (typeof DEVICES)[number];

export const STREAM = 'pp:events';
export const DEAD_LETTER_STREAM = 'pp:events:dead';
