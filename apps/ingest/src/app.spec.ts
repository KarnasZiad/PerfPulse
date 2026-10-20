import type { EnrichedBatch } from '@perfpulse/protocol';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { Metrics } from './metrics.js';
import type { EventSink, Project, ProjectCatalog, RateLimiter } from './ports.js';

const KEY = `pk_${'a'.repeat(32)}`;
const ORIGIN = 'https://shop.example.ma';
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36';

class MemoryCatalog implements ProjectCatalog {
  ready = true;
  projects: Project[] = [{ id: 'project-1', publicKey: KEY, allowedOrigins: [ORIGIN] }];
  find(publicKey: string) {
    return this.projects.find((project) => project.publicKey === publicKey);
  }
}

class CountingLimiter implements RateLimiter {
  hits = new Map<string, number>();
  constructor(private readonly limit = 3) {}
  hit(key: string) {
    const count = (this.hits.get(key) ?? 0) + 1;
    this.hits.set(key, count);
    return Promise.resolve(count <= this.limit);
  }
}

class MemorySink implements EventSink {
  batches: EnrichedBatch[] = [];
  failure: Error | null = null;
  publish(batch: EnrichedBatch) {
    if (this.failure) return Promise.reject(this.failure);
    this.batches.push(batch);
    return Promise.resolve();
  }
}

function setup(options: { countryHeader?: string; limit?: number } = {}) {
  const catalog = new MemoryCatalog();
  const limiter = new CountingLimiter(options.limit);
  const sink = new MemorySink();
  const metrics = new Metrics();
  const health: Record<string, () => Promise<unknown>> = { redis: () => Promise.resolve('PONG') };
  const app = buildApp({
    config: { LOG_LEVEL: 'silent', TRUST_PROXY_HOPS: 1, COUNTRY_HEADER: options.countryHeader },
    catalog,
    limiter,
    sink,
    health,
    metrics,
    now: () => 1_760_000_000_000,
  });
  return { app, catalog, limiter, sink, metrics, health };
}

const batch = (overrides: Record<string, unknown> = {}) => ({
  v: 1,
  k: KEY,
  s: 'Hk3n0x1Wq8m2v4c7Zb5Ra9',
  p: '/orders/18342/items',
  r: '2026.10.3',
  ev: [
    { t: 'view', nt: 'navigate' },
    { t: 'vital', n: 'LCP', v: 2140.5 },
    { t: 'vital', n: 'LCP', v: 950_000 },
    { t: 'error', m: 'boom', src: 'error' },
  ],
  ...overrides,
});

function collect(
  app: ReturnType<typeof setup>['app'],
  payload: unknown,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: 'POST',
    url: '/v1/collect',
    headers: {
      'content-type': 'text/plain;charset=UTF-8',
      origin: ORIGIN,
      'user-agent': CHROME_ANDROID,
      ...headers,
    },
    payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

describe('POST /v1/collect', () => {
  it('accepts a batch, enriches it and streams it without personal data', async () => {
    const { app, sink, metrics } = setup({ countryHeader: 'cf-ipcountry' });
    const response = await collect(app, batch(), {
      'cf-ipcountry': 'MA',
      'x-forwarded-for': '196.12.4.8',
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(sink.batches).toEqual([
      {
        project: 'project-1',
        receivedAt: 1_760_000_000_000,
        session: 'Hk3n0x1Wq8m2v4c7Zb5Ra9',
        path: '/orders/:id/items',
        release: '2026.10.3',
        browser: 'Chrome',
        os: 'Android',
        device: 'mobile',
        country: 'MA',
        events: [
          { t: 'view', nt: 'navigate' },
          { t: 'vital', n: 'LCP', v: 2140.5 },
          { t: 'error', m: 'boom', src: 'error' },
        ],
      },
    ]);
    expect(JSON.stringify(sink.batches)).not.toContain('196.12.4.8');
    expect(metrics.render()).toContain('perfpulse_values_dropped_total 1');
  });

  it('also accepts application/json, without a release or a country', async () => {
    const { app, sink } = setup();
    const { r: _release, ...withoutRelease } = batch();
    const response = await collect(app, withoutRelease, {
      'content-type': 'application/json',
      'cf-ipcountry': 'MA',
    });
    expect(response.statusCode).toBe(204);
    expect(sink.batches[0]).toMatchObject({ release: null, country: null });
  });

  it.each([
    ['malformed JSON', '{"v":1,', 400, 'body'],
    ['a schema violation', batch({ ev: [{ t: 'vital', n: 'FID', v: 1 }] }), 400, 'schema'],
    ['an unknown key', batch({ k: `pk_${'b'.repeat(32)}` }), 403, 'project'],
  ])('refuses %s', async (_case, payload, status, reason) => {
    const { app, sink, metrics } = setup();
    const response = await collect(app, payload);
    expect(response.statusCode).toBe(status);
    expect(response.body).toBe('');
    expect(sink.batches).toHaveLength(0);
    expect(metrics.render()).toContain(`perfpulse_batches_rejected_total{reason="${reason}"} 1`);
  });

  it('refuses another origin, or no origin at all, like an unknown key', async () => {
    const { app } = setup();
    expect((await collect(app, batch(), { origin: 'https://evil.example' })).statusCode).toBe(403);
    const withoutOrigin = await app.inject({
      method: 'POST',
      url: '/v1/collect',
      headers: { 'content-type': 'text/plain', 'user-agent': CHROME_ANDROID },
      payload: JSON.stringify(batch()),
    });
    expect(withoutOrigin.statusCode).toBe(403);
    expect(withoutOrigin.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('refuses bodies over 64 KB and unsupported content types', async () => {
    const { app } = setup();
    expect((await collect(app, 'x'.repeat(70 * 1024))).statusCode).toBe(413);
    expect(
      (await collect(app, batch(), { 'content-type': 'application/x-www-form-urlencoded' }))
        .statusCode,
    ).toBe(415);
  });

  it('ignores bots and synthetic monitoring silently', async () => {
    const { app, sink, metrics } = setup();
    const response = await collect(app, batch(), {
      'user-agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0 Safari/537.36',
    });
    expect(response.statusCode).toBe(204);
    expect(sink.batches).toHaveLength(0);
    expect(metrics.render()).toContain('reason="bot"} 1');
  });

  it('limits the rate per project and client address', async () => {
    const { app, limiter } = setup({ limit: 2 });
    const statuses = [];
    for (let index = 0; index < 3; index += 1)
      statuses.push((await collect(app, batch(), { 'x-forwarded-for': '196.12.4.8' })).statusCode);
    expect(statuses).toEqual([204, 204, 429]);
    expect([...limiter.hits.keys()]).toEqual(['project-1:196.12.4.8']);
    expect((await collect(app, batch(), { 'x-forwarded-for': '196.12.4.9' })).statusCode).toBe(204);
  });

  it('answers 503 when the stream is unavailable', async () => {
    const { app, sink, metrics } = setup();
    sink.failure = new Error('Redis down');
    expect((await collect(app, batch())).statusCode).toBe(503);
    expect(metrics.render()).toContain('reason="unavailable"} 1');
  });
});

describe('operations endpoints', () => {
  it('reports readiness, projects included', async () => {
    const { app, catalog, health } = setup();
    expect((await app.inject('/health/live')).json()).toEqual({ status: 'up' });
    expect((await app.inject('/health/ready')).json()).toEqual({
      status: 'up',
      dependencies: { redis: 'up', projects: 'up' },
    });

    catalog.ready = false;
    health.redis = () => Promise.reject(new Error('down'));
    const notReady = await app.inject('/health/ready');
    expect(notReady.statusCode).toBe(503);
    expect(notReady.json()).toEqual({
      status: 'down',
      dependencies: { redis: 'down', projects: 'down' },
    });
  });

  it('exposes Prometheus counters', async () => {
    const { app } = setup();
    await collect(app, batch());
    const response = await app.inject('/metrics');
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('perfpulse_batches_accepted_total 1');
    expect(response.body).toContain('perfpulse_events_accepted_total 3');
    expect(response.body).toContain('perfpulse_batches_rejected_total{reason="schema"} 0');
  });
});
