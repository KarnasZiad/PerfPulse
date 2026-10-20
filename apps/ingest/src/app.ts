import { randomUUID } from 'node:crypto';
import { type CollectedEvent, type EnrichedBatch, isPlausible, LIMITS } from '@perfpulse/protocol';
import { batchSchema } from '@perfpulse/protocol/schema';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import type { IngestConfig } from './config.js';
import { countryOf, describeClient, isBot, normalizePath } from './enrich.js';
import { Metrics, type Rejection } from './metrics.js';
import type { EventSink, ProjectCatalog, RateLimiter } from './ports.js';

export interface IngestDeps {
  config: Pick<IngestConfig, 'LOG_LEVEL' | 'TRUST_PROXY_HOPS' | 'COUNTRY_HEADER'>;
  catalog: ProjectCatalog;
  limiter: RateLimiter;
  sink: EventSink;
  health: Record<string, () => Promise<unknown>>;
  metrics?: Metrics;
  now?: () => number;
}

const MAX_USER_AGENT = 512;

/** Keeps every event but implausible vitals (background tabs, broken clocks). */
function plausibleEvents(events: CollectedEvent[]): { kept: CollectedEvent[]; dropped: number } {
  const kept = events.filter((event) => event.t !== 'vital' || isPlausible(event.n, event.v));
  return { kept, dropped: events.length - kept.length };
}

export function buildApp(deps: IngestDeps): FastifyInstance {
  const metrics = deps.metrics ?? new Metrics();
  const now = deps.now ?? Date.now;
  const app = Fastify({
    logger: {
      level: deps.config.LOG_LEVEL,
      // The User-Agent and the IP are personal data: they never reach the logs.
      redact: ['req.headers["user-agent"]', 'req.headers["x-forwarded-for"]', 'req.remoteAddress'],
    },
    bodyLimit: LIMITS.bodyBytes,
    trustProxy: (_address: string, hop: number) => hop < deps.config.TRUST_PROXY_HOPS,
    genReqId: () => randomUUID(),
    disableRequestLogging: true,
  });

  // sendBeacon sends text/plain (no CORS preflight); both are parsed by the same validation.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser(
    ['text/plain', 'application/json'],
    { parseAs: 'string' },
    (_request, body, done) => {
      done(null, body);
    },
  );

  const refuse = (reply: FastifyReply, status: number, reason: Rejection) => {
    metrics.reject(reason);
    return reply.code(status).send();
  };

  app.post('/v1/collect', async (request, reply) => {
    let raw: unknown;
    try {
      raw = JSON.parse(String(request.body));
    } catch {
      return refuse(reply, 400, 'body');
    }
    const parsed = batchSchema.safeParse(raw);
    if (!parsed.success) return refuse(reply, 400, 'schema');
    const batch = parsed.data;

    // Unknown key and foreign origin answer alike: nothing tells which keys exist.
    const project = deps.catalog.find(batch.k);
    if (!project) return refuse(reply, 403, 'project');
    const origin = request.headers.origin;
    if (!origin || !project.allowedOrigins.includes(origin)) return refuse(reply, 403, 'origin');
    // A browser receiving this header will not log a CORS error for the fetch fallback.
    void reply.header('access-control-allow-origin', origin).header('vary', 'Origin');

    const userAgent = (request.headers['user-agent'] ?? '').slice(0, MAX_USER_AGENT);
    if (isBot(userAgent)) return refuse(reply, 204, 'bot');
    // The IP is a rate-limiting key in memory and in Redis for a minute, never stored with data.
    if (!(await deps.limiter.hit(`${project.id}:${request.ip}`))) return refuse(reply, 429, 'rate');

    const { kept, dropped } = plausibleEvents(batch.ev);
    const enriched: EnrichedBatch = {
      project: project.id,
      receivedAt: now(),
      session: batch.s,
      path: normalizePath(batch.p),
      release: batch.r ?? null,
      ...describeClient(userAgent),
      country: deps.config.COUNTRY_HEADER
        ? countryOf(request.headers[deps.config.COUNTRY_HEADER])
        : null,
      events: kept,
    };
    try {
      await deps.sink.publish(enriched);
    } catch (error) {
      request.log.error({ err: error }, 'stream unavailable');
      return refuse(reply, 503, 'unavailable');
    }
    metrics.accept(kept.length, dropped);
    return reply.code(204).send();
  });

  app.get('/health/live', () => ({ status: 'up' }));
  app.get('/health/ready', async (_request, reply) => {
    const checks = await Promise.all(
      Object.entries(deps.health).map(async ([name, check]) => {
        try {
          await check();
          return [name, 'up'] as const;
        } catch {
          return [name, 'down'] as const;
        }
      }),
    );
    const dependencies = Object.fromEntries([
      ...checks,
      ['projects', deps.catalog.ready ? 'up' : 'down'],
    ]);
    const up = Object.values(dependencies).every((status) => status === 'up');
    return reply.code(up ? 200 : 503).send({ status: up ? 'up' : 'down', dependencies });
  });
  app.get('/metrics', (_request, reply) =>
    reply.type('text/plain; version=0.0.4').send(metrics.render()),
  );

  return app;
}
