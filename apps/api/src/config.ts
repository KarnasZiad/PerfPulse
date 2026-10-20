import { z } from 'zod';

const booleanFlag = z.enum(['true', 'false']).transform((value) => value === 'true');
const secret = (name: string) =>
  z
    .string()
    .transform((value) => Buffer.from(value, 'base64'))
    .refine((key) => key.length >= 32, `${name} must decode to at least 32 bytes`);

export const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4200),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:[/][/]/, 'DATABASE_URL must be a PostgreSQL URL'),
  MONGODB_URL: z.string().regex(/^mongodb(\+srv)?:[/][/]/, 'MONGODB_URL must be a MongoDB URL'),
  MONGODB_DATABASE: z.string().default('perfpulse'),
  /** Origin of the dashboard: state-changing requests must come from it. */
  PUBLIC_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:5174'),
  /** Same pepper as the CLI that creates the read tokens. */
  API_TOKEN_PEPPER: secret('API_TOKEN_PEPPER'),
  /** Signs the session cookie. */
  SESSION_SECRET: secret('SESSION_SECRET'),
  SESSION_HOURS: z.coerce.number().int().min(1).max(24).default(12),
  COOKIE_SECURE: booleanFlag.default(true),
});

export type ApiConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
