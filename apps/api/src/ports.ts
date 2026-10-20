import type { Device, Metric } from '@perfpulse/protocol';

export const RANGES = ['24h', '7d', '30d'] as const;
export type Range = (typeof RANGES)[number];
export type DeviceFilter = Device | 'all';

export interface ProjectSummary {
  id: string;
  slug: string;
  name: string;
}

/** Measures per histogram bucket: what the continuous aggregates store. */
export interface BucketCount {
  bucket: number;
  samples: number;
}

export interface MetricHistogram {
  metric: Metric;
  buckets: BucketCount[];
  good: number;
  needsImprovement: number;
  poor: number;
}

export interface TimedHistogram {
  time: Date;
  buckets: BucketCount[];
}

export interface PageHistogram {
  page: string;
  views: number;
  metrics: Partial<Record<Metric, BucketCount[]>>;
}

export interface ErrorGroupSummary {
  fingerprint: string;
  type: string;
  message: string;
  /** Occurrences in the requested range. */
  count: number;
  total: number;
  firstSeen: string;
  lastSeen: string;
  browsers: Record<string, number>;
}

export interface ErrorSample {
  at: string;
  message: string;
  stack: string | null;
  page: string;
  browser: string;
  os: string;
  device: string;
  release: string | null;
}

export interface ErrorDetail extends ErrorGroupSummary {
  daily: { day: string; count: number }[];
  samples: ErrorSample[];
}

export interface Directory {
  /** Project of a valid, non-revoked read token, or null. Records the use of the token. */
  projectOfToken(token: string): Promise<ProjectSummary | null>;
  projects(ids: readonly string[]): Promise<ProjectSummary[]>;
}

export interface Window {
  from: Date;
  to: Date;
}

/** Sums of the continuous aggregates; percentiles are computed by the caller. */
export interface VitalsStore {
  histograms(projectId: string, window: Window, device: DeviceFilter): Promise<MetricHistogram[]>;
  series(
    projectId: string,
    metric: Metric,
    window: Window,
    step: 'hour' | 'day',
    device: DeviceFilter,
  ): Promise<TimedHistogram[]>;
  pages(projectId: string, window: Window, limit: number): Promise<PageHistogram[]>;
}

export interface ErrorStore {
  list(projectId: string, sinceDay: string, limit: number): Promise<ErrorGroupSummary[]>;
  detail(projectId: string, fingerprint: string, sinceDay: string): Promise<ErrorDetail | null>;
}
