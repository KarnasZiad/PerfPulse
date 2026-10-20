import type { EnrichedBatch } from '@perfpulse/protocol';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
import { fingerprint, normalizeMessage, normalizeStack } from './fingerprint.js';
import { hashToken, parseOrigin, randomToken } from './projects.js';
import { toRows } from './transform.js';

const V8_STACK = [
  "TypeError: Cannot read properties of undefined (reading 'id')",
  '    at renderCart (https://cdn.example.ma/assets/app-3f9a.js?v=12:1:23456)',
  '    at async Promise.all (index 0)',
  '    at https://cdn.example.ma/assets/app-3f9a.js:1:999',
  '    at HTMLButtonElement.onClick (https://cdn.example.ma/assets/vendor.js:2:10)',
  '    at dispatch (https://cdn.example.ma/assets/vendor.js:2:500)',
].join('\n');

describe('normalizeMessage', () => {
  it.each([
    ['Order 18342 not found', 'Order <n> not found'],
    ['Failed to fetch https://api.example.ma/orders/12?x=1', 'Failed to fetch <url>'],
    ['User 3f2a1c9e-8b4d-4e2f-9a7c-1d2e3f4a5b6c is gone', 'User <uuid> is gone'],
    ['Bad token deadbeefcafebabe1234', 'Bad token <hex>'],
    [
      'Unexpected token \'<\', "<!DOCTYPE html>..." is not valid JSON',
      "Unexpected token '<', <str> is not valid JSON",
    ],
    [
      "Cannot read properties of undefined (reading 'id')",
      "Cannot read properties of undefined (reading 'id')",
    ],
    ['  spaced\n  out  ', 'spaced out'],
  ])('%s', (message, expected) => {
    expect(normalizeMessage(message)).toBe(expected);
  });
});

describe('normalizeStack', () => {
  it('keeps three frames, without positions, query strings nor origin', () => {
    expect(normalizeStack(V8_STACK)).toEqual([
      'renderCart /assets/app-3f9a.js',
      '<anonymous> /assets/app-3f9a.js',
      'HTMLButtonElement.onClick /assets/vendor.js',
    ]);
  });

  it('reads Firefox and Safari frames', () => {
    expect(
      normalizeStack(
        'renderCart@https://cdn.example.ma/app.js:1:200\n@https://cdn.example.ma/app.js:3:4',
      ),
    ).toEqual(['renderCart /app.js', '<anonymous> /app.js']);
    expect(normalizeStack(undefined)).toEqual([]);
    expect(normalizeStack('no frames here')).toEqual([]);
  });
});

describe('fingerprint', () => {
  it('groups occurrences that only differ by data or build positions', () => {
    const first = fingerprint('p1', 'error', 'Order 12 not found', V8_STACK);
    expect(
      fingerprint('p1', 'error', 'Order 99 not found', V8_STACK.replaceAll(':1:23456', ':1:23999')),
    ).toBe(first);
    expect(fingerprint('p2', 'error', 'Order 12 not found', V8_STACK)).not.toBe(first);
    expect(fingerprint('p1', 'rejection', 'Order 12 not found', V8_STACK)).not.toBe(first);
    expect(fingerprint('p1', 'error', 'Payment refused', V8_STACK)).not.toBe(first);
    expect(first).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('toRows', () => {
  const batch: EnrichedBatch = {
    project: '0b6f5c8e-1d2a-4c3b-9e8f-7a6b5c4d3e2f',
    receivedAt: Date.parse('2026-10-20T10:00:00Z'),
    session: 'Hk3n0x1Wq8m2v4c7Zb5Ra9',
    path: '/orders/:id',
    release: '2026.10.3',
    browser: 'Chrome',
    os: 'Android',
    device: 'mobile',
    country: 'MA',
    events: [
      { t: 'view', nt: 'navigate' },
      { t: 'vital', n: 'LCP', v: 3100 },
      { t: 'vital', n: 'CLS', v: 0.05 },
      { t: 'error', m: 'boom', src: 'rejection' },
    ],
  };

  it('rates each measure, computes its bucket and spreads the context', () => {
    const rows = toRows([batch]);
    expect(rows.vitals).toEqual([
      expect.objectContaining({
        metric: 'LCP',
        value: 3100,
        rating: 'needs-improvement',
        bucket: 164,
        page: '/orders/:id',
        country: 'MA',
      }),
      expect.objectContaining({
        metric: 'CLS',
        value: 0.05,
        rating: 'good',
        bucket: 80,
        device: 'mobile',
      }),
    ]);
    expect(rows.vitals[0]?.time).toEqual(new Date('2026-10-20T10:00:00Z'));
    expect(rows.views).toEqual([
      expect.objectContaining({
        navigation_type: 'navigate',
        session_id: batch.session,
        release: '2026.10.3',
      }),
    ]);
    expect(rows.errors).toEqual([
      expect.objectContaining({
        type: 'rejection',
        message: 'boom',
        stack: null,
        fingerprint: expect.stringMatching(/^[0-9a-f]{40}$/),
      }),
    ]);
  });

  it('returns nothing for nothing', () => {
    expect(toRows([])).toEqual({ vitals: [], views: [], errors: [] });
  });
});

describe('projects', () => {
  it('generates tokens over the full alphabet', () => {
    const token = randomToken(40);
    expect(token).toMatch(/^[A-Za-z0-9]{40}$/);
    expect(randomToken(40)).not.toBe(token);
  });

  it('hashes tokens with the pepper', () => {
    const pepper = Buffer.alloc(32, 1);
    expect(hashToken('pp_read_x', pepper)).toHaveLength(32);
    expect(hashToken('pp_read_x', pepper)).toEqual(hashToken('pp_read_x', pepper));
    expect(hashToken('pp_read_x', Buffer.alloc(32, 2))).not.toEqual(hashToken('pp_read_x', pepper));
  });

  it('accepts HTTPS origins only, without path', () => {
    expect(parseOrigin('https://shop.example.ma')).toBe('https://shop.example.ma');
    expect(parseOrigin('https://shop.example.ma:8443/')).toBe('https://shop.example.ma:8443');
    expect(parseOrigin('http://localhost:5173')).toBe('http://localhost:5173');
    expect(() => parseOrigin('http://shop.example.ma')).toThrow(/HTTPS/);
    expect(() => parseOrigin('https://shop.example.ma/fr')).toThrow(/no path/);
    expect(() => parseOrigin('not a url')).toThrow();
  });
});

describe('loadConfig', () => {
  const env = {
    DATABASE_URL: 'postgresql://perfpulse@localhost/perfpulse',
    MONGODB_URL: 'mongodb://localhost:27017',
    REDIS_URL: 'redis://localhost:6379',
  };

  it('applies defaults and names a unique consumer', () => {
    const config = loadConfig(env);
    expect(config).toMatchObject({
      BATCH_SIZE: 200,
      CLAIM_IDLE_MS: 60_000,
      MAX_DELIVERIES: 5,
      MONGODB_DATABASE: 'perfpulse',
    });
    expect(config.CONSUMER_NAME).toMatch(/-\d+$/);
  });

  it('refuses invalid values', () => {
    expect(() => loadConfig({ ...env, BATCH_SIZE: '0' })).toThrow(/BATCH_SIZE/);
    expect(() => loadConfig({ ...env, CONSUMER_NAME: 'bad name' })).toThrow(/CONSUMER_NAME/);
  });
});
