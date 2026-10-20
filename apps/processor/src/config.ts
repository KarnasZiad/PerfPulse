import { hostname } from 'node:os';
import { z } from 'zod';

export const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:[/][/]/, 'DATABASE_URL must be a PostgreSQL URL'),
  MONGODB_URL: z.string().regex(/^mongodb(\+srv)?:[/][/]/, 'MONGODB_URL must be a MongoDB URL'),
  MONGODB_DATABASE: z.string().default('perfpulse'),
  REDIS_URL: z.string().regex(/^rediss?:[/][/]/, 'REDIS_URL must be a Redis URL'),
  /** Unique per instance: pending messages belong to a consumer name. */
  CONSUMER_NAME: z
    .string()
    .regex(/^[\w.-]{1,64}$/)
    .default(`${hostname()}-${process.pid}`),
  BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(200),
  BLOCK_MS: z.coerce.number().int().min(100).max(30_000).default(2000),
  CLAIM_IDLE_MS: z.coerce.number().int().min(1000).default(60_000),
  MAX_DELIVERIES: z.coerce.number().int().min(1).max(100).default(5),
});

export type ProcessorConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ProcessorConfig {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
