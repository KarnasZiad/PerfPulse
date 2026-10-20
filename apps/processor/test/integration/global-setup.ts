import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';
import postgres from 'postgres';
import { GenericContainer, Wait } from 'testcontainers';
import type { TestProject } from 'vitest/node';
import { migrate } from '../../src/migrator.js';

declare module 'vitest' {
  export interface ProvidedContext {
    postgresUrl: string;
    mongoUrl: string;
    redisUrl: string;
  }
}

/** One TimescaleDB, MongoDB and Redis for the whole suite; migrations applied once. */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const [timescale, mongo, redis] = await Promise.all([
    // The official TimescaleDB image is PostgreSQL with the extension preloaded.
    new PostgreSqlContainer('timescale/timescaledb:2.30.2-pg17').withDatabase('perfpulse').start(),
    // Standalone server, waited on its port: log streams proved unreliable on CI.
    new GenericContainer('mongo:8.0')
      .withExposedPorts(27017)
      .withWaitStrategy(Wait.forListeningPorts())
      .withStartupTimeout(60_000)
      .start(),
    new RedisContainer('redis:7.4-alpine').start(),
  ]);

  const sql = postgres(timescale.getConnectionUri(), { max: 1, onnotice: () => undefined });
  await migrate(sql);
  await sql.end();

  project.provide('postgresUrl', timescale.getConnectionUri());
  project.provide('mongoUrl', `mongodb://${mongo.getHost()}:${mongo.getMappedPort(27017)}`);
  project.provide('redisUrl', redis.getConnectionUrl());

  return async () => {
    await Promise.all([timescale.stop(), mongo.stop(), redis.stop()]);
  };
}
