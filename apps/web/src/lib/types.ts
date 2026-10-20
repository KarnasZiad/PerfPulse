import type { Metric } from '@perfpulse/protocol';

export type Range = '24h' | '7d' | '30d';
export type DeviceFilter = 'all' | 'mobile' | 'tablet' | 'desktop';

export interface Project {
  id: string;
  slug: string;
  name: string;
}

export interface MetricSummary {
  metric: Metric;
  p75: number | null;
  previousP75: number | null;
  samples: number;
  good: number;
  needsImprovement: number;
  poor: number;
}

export interface Overview {
  range: Range;
  metrics: MetricSummary[];
}

export interface Series {
  metric: Metric;
  step: 'hour' | 'day';
  points: { time: string; p75: number | null; samples: number }[];
}

export interface PageRow {
  page: string;
  views: number;
  p75: Partial<Record<Metric, number | null>>;
}

export interface ErrorGroup {
  fingerprint: string;
  type: string;
  message: string;
  count: number;
  total: number;
  firstSeen: string;
  lastSeen: string;
  browsers: Record<string, number>;
}

export interface ErrorDetail extends ErrorGroup {
  daily: { day: string; count: number }[];
  samples: {
    at: string;
    message: string;
    stack: string | null;
    page: string;
    browser: string;
    os: string;
    device: string;
    release: string | null;
  }[];
}
