import { bucketValue, type Metric } from '@perfpulse/protocol';
import type { BucketCount, Range, Window } from './ports.js';

/**
 * Bucket holding the q-quantile of a histogram: the first one whose cumulative count reaches
 * q × total. Null without any sample.
 */
export function quantileBucket(buckets: readonly BucketCount[], q: number): number | null {
  const total = buckets.reduce((sum, entry) => sum + entry.samples, 0);
  if (total === 0) return null;
  let cumulative = 0;
  for (const entry of [...buckets].sort((a, b) => a.bucket - b.bucket)) {
    cumulative += entry.samples;
    if (cumulative >= q * total) return entry.bucket;
  }
  return null;
}

/** The 75th percentile Google uses, in the unit of the metric (ms, or unitless CLS). */
export function p75(metric: Metric, buckets: readonly BucketCount[]): number | null {
  const bucket = quantileBucket(buckets, 0.75);
  if (bucket === null) return null;
  const value = bucketValue(metric, bucket);
  return metric === 'CLS' ? Math.round(value * 1000) / 1000 : Math.round(value);
}

const DURATIONS: Record<Range, number> = {
  '24h': 24 * 3600_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
};

/** The requested range ending now, and the same length just before it (for trends). */
export function windows(range: Range, now: Date): { current: Window; previous: Window } {
  const duration = DURATIONS[range];
  const from = new Date(now.getTime() - duration);
  return {
    current: { from, to: now },
    previous: { from: new Date(from.getTime() - duration), to: from },
  };
}

export function stepOf(range: Range): 'hour' | 'day' {
  return range === '24h' ? 'hour' : 'day';
}

/** First UTC day of the range, as error counters are kept per UTC day. */
export function sinceDay(range: Range, now: Date): string {
  return windows(range, now).current.from.toISOString().slice(0, 10);
}
