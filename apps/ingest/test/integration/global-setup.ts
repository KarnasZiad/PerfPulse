import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    postgresUrl: string;
    redisUrl: string;
  }
}

/** The ingestion reads one table and writes to Redis; the image is the one CI pulls anyway. */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const [postgres, redis] = await Promise.all([
    new PostgreSqlContainer('timescale/timescaledb:2.30.2-pg17').withDatabase('perfpulse').start(),
    new RedisContainer('redis:7.4-alpine').start(),
  ]);
  project.provide('postgresUrl', postgres.getConnectionUri());
  project.provide('redisUrl', redis.getConnectionUrl());
  return async () => {
    await Promise.all([postgres.stop(), redis.stop()]);
  };
}
