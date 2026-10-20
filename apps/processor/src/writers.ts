import type { AnyBulkWriteOperation, Db } from 'mongodb';
import type { Sql } from 'postgres';
import type { ErrorOccurrence, Rows } from './transform.js';

/** Occurrences kept as examples per group and per write; the others are only counted. */
export const SAMPLES_PER_GROUP = 5;
export const ERROR_EVENTS_TTL_SECONDS = 14 * 24 * 3600;

const VITAL_COLUMNS = [
  'time',
  'project_id',
  'metric',
  'value',
  'bucket',
  'rating',
  'page',
  'device',
  'browser',
  'os',
  'country',
  'session_id',
  'release',
] as const;

const VIEW_COLUMNS = [
  'time',
  'project_id',
  'page',
  'navigation_type',
  'device',
  'browser',
  'os',
  'country',
  'session_id',
  'release',
] as const;

/** One multi-row INSERT per table and per batch of stream messages. */
export class MeasureWriter {
  constructor(private readonly sql: Sql) {}

  async write({ vitals, views }: Pick<Rows, 'vitals' | 'views'>): Promise<void> {
    if (vitals.length > 0) {
      await this.sql`insert into web_vitals ${this.sql(vitals, ...VITAL_COLUMNS)}`;
    }
    if (views.length > 0) {
      await this.sql`insert into page_views ${this.sql(views, ...VIEW_COLUMNS)}`;
    }
  }
}

interface ErrorGroup {
  _id: string;
  projectId: string;
  type: string;
  message: string;
  firstSeen: Date;
  lastSeen: Date;
  count: number;
  browsers: Record<string, number>;
  sample: { stack: string | null; page: string; browser: string; release: string | null };
}

interface ErrorDaily {
  _id: string;
  projectId: string;
  fingerprint: string;
  day: string;
  count: number;
}

export async function ensureErrorIndexes(db: Db): Promise<void> {
  await db.collection('error_groups').createIndex({ projectId: 1, lastSeen: -1 });
  await db.collection('error_daily').createIndex({ projectId: 1, day: 1 });
  await db.collection('error_events').createIndex({ fingerprint: 1, at: -1 });
  await db
    .collection('error_events')
    .createIndex({ at: 1 }, { name: 'ttl', expireAfterSeconds: ERROR_EVENTS_TTL_SECONDS });
}

/** Groups, daily counters and a few examples, in three unordered bulk writes. */
export class ErrorWriter {
  constructor(private readonly db: Db) {}

  async write(errors: readonly ErrorOccurrence[]): Promise<void> {
    if (errors.length === 0) return;
    const byGroup = new Map<string, ErrorOccurrence[]>();
    for (const error of errors) {
      const group = byGroup.get(error.fingerprint);
      if (group) group.push(error);
      else byGroup.set(error.fingerprint, [error]);
    }

    const groups: AnyBulkWriteOperation<ErrorGroup>[] = [];
    const daily = new Map<string, ErrorDaily>();
    const samples: Record<string, unknown>[] = [];
    for (const [id, occurrences] of byGroup) {
      const [first] = occurrences;
      if (!first) continue;
      const latest = occurrences.reduce((a, b) => (b.at > a.at ? b : a));
      const browsers: Record<string, number> = {};
      for (const occurrence of occurrences) {
        browsers[`browsers.${occurrence.browser}`] =
          (browsers[`browsers.${occurrence.browser}`] ?? 0) + 1;
        const day = occurrence.at.toISOString().slice(0, 10);
        const key = `${id}:${day}`;
        const entry = daily.get(key) ?? {
          _id: key,
          projectId: first.project,
          fingerprint: id,
          day,
          count: 0,
        };
        entry.count += 1;
        daily.set(key, entry);
      }
      groups.push({
        updateOne: {
          filter: { _id: id },
          update: {
            $setOnInsert: { projectId: first.project, type: first.type, message: first.message },
            $min: { firstSeen: first.at },
            $max: { lastSeen: latest.at },
            $inc: { count: occurrences.length, ...browsers },
            $set: {
              sample: {
                stack: latest.stack,
                page: latest.page,
                browser: latest.browser,
                release: latest.release,
              },
            },
          },
          upsert: true,
        },
      });
      samples.push(
        ...occurrences.slice(0, SAMPLES_PER_GROUP).map((occurrence) => ({
          fingerprint: id,
          projectId: occurrence.project,
          at: occurrence.at,
          message: occurrence.message,
          stack: occurrence.stack,
          page: occurrence.page,
          browser: occurrence.browser,
          os: occurrence.os,
          device: occurrence.device,
          release: occurrence.release,
        })),
      );
    }

    await this.db.collection<ErrorGroup>('error_groups').bulkWrite(groups, { ordered: false });
    await this.db.collection<ErrorDaily>('error_daily').bulkWrite(
      [...daily.values()].map(({ _id, count, ...fields }) => ({
        updateOne: {
          filter: { _id },
          update: { $setOnInsert: fields, $inc: { count } },
          upsert: true,
        },
      })),
      { ordered: false },
    );
    await this.db.collection('error_events').insertMany(samples, { ordered: false });
  }
}
