import { describe, expect, it } from 'vitest';
import {
  formatAxis,
  formatDateTime,
  formatPercent,
  formatValue,
  ratingLabel,
  ratingOf,
  thresholdsOf,
  trend,
} from './format';

describe('formatValue', () => {
  it('shows milliseconds below one second and seconds above', () => {
    expect(formatValue('INP', 184.6)).toBe('185 ms');
    expect(formatValue('LCP', 2400)).toBe('2,4 s');
    expect(formatValue('LCP', 1000)).toBe('1,0 s');
  });

  it('shows CLS as a unitless score', () => {
    expect(formatValue('CLS', 0.1234)).toBe('0,12');
  });

  it('shows a dash when there is no value', () => {
    expect(formatValue('LCP', null)).toBe('—');
    expect(formatValue('LCP', undefined)).toBe('—');
  });
});

describe('ratings', () => {
  it('applies the Google thresholds of the metric', () => {
    expect(ratingOf('LCP', 2500)).toBe('good');
    expect(ratingOf('LCP', 2501)).toBe('needs-improvement');
    expect(ratingOf('CLS', 0.3)).toBe('poor');
    expect(ratingOf('INP', null)).toBeNull();
    expect(thresholdsOf('INP')).toEqual([200, 500]);
  });

  it('names the rating for tables', () => {
    expect(ratingLabel('INP', 600)).toBe('Mauvais');
    expect(ratingLabel('INP', undefined)).toBe('—');
  });
});

describe('trend', () => {
  it('returns the signed change in percent', () => {
    expect(trend(2200, 2000)).toBe(10);
    expect(trend(1500, 2000)).toBe(-25);
  });

  it('is unknown without a previous value', () => {
    expect(trend(2000, null)).toBeNull();
    expect(trend(null, 2000)).toBeNull();
    expect(trend(0.1, 0)).toBeNull();
  });
});

describe('dates and shares', () => {
  it('formats shares as whole percentages', () => {
    expect(formatPercent(0.125)).toBe('13 %');
  });

  it('formats dates in French', () => {
    expect(formatDateTime('2026-10-20T09:30:00Z')).toMatch(/2026/);
    expect(formatAxis('2026-10-20T00:00:00Z', 'day')).toMatch(/oct/);
    expect(formatAxis('2026-10-20T09:30:00Z', 'hour')).toMatch(/^\d{2}:\d{2}$/);
  });
});
