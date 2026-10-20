import { MongoClient } from 'mongodb';
import postgres from 'postgres';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { MongoErrorStore, PostgresDirectory, TimescaleVitalsStore } from './stores.js';

const config = loadConfig();
const sql = postgres(config.DATABASE_URL, { max: 8 });
const mongo = await new MongoClient(config.MONGODB_URL, { appName: 'perfpulse-api' }).connect();
const db = mongo.db(config.MONGODB_DATABASE);

const app = await buildApp({
  config,
  directory: new PostgresDirectory(sql, config.API_TOKEN_PEPPER),
  vitals: new TimescaleVitalsStore(sql),
  errors: new MongoErrorStore(db),
  health: { postgres: () => sql`select 1`, mongodb: () => db.command({ ping: 1 }) },
});
await app.listen({ host: config.HOST, port: config.PORT });

async function shutdown(): Promise<void> {
  await app.close();
  await Promise.allSettled([mongo.close(), sql.end({ timeout: 5 })]);
  process.exit(0);
}
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
