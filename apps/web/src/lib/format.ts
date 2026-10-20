import { type Metric, type Rating, rate, THRESHOLDS } from '@perfpulse/protocol';

export const METRIC_LABELS: Record<Metric, string> = {
  LCP: 'Largest Contentful Paint',
  INP: 'Interaction to Next Paint',
  CLS: 'Cumulative Layout Shift',
  FCP: 'First Contentful Paint',
  TTFB: 'Time to First Byte',
};

export const RATING_LABELS: Record<Rating, string> = {
  good: 'Bon',
  'needs-improvement': 'À améliorer',
  poor: 'Mauvais',
};

const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const seconds = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const day = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const hour = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** "320 ms", "2,4 s", "0,12": the unit people read the thresholds in. */
export function formatValue(metric: Metric, value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (metric === 'CLS') return decimal.format(value);
  return value < 1000 ? `${Math.round(value)} ms` : `${seconds.format(value / 1000)} s`;
}

export function ratingOf(metric: Metric, value: number | null | undefined): Rating | null {
  return value === null || value === undefined ? null : rate(metric, value);
}

export function ratingLabel(metric: Metric, value: number | null | undefined): string {
  const rating = ratingOf(metric, value);
  return rating ? RATING_LABELS[rating] : '—';
}

/** Relative change against the previous period, as a signed percentage; null when unknown. */
export function trend(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function thresholdsOf(metric: Metric): readonly [number, number] {
  return THRESHOLDS[metric];
}

export function formatPercent(share: number): string {
  return `${Math.round(share * 100)} %`;
}

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

export function formatAxis(iso: string, step: 'hour' | 'day'): string {
  return (step === 'hour' ? hour : day).format(new Date(iso));
}
