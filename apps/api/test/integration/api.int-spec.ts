import { createProject } from '@perfpulse/processor/project-store';
import { toRows } from '@perfpulse/processor/transform';
import { ensureErrorIndexes, ErrorWriter, MeasureWriter } from '@perfpulse/processor/writers';
import type { EnrichedBatch } from '@perfpulse/protocol';
import { MongoClient } from 'mongodb';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { MongoErrorStore, PostgresDirectory, TimescaleVitalsStore } from '../../src/stores.js';

const sql = postgres(inject('postgresUrl'), { max: 4, onnotice: () => undefined });
const mongo = new MongoClient(inject('mongoUrl'));
const db = mongo.db('perfpulse-api-tests');
const PEPPER = Buffer.alloc(32, 7);
const ORIGIN = 'https://perfpulse.example.ma';

let shop: { id: string; readToken: string };
let blog: { id: string; readToken: string };
let app: Awaited<ReturnType<typeof buildApp>>;

function batch(
  project: string,
  hoursAgo: number,
  events: EnrichedBatch['events'],
  overrides: Partial<EnrichedBatch> = {},
): EnrichedBatch {
  return {
    project,
    receivedAt: Date.now() - hoursAgo * 3600_000,
    session: 'Hk3n0x1Wq8m2v4c7Zb5Ra9',
    path: '/',
    release: null,
    browser: 'Chrome',
    os: 'Android',
    device: 'mobile',
    country: 'MA',
    events,
    ...overrides,
  };
}

async function signIn(token: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/session',
    headers: { origin: ORIGIN },
    payload: { token },
  });
  expect(response.statusCode).toBe(200);
  return String(response.headers['set-cookie']).split(';')[0] ?? '';
}

beforeAll(async () => {
  await mongo.connect();
  await ensureErrorIndexes(db);
  shop = await createProject(
    sql,
    { name: 'Boutique', slug: 'boutique', origins: ['https://shop.example.ma'] },
    PEPPER,
  );
  blog = await createProject(
    sql,
    { name: 'Blog', slug: 'blog', origins: ['https://blog.example.ma'] },
    PEPPER,
  );

  // 20 LCP measures from 100 ms to 2000 ms on the home page, 4 slow ones on the cart, on mobile.
  const batches = [
    ...Array.from({ length: 20 }, (_, index) =>
      batch(shop.id, 2, [
        { t: 'view', nt: 'navigate' },
        { t: 'vital', n: 'LCP', v: (index + 1) * 100 },
      ]),
    ),
    ...Array.from({ length: 4 }, () =>
      batch(
        shop.id,
        3,
        [
          { t: 'view', nt: 'navigate' },
          { t: 'vital', n: 'LCP', v: 6000 },
        ],
        { path: '/cart', device: 'desktop' },
      ),
    ),
    batch(shop.id, 1, [
      {
        t: 'error',
        m: 'Order 12 not found',
        st: 'Error\n    at load (https://cdn.example.ma/app.js:1:200)',
        src: 'error',
      },
      {
        t: 'error',
        m: 'Order 13 not found',
        st: 'Error\n    at load (https://cdn.example.ma/app.js:1:200)',
        src: 'error',
      },
    ]),
    batch(blog.id, 1, [{ t: 'vital', n: 'LCP', v: 9000 }]),
  ];
  const rows = toRows(batches);
  await new MeasureWriter(sql).write(rows);
  await new ErrorWriter(db).write(rows.errors);
  // Part materialized, part read in real time from the raw data: both paths are exercised.
  await sql`call refresh_continuous_aggregate('vitals_hourly', null, now() - interval '150 minutes')`;

  app = await buildApp({
    config: {
      LOG_LEVEL: 'silent',
      TRUST_PROXY_HOPS: 0,
      PUBLIC_URL: ORIGIN,
      SESSION_SECRET: Buffer.alloc(32, 8),
      SESSION_HOURS: 12,
      COOKIE_SECURE: true,
    },
    directory: new PostgresDirectory(sql, PEPPER),
    vitals: new TimescaleVitalsStore(sql),
    errors: new MongoErrorStore(db),
    health: { postgres: () => sql`select 1` },
  });
});

afterAll(async () => {
  await app.close();
  await Promise.allSettled([sql.end(), mongo.close()]);
});

describe('dashboard API on real aggregates', () => {
  it('computes the p75 and the shares from the histogram aggregates', async () => {
    const cookie = await signIn(shop.readToken);
    const overview = await app.inject({
      url: '/api/projects/boutique/overview?range=24h',
      headers: { cookie },
    });
    const lcp = overview
      .json<{
        metrics: { metric: string; p75: number; samples: number; good: number; poor: number }[];
      }>()
      .metrics.find((metric) => metric.metric === 'LCP');
    // 24 values: 100…2000 ms and 4 × 6000 ms; the 18th is 1800 ms.
    expect(lcp?.samples).toBe(24);
    expect(Math.abs((lcp?.p75 ?? 0) - 1800) / 1800).toBeLessThan(0.025);
    expect(lcp).toMatchObject({ good: 0.833, poor: 0.167 });

    const mobile = await app.inject({
      url: '/api/projects/boutique/overview?range=24h&device=mobile',
      headers: { cookie },
    });
    expect(
      mobile
        .json<{ metrics: { metric: string; samples: number }[] }>()
        .metrics.find((metric) => metric.metric === 'LCP')?.samples,
    ).toBe(20);
  });

  it('returns hourly points and pages ranked by views', async () => {
    const cookie = await signIn(shop.readToken);
    const series = await app.inject({
      url: '/api/projects/boutique/vitals/LCP?range=24h',
      headers: { cookie },
    });
    const points = series.json<{ points: { samples: number }[] }>().points;
    expect(points.map((point) => point.samples)).toEqual([4, 20]);

    const pages = await app.inject({
      url: '/api/projects/boutique/pages?range=7d',
      headers: { cookie },
    });
    expect(pages.json()).toMatchObject({
      items: [
        { page: '/', views: 20, p75: { LCP: expect.any(Number) } },
        { page: '/cart', views: 4, p75: { LCP: expect.any(Number) } },
      ],
    });
  });

  it('groups errors by fingerprint and shows their samples', async () => {
    const cookie = await signIn(shop.readToken);
    const list = await app.inject({
      url: '/api/projects/boutique/errors?range=24h',
      headers: { cookie },
    });
    const [group] = list.json<{
      items: { fingerprint: string; count: number; message: string }[];
    }>().items;
    expect(group).toMatchObject({ count: 2, message: 'Order 12 not found' });

    const detail = await app.inject({
      url: `/api/projects/boutique/errors/${group?.fingerprint ?? ''}`,
      headers: { cookie },
    });
    expect(detail.json()).toMatchObject({
      total: 2,
      daily: [{ count: 2 }],
      samples: expect.arrayContaining([expect.objectContaining({ page: '/' })]),
    });
  });

  it('keeps projects apart and honours revocation', async () => {
    const cookie = await signIn(shop.readToken);
    expect(
      (await app.inject({ url: '/api/projects/blog/overview', headers: { cookie } })).statusCode,
    ).toBe(404);

    const blogCookie = await signIn(blog.readToken);
    const blogErrors = await app.inject({
      url: '/api/projects/blog/errors',
      headers: { cookie: blogCookie },
    });
    expect(blogErrors.json()).toEqual({ items: [] });

    await sql`update api_tokens set revoked_at = now() where project_id = ${blog.id}`;
    const revoked = await app.inject({
      method: 'POST',
      url: '/api/session',
      headers: { origin: ORIGIN },
      payload: { token: blog.readToken },
    });
    expect(revoked.statusCode).toBe(401);
    const [token] = await sql<
      { last_used_at: Date | null }[]
    >`select last_used_at from api_tokens where project_id = ${shop.id}`;
    expect(token?.last_used_at).toBeInstanceOf(Date);
  });
});
