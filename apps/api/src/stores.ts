import { createHmac } from 'node:crypto';
import type { Metric } from '@perfpulse/protocol';
import type { Db } from 'mongodb';
import type { Sql } from 'postgres';
import type {
  BucketCount,
  DeviceFilter,
  Directory,
  ErrorDetail,
  ErrorGroupSummary,
  ErrorStore,
  MetricHistogram,
  PageHistogram,
  ProjectSummary,
  TimedHistogram,
  VitalsStore,
  Window,
} from './ports.js';

/** Same digest as the CLI that issued the token: HMAC-SHA256 with the server-side pepper. */
export function hashToken(token: string, pepper: Buffer): Buffer {
  return createHmac('sha256', pepper).update(token).digest();
}

export class PostgresDirectory implements Directory {
  constructor(
    private readonly sql: Sql,
    private readonly pepper: Buffer,
  ) {}

  async projectOfToken(token: string): Promise<ProjectSummary | null> {
    const [project] = await this.sql<ProjectSummary[]>`
      with used as (
        update api_tokens set last_used_at = now()
        where token_hash = ${hashToken(token, this.pepper)} and revoked_at is null
        returning project_id
      )
      select p.id, p.slug, p.name from projects p join used on used.project_id = p.id`;
    return project ?? null;
  }

  async projects(ids: readonly string[]): Promise<ProjectSummary[]> {
    if (ids.length === 0) return [];
    return this.sql<ProjectSummary[]>`
      select id, slug, name from projects where id in ${this.sql([...ids])} order by name`;
  }
}

interface BucketRow {
  metric: Metric;
  bucket: number;
  samples: number;
}

function deviceClause(sql: Sql, device: DeviceFilter) {
  return device === 'all' ? sql`` : sql`and device = ${device}`;
}

/** Sums over the continuous aggregates: hundreds of rows read, whatever the traffic. */
export class TimescaleVitalsStore implements VitalsStore {
  constructor(private readonly sql: Sql) {}

  async histograms(
    projectId: string,
    window: Window,
    device: DeviceFilter,
  ): Promise<MetricHistogram[]> {
    const rows = await this.sql<
      (BucketRow & { good: number; needs_improvement: number; poor: number })[]
    >`
      select metric, bucket, sum(samples)::int as samples, sum(good)::int as good,
        sum(needs_improvement)::int as needs_improvement, sum(poor)::int as poor
      from vitals_hourly
      where project_id = ${projectId} and hour >= ${window.from} and hour < ${window.to}
        ${deviceClause(this.sql, device)}
      group by metric, bucket`;
    const byMetric = new Map<Metric, MetricHistogram>();
    for (const row of rows) {
      const histogram = byMetric.get(row.metric) ?? {
        metric: row.metric,
        buckets: [],
        good: 0,
        needsImprovement: 0,
        poor: 0,
      };
      histogram.buckets.push({ bucket: row.bucket, samples: row.samples });
      histogram.good += row.good;
      histogram.needsImprovement += row.needs_improvement;
      histogram.poor += row.poor;
      byMetric.set(row.metric, histogram);
    }
    return [...byMetric.values()];
  }

  async series(
    projectId: string,
    metric: Metric,
    window: Window,
    step: 'hour' | 'day',
    device: DeviceFilter,
  ): Promise<TimedHistogram[]> {
    const rows = await this.sql<{ time: Date; bucket: number; samples: number }[]>`
      select time_bucket(${step === 'hour' ? '1 hour' : '1 day'}::interval, hour) as time, bucket,
        sum(samples)::int as samples
      from vitals_hourly
      where project_id = ${projectId} and metric = ${metric}
        and hour >= ${window.from} and hour < ${window.to} ${deviceClause(this.sql, device)}
      group by 1, 2
      order by 1`;
    const points = new Map<number, TimedHistogram>();
    for (const row of rows) {
      const key = row.time.getTime();
      const point = points.get(key) ?? { time: row.time, buckets: [] };
      point.buckets.push({ bucket: row.bucket, samples: row.samples });
      points.set(key, point);
    }
    return [...points.values()];
  }

  async pages(projectId: string, window: Window, limit: number): Promise<PageHistogram[]> {
    const rows = await this.sql<
      {
        page: string;
        views: number;
        metric: Metric | null;
        bucket: number | null;
        samples: number | null;
      }[]
    >`
      with top as (
        select page, sum(views)::int as views
        from page_views_daily
        where project_id = ${projectId} and day >= date_trunc('day', ${window.from}::timestamptz) and day < ${window.to}
        group by page
        order by views desc
        limit ${limit}
      )
      select top.page, top.views, v.metric, v.bucket, sum(v.samples)::int as samples
      from top
      left join vitals_daily_pages v
        on v.page = top.page and v.project_id = ${projectId}
        and v.day >= date_trunc('day', ${window.from}::timestamptz) and v.day < ${window.to}
      group by top.page, top.views, v.metric, v.bucket
      order by top.views desc, top.page`;
    const pages = new Map<string, PageHistogram>();
    for (const row of rows) {
      const page = pages.get(row.page) ?? { page: row.page, views: row.views, metrics: {} };
      if (row.metric !== null && row.bucket !== null && row.samples !== null) {
        const buckets: BucketCount[] = page.metrics[row.metric] ?? [];
        buckets.push({ bucket: row.bucket, samples: row.samples });
        page.metrics[row.metric] = buckets;
      }
      pages.set(row.page, page);
    }
    return [...pages.values()];
  }
}

interface GroupDocument {
  _id: string;
  projectId: string;
  type: string;
  message: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  browsers?: Record<string, number>;
}

/** Every query filters on the project as well as on the fingerprint. */
export class MongoErrorStore implements ErrorStore {
  constructor(private readonly db: Db) {}

  private summary(group: GroupDocument, count: number): ErrorGroupSummary {
    return {
      fingerprint: group._id,
      type: group.type,
      message: group.message,
      count,
      total: group.count,
      firstSeen: group.firstSeen.toISOString(),
      lastSeen: group.lastSeen.toISOString(),
      browsers: group.browsers ?? {},
    };
  }

  async list(projectId: string, sinceDay: string, limit: number): Promise<ErrorGroupSummary[]> {
    const counts = await this.db
      .collection('error_daily')
      .aggregate<{ _id: string; count: number }>([
        { $match: { projectId, day: { $gte: sinceDay } } },
        { $group: { _id: '$fingerprint', count: { $sum: '$count' } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: limit },
      ])
      .toArray();
    const groups = await this.db
      .collection<GroupDocument>('error_groups')
      .find({ _id: { $in: counts.map((entry) => entry._id) }, projectId })
      .toArray();
    const byId = new Map(groups.map((group) => [group._id, group]));
    return counts.flatMap((entry) => {
      const group = byId.get(entry._id);
      return group ? [this.summary(group, entry.count)] : [];
    });
  }

  async detail(
    projectId: string,
    fingerprint: string,
    sinceDay: string,
  ): Promise<ErrorDetail | null> {
    const group = await this.db
      .collection<GroupDocument>('error_groups')
      .findOne({ _id: fingerprint, projectId });
    if (!group) return null;
    const [daily, samples] = await Promise.all([
      this.db
        .collection<{ day: string; count: number }>('error_daily')
        .find(
          { projectId, fingerprint, day: { $gte: sinceDay } },
          { projection: { _id: 0, day: 1, count: 1 } },
        )
        .sort({ day: 1 })
        .toArray(),
      this.db
        .collection('error_events')
        .find({ projectId, fingerprint }, { projection: { _id: 0, fingerprint: 0, projectId: 0 } })
        .sort({ at: -1 })
        .limit(10)
        .toArray(),
    ]);
    return {
      ...this.summary(
        group,
        daily.reduce((sum, entry) => sum + entry.count, 0),
      ),
      daily: daily.map((entry) => ({ day: entry.day, count: entry.count })),
      samples: samples.map((sample) => ({
        at: (sample.at as Date).toISOString(),
        message: String(sample.message),
        stack: (sample.stack as string | null | undefined) ?? null,
        page: String(sample.page),
        browser: String(sample.browser),
        os: String(sample.os),
        device: String(sample.device),
        release: (sample.release as string | null | undefined) ?? null,
      })),
    };
  }
}
