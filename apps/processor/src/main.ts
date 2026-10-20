import { Redis } from 'ioredis';
import { MongoClient } from 'mongodb';
import { pino } from 'pino';
import postgres from 'postgres';
import { loadConfig } from './config.js';
import { StreamConsumer } from './consumer.js';
import { ensureErrorIndexes, ErrorWriter, MeasureWriter } from './writers.js';

const config = loadConfig();
const logger = pino({ name: 'perfpulse-processor', level: config.LOG_LEVEL });
const sql = postgres(config.DATABASE_URL, { max: 4 });
const mongo = await new MongoClient(config.MONGODB_URL, {
  appName: 'perfpulse-processor',
}).connect();
const db = mongo.db(config.MONGODB_DATABASE);
// The consumer blocks on XREADGROUP: no per-request retry limit.
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

await ensureErrorIndexes(db);
const measures = new MeasureWriter(sql);
const errors = new ErrorWriter(db);
const consumer = new StreamConsumer(
  redis,
  async (rows) => {
    await Promise.all([measures.write(rows), errors.write(rows.errors)]);
  },
  {
    consumer: config.CONSUMER_NAME,
    batchSize: config.BATCH_SIZE,
    blockMs: config.BLOCK_MS,
    claimIdleMs: config.CLAIM_IDLE_MS,
    maxDeliveries: config.MAX_DELIVERIES,
  },
  logger,
);
await consumer.ensureGroup();
logger.info({ consumer: config.CONSUMER_NAME }, 'processor started');
const running = consumer.run();

async function shutdown(): Promise<void> {
  consumer.stop();
  await running;
  await Promise.allSettled([redis.quit(), mongo.close(), sql.end({ timeout: 5 })]);
  process.exit(0);
}
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
