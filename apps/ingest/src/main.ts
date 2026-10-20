import { Redis } from 'ioredis';
import postgres from 'postgres';
import { PostgresProjectCatalog, RedisRateLimiter, RedisStreamSink } from './adapters.js';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const sql = postgres(config.DATABASE_URL, { max: 2, idle_timeout: 30 });
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 2, enableOfflineQueue: false });

// The callback runs on refresh failures only, once the app below exists.
const catalog = new PostgresProjectCatalog(sql, (error) => {
  app.log.error({ err: error }, 'could not refresh the projects');
});

const app = buildApp({
  config,
  catalog,
  limiter: new RedisRateLimiter(redis, config.RATE_LIMIT_PER_MINUTE),
  sink: new RedisStreamSink(redis, config.STREAM_MAX_LENGTH),
  health: { redis: () => redis.ping(), postgres: () => sql`select 1` },
});

await catalog.start(config.PROJECTS_REFRESH_SECONDS);
await app.listen({ host: config.HOST, port: config.PORT });

async function shutdown(): Promise<void> {
  catalog.stop();
  await app.close();
  await Promise.allSettled([redis.quit(), sql.end({ timeout: 5 })]);
  process.exit(0);
}
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
