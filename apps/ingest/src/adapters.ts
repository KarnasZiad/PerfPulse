import { type EnrichedBatch, STREAM } from '@perfpulse/protocol';
import type { Redis } from 'ioredis';
import type { Sql } from 'postgres';
import type { EventSink, Project, ProjectCatalog, RateLimiter } from './ports.js';

/**
 * Projects reloaded periodically from PostgreSQL. A failed refresh keeps the previous catalog: a
 * database hiccup must not stop the collection.
 */
export class PostgresProjectCatalog implements ProjectCatalog {
  private projects = new Map<string, Project>();
  private loaded = false;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly sql: Sql,
    private readonly onError: (error: unknown) => void,
  ) {}

  get ready(): boolean {
    return this.loaded;
  }

  find(publicKey: string): Project | undefined {
    return this.projects.get(publicKey);
  }

  async refresh(): Promise<void> {
    const rows = await this.sql<{ id: string; public_key: string; allowed_origins: string[] }[]>`
      select id, public_key, allowed_origins from projects`;
    this.projects = new Map(
      rows.map((row) => [
        row.public_key,
        { id: row.id, publicKey: row.public_key, allowedOrigins: row.allowed_origins },
      ]),
    );
    this.loaded = true;
  }

  async start(intervalSeconds: number): Promise<void> {
    await this.refresh();
    this.timer = setInterval(() => {
      this.refresh().catch(this.onError);
    }, intervalSeconds * 1000);
    this.timer.unref();
  }

  stop(): void {
    clearInterval(this.timer);
  }
}

/** INCR then EXPIRE in one round trip; the window starts with the first hit of the minute. */
export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly limit: number,
  ) {}

  async hit(key: string): Promise<boolean> {
    const minute = Math.floor(Date.now() / 60_000);
    const redisKey = `pp:rate:${key}:${minute}`;
    const results = await this.redis.multi().incr(redisKey).expire(redisKey, 60).exec();
    const count = Number(results?.[0]?.[1] ?? 0);
    return count <= this.limit;
  }
}

/** One XADD per batch; MAXLEN ~ bounds the memory Redis can use for the backlog. */
export class RedisStreamSink implements EventSink {
  constructor(
    private readonly redis: Redis,
    private readonly maxLength: number,
  ) {}

  async publish(batch: EnrichedBatch): Promise<void> {
    await this.redis.xadd(STREAM, 'MAXLEN', '~', this.maxLength, '*', 'b', JSON.stringify(batch));
  }
}
