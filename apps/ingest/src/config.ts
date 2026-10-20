import { z } from 'zod';

export const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4100),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Reverse proxies in front of the ingestion: the client IP is the rate-limiting key. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  /** Read access to the projects table only; the ingestion never writes to PostgreSQL. */
  DATABASE_URL: z.string().regex(/^postgres(ql)?:[/][/]/, 'DATABASE_URL must be a PostgreSQL URL'),
  REDIS_URL: z.string().regex(/^rediss?:[/][/]/, 'REDIS_URL must be a Redis URL'),
  /** Header set by a trusted CDN with the visitor's country (cf-ipcountry); unset means none. */
  COUNTRY_HEADER: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(10).max(100_000).default(600),
  STREAM_MAX_LENGTH: z.coerce.number().int().min(1000).default(1_000_000),
  PROJECTS_REFRESH_SECONDS: z.coerce.number().int().min(5).max(3600).default(60),
});

export type IngestConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): IngestConfig {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
