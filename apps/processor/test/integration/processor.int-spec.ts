import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEAD_LETTER_STREAM, type EnrichedBatch, STREAM } from '@perfpulse/protocol';
import { Redis } from 'ioredis';
import { MongoClient } from 'mongodb';
import { pino } from 'pino';
import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { GROUP, StreamConsumer } from '../../src/consumer.js';
import { migrate, MIGRATIONS_DIR } from '../../src/migrator.js';
import { createProject } from '../../src/project-store.js';
import { ensureErrorIndexes, ErrorWriter, MeasureWriter } from '../../src/writers.js';

const sql = postgres(inject('postgresUrl'), { max: 4, onnotice: () => undefined });
const mongo = new MongoClient(inject('mongoUrl'));
const db = mongo.db('perfpulse-tests');
const redis = new Redis(inject('redisUrl'), { maxRetriesPerRequest: null });
const logger = pino({ level: 'silent' });
const PEPPER = Buffer.alloc(32, 9);

let projectId: string;

function batch(overrides: Partial<EnrichedBatch> = {}): EnrichedBatch {
  return {
    project: projectId,
    receivedAt: Date.now(),
    session: 'Hk3n0x1Wq8m2v4c7Zb5Ra9',
    path: '/orders/:id',
    release: '2026.10.3',
    browser: 'Chrome',
    os: 'Android',
    device: 'mobile',
    country: 'MA',
    events: [
      { t: 'view', nt: 'navigate' },
      { t: 'vital', n: 'LCP', v: 2100 },
      { t: 'vital', n: 'INP', v: 340 },
      {
        t: 'error',
        m: 'Order 12 not found',
        st: 'Error\n    at load (https://cdn.example.ma/app.js:1:200)',
        src: 'error',
      },
    ],
    ...overrides,
  };
}

async function pendingCount(): Promise<number> {
  const [count] = (await redis.xpending(STREAM, GROUP)) as [number];
  return count;
}

async function publish(...batches: (EnrichedBatch | string)[]): Promise<void> {
  for (const item of batches) {
    await redis.xadd(STREAM, '*', 'b', typeof item === 'string' ? item : JSON.stringify(item));
  }
}

function consumer(
  name: string,
  options: Partial<{ claimIdleMs: number; maxDeliveries: number }> = {},
) {
  const measures = new MeasureWriter(sql);
  const errors = new ErrorWriter(db);
  return new StreamConsumer(
    redis,
    async (rows) => {
      await Promise.all([measures.write(rows), errors.write(rows.errors)]);
    },
    {
      consumer: name,
      batchSize: 200,
      blockMs: 100,
      claimIdleMs: options.claimIdleMs ?? 60_000,
      maxDeliveries: options.maxDeliveries ?? 5,
    },
    logger,
  );
}

beforeEach(async () => {
  await sql`truncate web_vitals, page_views, api_tokens, projects cascade`;
  await db.dropDatabase();
  await ensureErrorIndexes(db);
  await redis.flushall();
  ({ id: projectId } = await createProject(
    sql,
    { name: 'Boutique', slug: 'boutique', origins: ['https://shop.example.ma'] },
    PEPPER,
  ));
  await consumer('setup').ensureGroup();
});

afterAll(async () => {
  await Promise.allSettled([sql.end(), mongo.close(), redis.quit()]);
});

describe('migrations', () => {
  it('created hypertables and real-time continuous aggregates, and apply only once', async () => {
    const hypertables = await sql<{ hypertable_name: string }[]>`
      select hypertable_name from timescaledb_information.hypertables order by 1`;
    expect(hypertables.map((row) => row.hypertable_name)).toEqual(['page_views', 'web_vitals']);
    const aggregates = await sql<{ view_name: string; materialized_only: boolean }[]>`
      select view_name, materialized_only from timescaledb_information.continuous_aggregates order by 1`;
    expect(aggregates).toEqual([
      { view_name: 'page_views_daily', materialized_only: false },
      { view_name: 'vitals_daily_pages', materialized_only: false },
      { view_name: 'vitals_hourly', materialized_only: false },
    ]);
    const jobs = await sql<
      { proc_name: string }[]
    >`select proc_name from timescaledb_information.jobs`;
    expect(jobs.map((job) => job.proc_name)).toEqual(
      expect.arrayContaining([
        'policy_compression',
        'policy_retention',
        'policy_refresh_continuous_aggregate',
      ]),
    );
    expect(await Promise.all([migrate(sql), migrate(sql)])).toEqual([[], []]);
  });

  it('refuses a migration modified after being applied', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'perfpulse-migrations-'));
    await cp(MIGRATIONS_DIR, directory, { recursive: true });
    const file = join(directory, '0001_projects.sql');
    await writeFile(file, `${await readFile(file, 'utf8')}\n-- edited`);
    await expect(migrate(sql, directory)).rejects.toThrow(
      'Migration 0001_projects was modified after being applied',
    );
  });
});

describe('stream processing', () => {
  it('writes measures, page views and error groups, then acknowledges', async () => {
    await publish(
      batch(),
      batch({
        device: 'desktop',
        browser: 'Firefox',
        events: [
          {
            t: 'error',
            m: 'Order 99 not found',
            st: 'Error\n    at load (https://cdn.example.ma/app.js:1:777)',
            src: 'error',
          },
        ],
      }),
    );

    expect(await consumer('c1').runOnce()).toBe(2);

    const vitals = await sql<{ metric: string; bucket: number; rating: string; page: string }[]>`
      select metric, bucket, rating, page from web_vitals order by metric`;
    expect(vitals).toEqual([
      { metric: 'INP', bucket: 119, rating: 'needs-improvement', page: '/orders/:id' },
      { metric: 'LCP', bucket: 156, rating: 'good', page: '/orders/:id' },
    ]);
    expect((await sql`select * from page_views`).length).toBe(1);

    const groups = await db.collection('error_groups').find().toArray();
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      projectId,
      count: 2,
      browsers: { Chrome: 1, Firefox: 1 },
      message: 'Order 12 not found',
    });
    expect(await db.collection('error_events').countDocuments()).toBe(2);
    const daily = await db.collection('error_daily').find().toArray();
    expect(daily).toEqual([
      expect.objectContaining({ count: 2, projectId, day: new Date().toISOString().slice(0, 10) }),
    ]);

    expect(await pendingCount()).toBe(0);
  });

  it('feeds the continuous aggregates with bucket counts', async () => {
    await publish(
      ...Array.from({ length: 4 }, (_, index) =>
        batch({ events: [{ t: 'vital', n: 'LCP', v: 1000 * (index + 1) }] }),
      ),
    );
    await consumer('c1').runOnce();
    await sql`call refresh_continuous_aggregate('vitals_hourly', null, null)`;
    const rows = await sql<{ samples: string; good: string; poor: string }[]>`
      select sum(samples) as samples, sum(good) as good, sum(poor) as poor
      from vitals_hourly where project_id = ${projectId} and metric = 'LCP'`;
    expect(rows[0]).toEqual({ samples: '4', good: '2', poor: '0' });
  });

  it('dead-letters malformed messages and isolates a poisoned one', async () => {
    // A row the database refuses (unknown device) poisons the batch write.
    await publish(
      '{not json',
      batch(),
      batch({ device: 'watch' as EnrichedBatch['device'] }),
      batch(),
    );

    const first = consumer('c1', { claimIdleMs: 50, maxDeliveries: 2 });
    expect(await first.runOnce()).toBe(2);
    expect(await redis.xlen(DEAD_LETTER_STREAM)).toBe(1);
    expect((await sql`select * from page_views`).length).toBe(2);

    // Reclaimed after 50 ms, still failing; beyond 2 deliveries it is set aside.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 80));
      await first.runOnce();
    }
    const dead = await redis.xrange(DEAD_LETTER_STREAM, '-', '+');
    expect(dead.map(([, fields]) => fields[fields.indexOf('reason') + 1])).toEqual([
      'malformed',
      'max deliveries',
    ]);
    expect(await pendingCount()).toBe(0);
  });

  it('takes over the messages of a consumer that crashed', async () => {
    await publish(batch(), batch());
    // A consumer reads them, then dies before acknowledging.
    await redis.xreadgroup('GROUP', GROUP, 'crashed', 'COUNT', 10, 'STREAMS', STREAM, '>');
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(await consumer('survivor', { claimIdleMs: 50 }).runOnce()).toBe(2);
    expect((await sql`select * from page_views`).length).toBe(2);
  });
});
