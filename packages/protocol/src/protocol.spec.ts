import { describe, expect, it } from 'vitest';
import { BUCKET_BASE, bucketOf, bucketValue, isPlausible, LIMITS, METRICS, rate } from './index.js';
import { batchSchema } from './schema.js';

const batch = (overrides: Record<string, unknown> = {}) => ({
  v: 1,
  k: `pk_${'a'.repeat(32)}`,
  s: 'Hk3n0x1Wq8m2v4c7Zb5Ra9',
  p: '/produits/42',
  ev: [
    { t: 'view', nt: 'navigate' },
    { t: 'vital', n: 'LCP', v: 2140.5 },
    { t: 'error', m: 'boom', st: 'Error: boom\n at a.js:1:1', src: 'error' },
  ],
  ...overrides,
});

describe('rate', () => {
  it('applies the thresholds of Google, bounds included', () => {
    expect(rate('LCP', 2500)).toBe('good');
    expect(rate('LCP', 2501)).toBe('needs-improvement');
    expect(rate('LCP', 4000)).toBe('needs-improvement');
    expect(rate('LCP', 4001)).toBe('poor');
    expect(rate('CLS', 0.1)).toBe('good');
    expect(rate('CLS', 0.26)).toBe('poor');
    expect(rate('INP', 180)).toBe('good');
  });
});

describe('isPlausible', () => {
  it('drops background-tab artefacts and broken values', () => {
    expect(isPlausible('LCP', 3000)).toBe(true);
    expect(isPlausible('LCP', 120_000)).toBe(false);
    expect(isPlausible('CLS', 11)).toBe(false);
    expect(isPlausible('INP', -1)).toBe(false);
    expect(isPlausible('TTFB', Number.NaN)).toBe(false);
  });
});

describe('histogram buckets', () => {
  it('keeps every value within 2.5 % of its bucket value', () => {
    for (const metric of METRICS) {
      for (const value of metric === 'CLS'
        ? [0.002, 0.05, 0.1, 0.3, 2]
        : [3, 87, 200, 2500, 41_000]) {
        const estimate = bucketValue(metric, bucketOf(metric, value));
        expect(Math.abs(estimate - value) / value, `${metric} ${value}`).toBeLessThan(0.025);
      }
    }
  });

  it('is monotonic and puts sub-unit values in bucket 0', () => {
    expect(bucketOf('LCP', 0)).toBe(0);
    expect(bucketOf('LCP', 0.4)).toBe(0);
    expect(bucketOf('CLS', 0.0005)).toBe(0);
    expect(bucketOf('LCP', 2500)).toBeLessThan(bucketOf('LCP', 2700));
    // In the middle of the bucket: exact bounds are subject to floating-point rounding.
    expect(bucketOf('LCP', BUCKET_BASE ** 100.5)).toBe(100);
  });
});

describe('batchSchema', () => {
  it('accepts a batch sent by the SDK', () => {
    expect(batchSchema.parse(batch())).toEqual(batch());
    expect(batchSchema.safeParse(batch({ r: '2026.10.3+build-7' })).success).toBe(true);
  });

  it.each([
    ['an unknown version', { v: 2 }],
    ['a malformed key', { k: 'pk_short' }],
    ['a malformed session', { s: 'not a session id' }],
    ['a relative path', { p: 'produits' }],
    ['a too long path', { p: `/${'a'.repeat(LIMITS.path)}` }],
    ['a release with spaces', { r: 'v1 beta' }],
    ['an empty batch', { ev: [] }],
    [
      'too many events',
      { ev: Array.from({ length: LIMITS.events + 1 }, () => ({ t: 'view', nt: 'navigate' })) },
    ],
    ['an unknown metric', { ev: [{ t: 'vital', n: 'FID', v: 10 }] }],
    ['a negative value', { ev: [{ t: 'vital', n: 'LCP', v: -5 }] }],
    ['an infinite value', { ev: [{ t: 'vital', n: 'LCP', v: Number.POSITIVE_INFINITY }] }],
    ['an unknown event type', { ev: [{ t: 'click' }] }],
    ['an extra field', { ev: [{ t: 'view', nt: 'navigate', url: '/?token=secret' }] }],
    [
      'a too long message',
      { ev: [{ t: 'error', m: 'x'.repeat(LIMITS.message + 1), src: 'error' }] },
    ],
    ['an extra top-level field', { ip: '196.12.4.8' }],
  ])('rejects %s', (_case, overrides) => {
    expect(batchSchema.safeParse(batch(overrides)).success).toBe(false);
  });
});
