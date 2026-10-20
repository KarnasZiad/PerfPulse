import { migrate } from '@perfpulse/processor/migrator';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import postgres from 'postgres';
import { GenericContainer, Wait } from 'testcontainers';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    postgresUrl: string;
    mongoUrl: string;
  }
}

/** TimescaleDB with the schema of the processor, and MongoDB. */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const [timescale, mongo] = await Promise.all([
    new PostgreSqlContainer('timescale/timescaledb:2.30.2-pg17').withDatabase('perfpulse').start(),
    new GenericContainer('mongo:8.0')
      .withExposedPorts(27017)
      .withWaitStrategy(Wait.forListeningPorts())
      .withStartupTimeout(60_000)
      .start(),
  ]);
  const sql = postgres(timescale.getConnectionUri(), { max: 1, onnotice: () => undefined });
  await migrate(sql);
  await sql.end();
  project.provide('postgresUrl', timescale.getConnectionUri());
  project.provide('mongoUrl', `mongodb://${mongo.getHost()}:${mongo.getMappedPort(27017)}`);
  return async () => {
    await Promise.all([timescale.stop(), mongo.stop()]);
  };
}
