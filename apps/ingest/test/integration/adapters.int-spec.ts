import { type EnrichedBatch, STREAM } from '@perfpulse/protocol';
import { Redis } from 'ioredis';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { PostgresProjectCatalog, RedisRateLimiter, RedisStreamSink } from '../../src/adapters.js';
import { buildApp } from '../../src/app.js';

const sql = postgres(inject('postgresUrl'), { max: 2, onnotice: () => undefined });
const redis = new Redis(inject('redisUrl'));
const KEY = `pk_${'c'.repeat(32)}`;
const ORIGIN = 'https://shop.example.ma';

beforeAll(async () => {
  // The columns the ingestion reads; the full schema belongs to the processor's migrations.
  await sql`create table projects (id uuid primary key default gen_random_uuid(), public_key text unique, allowed_origins text[])`;
  await sql`insert into projects (public_key, allowed_origins) values (${KEY}, ${[ORIGIN]})`;
});

afterAll(async () => {
  await Promise.allSettled([sql.end(), redis.quit()]);
});

describe('ingestion adapters', () => {
  it('loads projects, keeps them on a failed refresh and picks up new ones', async () => {
    const errors: unknown[] = [];
    const catalog = new PostgresProjectCatalog(sql, (error) => errors.push(error));
    expect(catalog.ready).toBe(false);
    await catalog.start(3600);
    expect(catalog.ready).toBe(true);
    expect(catalog.find(KEY)?.allowedOrigins).toEqual([ORIGIN]);

    const other = `pk_${'d'.repeat(32)}`;
    await sql`insert into projects (public_key, allowed_origins) values (${other}, ${['https://blog.example.ma']})`;
    await catalog.refresh();
    expect(catalog.find(other)).toBeDefined();
    catalog.stop();

    const broken = new PostgresProjectCatalog(
      postgres('postgres://nobody@127.0.0.1:1/none', { connect_timeout: 1 }),
      () => undefined,
    );
    await expect(broken.refresh()).rejects.toThrow();
    expect(broken.ready).toBe(false);
  });

  it('counts hits per minute in Redis', async () => {
    const limiter = new RedisRateLimiter(redis, 2);
    expect([await limiter.hit('p:1'), await limiter.hit('p:1'), await limiter.hit('p:1')]).toEqual([
      true,
      true,
      false,
    ]);
    expect(await limiter.hit('p:2')).toBe(true);
    const keys = await redis.keys('pp:rate:p:1:*');
    expect(await redis.ttl(keys[0] ?? '')).toBeGreaterThan(0);
  });

  it('serves the whole path: HTTP request to stream message', async () => {
    const catalog = new PostgresProjectCatalog(sql, () => undefined);
    await catalog.refresh();
    const app = buildApp({
      config: { LOG_LEVEL: 'silent', TRUST_PROXY_HOPS: 0, COUNTRY_HEADER: undefined },
      catalog,
      limiter: new RedisRateLimiter(redis, 100),
      sink: new RedisStreamSink(redis, 1000),
      health: { redis: () => redis.ping() },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/collect',
      headers: {
        'content-type': 'text/plain',
        origin: ORIGIN,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/141.0 Safari/537.36',
      },
      payload: JSON.stringify({
        v: 1,
        k: KEY,
        s: 'Hk3n0x1Wq8m2v4c7Zb5Ra9',
        p: '/cart',
        ev: [{ t: 'vital', n: 'LCP', v: 1800 }],
      }),
    });
    expect(response.statusCode).toBe(204);

    const entries = await redis.xrange(STREAM, '-', '+');
    const [, fields] = entries.at(-1) ?? ['', []];
    const message = JSON.parse(fields[1] ?? '{}') as EnrichedBatch;
    expect(message).toMatchObject({
      path: '/cart',
      browser: 'Chrome',
      os: 'Windows',
      device: 'desktop',
      events: [{ t: 'vital', n: 'LCP', v: 1800 }],
    });
    expect((await app.inject('/health/ready')).statusCode).toBe(200);
    await app.close();
  });
});
