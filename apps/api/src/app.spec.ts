import { bucketOf, type Metric } from '@perfpulse/protocol';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { p75, quantileBucket, sinceDay, stepOf, windows } from './percentiles.js';
import type {
  BucketCount,
  Directory,
  ErrorDetail,
  ErrorStore,
  MetricHistogram,
  PageHistogram,
  ProjectSummary,
  TimedHistogram,
  VitalsStore,
  Window,
} from './ports.js';

const ORIGIN = 'https://perfpulse.example.ma';
const TOKEN = `pp_read_${'a'.repeat(40)}`;
const OTHER_TOKEN = `pp_read_${'b'.repeat(40)}`;
const SHOP: ProjectSummary = {
  id: '0b6f5c8e-1d2a-4c3b-9e8f-7a6b5c4d3e2f',
  slug: 'boutique',
  name: 'Boutique',
};
const BLOG: ProjectSummary = {
  id: '1c7a6d9f-2e3b-4d4c-8f9a-8b7c6d5e4f3a',
  slug: 'blog',
  name: 'Blog',
};
const NOW = new Date('2026-10-20T12:00:00Z');

/** A histogram where each value appears `count` times. */
const histogram = (metric: Metric, values: number[], count = 1): BucketCount[] => {
  const buckets = new Map<number, number>();
  for (const value of values)
    buckets.set(bucketOf(metric, value), (buckets.get(bucketOf(metric, value)) ?? 0) + count);
  return [...buckets].map(([bucket, samples]) => ({ bucket, samples }));
};

class MemoryDirectory implements Directory {
  projectOfToken(token: string) {
    return Promise.resolve(token === TOKEN ? SHOP : token === OTHER_TOKEN ? BLOG : null);
  }
  projects(ids: readonly string[]) {
    return Promise.resolve([SHOP, BLOG].filter((project) => ids.includes(project.id)));
  }
}

class MemoryVitals implements VitalsStore {
  calls: { window: Window; device: string }[] = [];
  histograms(_projectId: string, window: Window, device: string): Promise<MetricHistogram[]> {
    this.calls.push({ window, device });
    const previous = window.to.getTime() < NOW.getTime();
    return Promise.resolve([
      {
        metric: 'LCP',
        buckets: histogram('LCP', previous ? [3000, 3200, 3400, 3600] : [1200, 1800, 2400, 5000]),
        good: 3,
        needsImprovement: 0,
        poor: 1,
      },
    ]);
  }
  series(): Promise<TimedHistogram[]> {
    return Promise.resolve([
      { time: new Date('2026-10-20T10:00:00Z'), buckets: histogram('INP', [120, 180, 260, 700]) },
      { time: new Date('2026-10-20T11:00:00Z'), buckets: [] },
    ]);
  }
  pages(): Promise<PageHistogram[]> {
    return Promise.resolve([
      {
        page: '/',
        views: 120,
        metrics: { LCP: histogram('LCP', [2000]), CLS: histogram('CLS', [0.02]) },
      },
      { page: '/orders/:id', views: 40, metrics: {} },
    ]);
  }
}

class MemoryErrors implements ErrorStore {
  detailed: ErrorDetail = {
    fingerprint: 'f'.repeat(40),
    type: 'error',
    message: 'Order <n> not found',
    count: 3,
    total: 9,
    firstSeen: '2026-10-01T00:00:00.000Z',
    lastSeen: '2026-10-20T11:00:00.000Z',
    browsers: { Chrome: 9 },
    daily: [{ day: '2026-10-20', count: 3 }],
    samples: [],
  };
  list(projectId: string, since: string) {
    return Promise.resolve(projectId === SHOP.id && since === '2026-10-13' ? [this.detailed] : []);
  }
  detail(projectId: string, fingerprint: string) {
    return Promise.resolve(
      projectId === SHOP.id && fingerprint === this.detailed.fingerprint ? this.detailed : null,
    );
  }
}

async function setup(clock = { now: NOW }) {
  const vitals = new MemoryVitals();
  const health: Record<string, () => Promise<unknown>> = { postgres: () => Promise.resolve() };
  const app = await buildApp({
    config: {
      LOG_LEVEL: 'silent',
      TRUST_PROXY_HOPS: 0,
      PUBLIC_URL: ORIGIN,
      SESSION_SECRET: Buffer.alloc(32, 3),
      SESSION_HOURS: 12,
      COOKIE_SECURE: true,
    },
    directory: new MemoryDirectory(),
    vitals,
    errors: new MemoryErrors(),
    health,
    now: () => clock.now,
  });
  return { app, vitals, health, clock };
}

async function signIn(app: Awaited<ReturnType<typeof setup>>['app'], token = TOKEN, cookie = '') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/session',
    headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) },
    payload: { token },
  });
  const header = response.headers['set-cookie'];
  const value = (Array.isArray(header) ? header[0] : header) ?? '';
  return { response, cookie: value.split(';')[0] ?? '' };
}

describe('percentiles', () => {
  it('finds the bucket where the cumulative count reaches the quantile', () => {
    const buckets = [
      { bucket: 10, samples: 50 },
      { bucket: 30, samples: 25 },
      { bucket: 20, samples: 25 },
    ];
    expect(quantileBucket(buckets, 0.5)).toBe(10);
    expect(quantileBucket(buckets, 0.75)).toBe(20);
    expect(quantileBucket(buckets, 0.76)).toBe(30);
    expect(quantileBucket([], 0.75)).toBeNull();
    expect(quantileBucket([{ bucket: 1, samples: 0 }], 0.75)).toBeNull();
  });

  it('returns the p75 in the unit of the metric, within 2.5 %', () => {
    const lcp = p75('LCP', histogram('LCP', [1000, 1500, 2600, 4000]));
    expect(Math.abs((lcp ?? 0) - 2600) / 2600).toBeLessThan(0.025);
    expect(p75('CLS', histogram('CLS', [0.01, 0.02, 0.15, 0.3]))).toBeCloseTo(0.15, 2);
    expect(p75('INP', [])).toBeNull();
  });

  it('computes the windows of a range', () => {
    const { current, previous } = windows('7d', NOW);
    expect(current).toEqual({ from: new Date('2026-10-13T12:00:00Z'), to: NOW });
    expect(previous.to).toEqual(current.from);
    expect(stepOf('24h')).toBe('hour');
    expect(stepOf('30d')).toBe('day');
    expect(sinceDay('24h', NOW)).toBe('2026-10-19');
  });
});

describe('sessions', () => {
  it('exchanges a read token for a signed, HttpOnly, strict session cookie', async () => {
    const { app } = await setup();
    const { response, cookie } = await signIn(app);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ project: SHOP });
    const header = String(response.headers['set-cookie']);
    expect(header).toMatch(/^__Host-perfpulse_session=/);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Strict');
    expect(header).toContain('Secure');
    expect(header).toContain('Max-Age=43200');
    expect(header).not.toContain(TOKEN);

    const projects = await app.inject({ url: '/api/projects', headers: { cookie } });
    expect(projects.json()).toEqual({ items: [SHOP] });
  });

  it('adds the projects of further tokens to the session', async () => {
    const { app } = await setup();
    const { cookie } = await signIn(app);
    const second = await signIn(app, OTHER_TOKEN, cookie);
    const projects = await app.inject({ url: '/api/projects', headers: { cookie: second.cookie } });
    expect(
      projects
        .json<{ items: ProjectSummary[] }>()
        .items.map((project) => project.slug)
        .sort(),
    ).toEqual(['blog', 'boutique']);
  });

  it('refuses unknown tokens, malformed ones and other origins', async () => {
    const { app } = await setup();
    expect((await signIn(app, `pp_read_${'z'.repeat(40)}`)).response.statusCode).toBe(401);
    expect((await signIn(app, 'not-a-token')).response.statusCode).toBe(400);
    const crossSite = await app.inject({
      method: 'POST',
      url: '/api/session',
      headers: { origin: 'https://evil.example' },
      payload: { token: TOKEN },
    });
    expect(crossSite.statusCode).toBe(403);
    expect(crossSite.headers['content-type']).toContain('application/problem+json');
  });

  it('rejects forged, tampered and expired sessions', async () => {
    const { app, clock } = await setup();
    const { cookie } = await signIn(app);
    const [name, value] = cookie.split('=');
    const forged = `${name ?? ''}=${encodeURIComponent(JSON.stringify({ p: [BLOG.id], exp: 9e15 }))}`;
    expect(
      (await app.inject({ url: '/api/projects', headers: { cookie: forged } })).statusCode,
    ).toBe(401);
    const tampered = `${name ?? ''}=${(value ?? '').replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'))}`;
    expect(
      (await app.inject({ url: '/api/projects', headers: { cookie: tampered } })).statusCode,
    ).toBe(401);
    expect((await app.inject({ url: '/api/projects' })).statusCode).toBe(401);

    clock.now = new Date(NOW.getTime() + 13 * 3600_000);
    expect((await app.inject({ url: '/api/projects', headers: { cookie } })).statusCode).toBe(401);
  });

  it('signs out from the dashboard only', async () => {
    const { app } = await setup();
    const { cookie } = await signIn(app);
    expect(
      (await app.inject({ method: 'DELETE', url: '/api/session', headers: { cookie } })).statusCode,
    ).toBe(403);
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/session',
      headers: { cookie, origin: ORIGIN },
    });
    expect(response.statusCode).toBe(204);
    expect(String(response.headers['set-cookie'])).toMatch(/__Host-perfpulse_session=;/);
  });

  it('limits sign-in attempts', async () => {
    const { app } = await setup();
    const statuses = [];
    for (let index = 0; index < 11; index += 1)
      statuses.push((await signIn(app, `pp_read_${'z'.repeat(40)}`)).response.statusCode);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe('project data', () => {
  async function signedIn() {
    const context = await setup();
    const { cookie } = await signIn(context.app);
    return { ...context, cookie };
  }

  it('summarizes each metric with its p75, its shares and the previous period', async () => {
    const { app, cookie, vitals } = await signedIn();
    const response = await app.inject({
      url: '/api/projects/boutique/overview?range=7d&device=mobile',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{
      metrics: {
        metric: string;
        p75: number | null;
        previousP75: number | null;
        samples: number;
        good: number;
        poor: number;
      }[];
    }>();
    const lcp = body.metrics.find((metric) => metric.metric === 'LCP');
    expect(lcp).toMatchObject({ samples: 4, good: 0.75, poor: 0.25 });
    expect(Math.abs((lcp?.p75 ?? 0) - 2400) / 2400).toBeLessThan(0.025);
    expect(Math.abs((lcp?.previousP75 ?? 0) - 3400) / 3400).toBeLessThan(0.025);
    expect(body.metrics.find((metric) => metric.metric === 'INP')).toEqual({
      metric: 'INP',
      p75: null,
      previousP75: null,
      samples: 0,
      good: 0,
      needsImprovement: 0,
      poor: 0,
    });
    expect(vitals.calls.map((call) => call.device)).toEqual(['mobile', 'mobile']);
  });

  it('returns a p75 series and the slowest pages', async () => {
    const { app, cookie } = await signedIn();
    const series = await app.inject({
      url: '/api/projects/boutique/vitals/INP?range=24h',
      headers: { cookie },
    });
    expect(series.json()).toMatchObject({
      metric: 'INP',
      step: 'hour',
      points: [
        { time: '2026-10-20T10:00:00.000Z', samples: 4 },
        { time: '2026-10-20T11:00:00.000Z', p75: null, samples: 0 },
      ],
    });
    const pages = await app.inject({ url: '/api/projects/boutique/pages', headers: { cookie } });
    expect(pages.json()).toMatchObject({
      items: [
        { page: '/', views: 120, p75: { LCP: expect.any(Number), CLS: expect.any(Number) } },
        { page: '/orders/:id', views: 40, p75: {} },
      ],
    });
  });

  it('lists error groups and shows one', async () => {
    const { app, cookie } = await signedIn();
    const list = await app.inject({
      url: '/api/projects/boutique/errors?range=7d',
      headers: { cookie },
    });
    expect(list.json<{ items: unknown[] }>().items).toHaveLength(1);
    const detail = await app.inject({
      url: `/api/projects/boutique/errors/${'f'.repeat(40)}`,
      headers: { cookie },
    });
    expect(detail.json()).toMatchObject({ message: 'Order <n> not found', total: 9 });
    expect(
      (
        await app.inject({
          url: `/api/projects/boutique/errors/${'e'.repeat(40)}`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(404);
  });

  it('answers 404 for a project outside the session, as for one that does not exist', async () => {
    const { app, cookie } = await signedIn();
    for (const path of [
      '/api/projects/blog/overview',
      '/api/projects/blog/errors',
      '/api/projects/unknown/pages',
    ]) {
      expect((await app.inject({ url: path, headers: { cookie } })).statusCode, path).toBe(404);
    }
    expect((await app.inject({ url: '/api/projects/boutique/overview' })).statusCode).toBe(401);
  });

  it('validates every parameter', async () => {
    const { app, cookie } = await signedIn();
    for (const path of [
      '/api/projects/boutique/overview?range=1y',
      '/api/projects/boutique/overview?device=watch',
      '/api/projects/boutique/overview?extra=1',
      '/api/projects/boutique/vitals/FID',
      '/api/projects/boutique/pages?limit=1000',
      '/api/projects/BOUTIQUE/pages',
      '/api/projects/boutique/errors/not-a-fingerprint',
    ]) {
      const response = await app.inject({ url: path, headers: { cookie } });
      expect(response.statusCode, path).toBe(400);
    }
    expect((await app.inject({ url: '/nope' })).statusCode).toBe(404);
  });
});

describe('operations', () => {
  it('reports health', async () => {
    const { app, health } = await setup();
    expect((await app.inject('/health/live')).json()).toEqual({ status: 'up' });
    expect((await app.inject('/health/ready')).statusCode).toBe(200);
    health.mongodb = () => Promise.reject(new Error('down'));
    expect((await app.inject('/health/ready')).json()).toEqual({
      status: 'down',
      dependencies: { postgres: 'up', mongodb: 'down' },
    });
  });

  it('loads its configuration', () => {
    const env = {
      DATABASE_URL: 'postgresql://perfpulse@localhost/perfpulse',
      MONGODB_URL: 'mongodb://localhost:27017',
      API_TOKEN_PEPPER: Buffer.alloc(32, 1).toString('base64'),
      SESSION_SECRET: Buffer.alloc(32, 2).toString('base64'),
    };
    expect(loadConfig(env)).toMatchObject({ PORT: 4200, SESSION_HOURS: 12, COOKIE_SECURE: true });
    expect(() => loadConfig({ ...env, SESSION_SECRET: 'c2hvcnQ=' })).toThrow(/SESSION_SECRET/);
  });
});
