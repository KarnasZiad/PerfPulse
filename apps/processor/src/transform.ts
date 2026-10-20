import { bucketOf, type EnrichedBatch, type Metric, rate, type Rating } from '@perfpulse/protocol';
import { fingerprint } from './fingerprint.js';

export interface VitalRow {
  time: Date;
  project_id: string;
  metric: Metric;
  value: number;
  bucket: number;
  rating: Rating;
  page: string;
  device: string;
  browser: string;
  os: string;
  country: string | null;
  session_id: string;
  release: string | null;
}

export interface PageViewRow {
  time: Date;
  project_id: string;
  page: string;
  navigation_type: string;
  device: string;
  browser: string;
  os: string;
  country: string | null;
  session_id: string;
  release: string | null;
}

export interface ErrorOccurrence {
  fingerprint: string;
  project: string;
  type: 'error' | 'rejection';
  message: string;
  stack: string | null;
  at: Date;
  page: string;
  browser: string;
  os: string;
  device: string;
  release: string | null;
}

export interface Rows {
  vitals: VitalRow[];
  views: PageViewRow[];
  errors: ErrorOccurrence[];
}

/** Turns stream batches into rows: rating and histogram bucket computed once, here. */
export function toRows(batches: readonly EnrichedBatch[]): Rows {
  const rows: Rows = { vitals: [], views: [], errors: [] };
  for (const batch of batches) {
    const time = new Date(batch.receivedAt);
    const context = {
      project_id: batch.project,
      device: batch.device,
      browser: batch.browser,
      os: batch.os,
      country: batch.country,
      session_id: batch.session,
      release: batch.release,
    };
    for (const event of batch.events) {
      if (event.t === 'vital') {
        rows.vitals.push({
          time,
          ...context,
          page: batch.path,
          metric: event.n,
          value: event.v,
          bucket: bucketOf(event.n, event.v),
          rating: rate(event.n, event.v),
        });
      } else if (event.t === 'view') {
        rows.views.push({ time, ...context, page: batch.path, navigation_type: event.nt });
      } else {
        rows.errors.push({
          fingerprint: fingerprint(batch.project, event.src, event.m, event.st),
          project: batch.project,
          type: event.src,
          message: event.m,
          stack: event.st ?? null,
          at: time,
          page: batch.path,
          browser: batch.browser,
          os: batch.os,
          device: batch.device,
          release: batch.release,
        });
      }
    }
  }
  return rows;
}
