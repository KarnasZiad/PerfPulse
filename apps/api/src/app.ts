import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { METRICS } from '@perfpulse/protocol';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { ApiConfig } from './config.js';
import { p75, sinceDay, stepOf, windows } from './percentiles.js';
import {
  type Directory,
  type ErrorStore,
  type ProjectSummary,
  RANGES,
  type VitalsStore,
} from './ports.js';

export interface ApiDeps {
  config: Pick<
    ApiConfig,
    | 'LOG_LEVEL'
    | 'TRUST_PROXY_HOPS'
    | 'PUBLIC_URL'
    | 'SESSION_SECRET'
    | 'SESSION_HOURS'
    | 'COOKIE_SECURE'
  >;
  directory: Directory;
  vitals: VitalsStore;
  errors: ErrorStore;
  health: Record<string, () => Promise<unknown>>;
  now?: () => Date;
}

const MAX_PROJECTS_PER_SESSION = 20;
const session = z.object({ p: z.array(z.uuid()).max(MAX_PROJECTS_PER_SESSION), exp: z.number() });
type Session = z.infer<typeof session>;

const range = z.enum(RANGES).default('7d');
const device = z.enum(['all', 'mobile', 'tablet', 'desktop']).default('all');
const slugParams = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,50}$/) }).strict();

class Problem extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
  ) {
    super(title);
  }
}

function problem(
  reply: FastifyReply,
  status: number,
  title: string,
  extra: Record<string, unknown> = {},
) {
  return reply
    .code(status)
    .type('application/problem+json')
    .send({ type: 'about:blank', title, status, ...extra });
}

/** Async: the cookie and rate-limit plugins must be ready before the routes are declared. */
export async function buildApp(deps: ApiDeps): Promise<FastifyInstance> {
  const now = deps.now ?? (() => new Date());
  const { config } = deps;
  const cookieName = config.COOKIE_SECURE ? '__Host-perfpulse_session' : 'perfpulse_session';
  const publicOrigin = new URL(config.PUBLIC_URL).origin;

  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: ['req.headers.cookie', 'res.headers["set-cookie"]'],
    },
    trustProxy: (_address: string, hop: number) => hop < config.TRUST_PROXY_HOPS,
    genReqId: () => randomUUID(),
    bodyLimit: 4096,
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cookie, { secret: config.SESSION_SECRET.toString('base64') });
  await app.register(rateLimit, { global: false });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof Problem) return problem(reply, error.status, error.title);
    if (hasZodFastifySchemaValidationErrors(error)) {
      return problem(reply, 400, 'Bad Request', {
        errors: error.validation.map((issue) => ({
          path: issue.instancePath,
          message: issue.message,
        })),
      });
    }
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status < 500) return problem(reply, status, (error as Error).message);
    request.log.error({ err: error }, 'request failed');
    return problem(reply, 500, 'Internal Server Error');
  });
  app.setNotFoundHandler((_request, reply) => problem(reply, 404, 'Not Found'));

  function readSession(request: FastifyRequest): Session | null {
    const raw = request.cookies[cookieName];
    if (!raw) return null;
    const unsigned = request.unsignCookie(raw);
    if (!unsigned.valid) return null;
    try {
      const parsed = session.safeParse(JSON.parse(unsigned.value));
      return parsed.success && parsed.data.exp > now().getTime() ? parsed.data : null;
    } catch {
      return null;
    }
  }

  function writeSession(reply: FastifyReply, projects: readonly string[]): void {
    const maxAge = config.SESSION_HOURS * 3600;
    const value: Session = { p: [...projects], exp: now().getTime() + maxAge * 1000 };
    void reply.setCookie(cookieName, JSON.stringify(value), {
      signed: true,
      httpOnly: true,
      secure: config.COOKIE_SECURE,
      sameSite: 'strict',
      path: '/',
      maxAge,
    });
  }

  /** SameSite=Strict already blocks cross-site requests; the Origin check is the second lock. */
  function requireSameOrigin(request: FastifyRequest): void {
    if (request.headers.origin !== publicOrigin) throw new Problem(403, 'Cross-origin request');
  }

  async function projectFor(request: FastifyRequest, slug: string): Promise<ProjectSummary> {
    const current = readSession(request);
    if (!current) throw new Problem(401, 'Unauthorized');
    const project = (await deps.directory.projects(current.p)).find((item) => item.slug === slug);
    // Another project answers like a project that does not exist.
    if (!project) throw new Problem(404, 'Not Found');
    return project;
  }

  app.post(
    '/api/session',
    {
      schema: { body: z.object({ token: z.string().regex(/^pp_read_[A-Za-z0-9]{40}$/) }).strict() },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      requireSameOrigin(request);
      const project = await deps.directory.projectOfToken(request.body.token);
      if (!project) throw new Problem(401, 'Invalid or revoked token');
      const previous = readSession(request)?.p ?? [];
      const projects = [project.id, ...previous.filter((id) => id !== project.id)].slice(
        0,
        MAX_PROJECTS_PER_SESSION,
      );
      writeSession(reply, projects);
      return { project };
    },
  );

  app.delete('/api/session', (request, reply) => {
    requireSameOrigin(request);
    void reply.clearCookie(cookieName, { path: '/' });
    return reply.code(204).send();
  });

  app.get('/api/projects', async (request) => {
    const current = readSession(request);
    if (!current) throw new Problem(401, 'Unauthorized');
    return { items: await deps.directory.projects(current.p) };
  });

  app.get(
    '/api/projects/:slug/overview',
    { schema: { params: slugParams, querystring: z.object({ range, device }).strict() } },
    async (request) => {
      const project = await projectFor(request, request.params.slug);
      const { current, previous } = windows(request.query.range, now());
      const [histograms, before] = await Promise.all([
        deps.vitals.histograms(project.id, current, request.query.device),
        deps.vitals.histograms(project.id, previous, request.query.device),
      ]);
      return {
        range: request.query.range,
        metrics: METRICS.map((metric) => {
          const histogram = histograms.find((item) => item.metric === metric);
          const prior = before.find((item) => item.metric === metric);
          const samples = histogram
            ? histogram.good + histogram.needsImprovement + histogram.poor
            : 0;
          const share = (count: number) =>
            samples === 0 ? 0 : Math.round((count / samples) * 1000) / 1000;
          return {
            metric,
            p75: histogram ? p75(metric, histogram.buckets) : null,
            previousP75: prior ? p75(metric, prior.buckets) : null,
            samples,
            good: share(histogram?.good ?? 0),
            needsImprovement: share(histogram?.needsImprovement ?? 0),
            poor: share(histogram?.poor ?? 0),
          };
        }),
      };
    },
  );

  app.get(
    '/api/projects/:slug/vitals/:metric',
    {
      schema: {
        params: slugParams.extend({ metric: z.enum(METRICS) }).strict(),
        querystring: z.object({ range, device }).strict(),
      },
    },
    async (request) => {
      const project = await projectFor(request, request.params.slug);
      const { metric } = request.params;
      const step = stepOf(request.query.range);
      const points = await deps.vitals.series(
        project.id,
        metric,
        windows(request.query.range, now()).current,
        step,
        request.query.device,
      );
      return {
        metric,
        step,
        points: points.map((point) => ({
          time: point.time.toISOString(),
          p75: p75(metric, point.buckets),
          samples: point.buckets.reduce((sum, entry) => sum + entry.samples, 0),
        })),
      };
    },
  );

  app.get(
    '/api/projects/:slug/pages',
    {
      schema: {
        params: slugParams,
        querystring: z
          .object({ range, limit: z.coerce.number().int().min(1).max(100).default(20) })
          .strict(),
      },
    },
    async (request) => {
      const project = await projectFor(request, request.params.slug);
      const pages = await deps.vitals.pages(
        project.id,
        windows(request.query.range, now()).current,
        request.query.limit,
      );
      return {
        items: pages.map((page) => ({
          page: page.page,
          views: page.views,
          p75: Object.fromEntries(
            METRICS.flatMap((metric) => {
              const buckets = page.metrics[metric];
              return buckets ? [[metric, p75(metric, buckets)]] : [];
            }),
          ),
        })),
      };
    },
  );

  app.get(
    '/api/projects/:slug/errors',
    { schema: { params: slugParams, querystring: z.object({ range }).strict() } },
    async (request) => {
      const project = await projectFor(request, request.params.slug);
      return {
        items: await deps.errors.list(project.id, sinceDay(request.query.range, now()), 50),
      };
    },
  );

  app.get(
    '/api/projects/:slug/errors/:fingerprint',
    {
      schema: {
        params: slugParams.extend({ fingerprint: z.string().regex(/^[0-9a-f]{40}$/) }).strict(),
      },
    },
    async (request) => {
      const project = await projectFor(request, request.params.slug);
      const detail = await deps.errors.detail(
        project.id,
        request.params.fingerprint,
        sinceDay('30d', now()),
      );
      if (!detail) throw new Problem(404, 'Not Found');
      return detail;
    },
  );

  app.get('/health/live', () => ({ status: 'up' }));
  app.get('/health/ready', async (_request, reply) => {
    const entries = await Promise.all(
      Object.entries(deps.health).map(async ([name, check]) => {
        try {
          await check();
          return [name, 'up'] as const;
        } catch {
          return [name, 'down'] as const;
        }
      }),
    );
    const up = entries.every(([, status]) => status === 'up');
    return reply
      .code(up ? 200 : 503)
      .send({ status: up ? 'up' : 'down', dependencies: Object.fromEntries(entries) });
  });

  return app;
}
