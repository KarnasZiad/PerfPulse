import { z } from 'zod';
import { ERROR_SOURCES, LIMITS, METRICS, NAVIGATION_TYPES, PROTOCOL_VERSION } from './index.js';

// z.number() refuses Infinity and NaN in Zod 4. Strict objects: an unknown field is a malformed or forged batch, not a future extension
// (a new protocol version changes `v`).
const vital = z
  .object({ t: z.literal('vital'), n: z.enum(METRICS), v: z.number().min(0) })
  .strict();

const view = z.object({ t: z.literal('view'), nt: z.enum(NAVIGATION_TYPES) }).strict();

const error = z
  .object({
    t: z.literal('error'),
    m: z.string().min(1).max(LIMITS.message),
    st: z.string().max(LIMITS.stack).optional(),
    src: z.enum(ERROR_SOURCES),
  })
  .strict();

export const batchSchema = z
  .object({
    v: z.literal(PROTOCOL_VERSION),
    k: z.string().regex(/^pk_[A-Za-z0-9]{32}$/),
    s: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
    p: z.string().min(1).max(LIMITS.path).startsWith('/'),
    r: z
      .string()
      .min(1)
      .max(LIMITS.release)
      .regex(/^[\w.+-]+$/)
      .optional(),
    ev: z
      .array(z.discriminatedUnion('t', [vital, view, error]))
      .min(1)
      .max(LIMITS.events),
  })
  .strict();

export type ParsedBatch = z.output<typeof batchSchema>;
