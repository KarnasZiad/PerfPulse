import { vi } from 'vitest';
import { setFetcher } from '../src/lib/api';
import type { ErrorDetail, ErrorGroup, Overview, PageRow, Project, Series } from '../src/lib/types';

export interface Reply {
  status?: number;
  body?: unknown;
}

type Handler = (method: string, path: string, body: unknown) => Reply | undefined;

/** Installs a fake transport: the handler answers each call, unknown routes get a 404. */
export function installFakeApi(handler: Handler) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = input instanceof Request ? input.url : String(input);
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body });
    const reply = handler(method, path, body) ?? { status: 404, body: { title: 'Not Found' } };
    const status = reply.status ?? 200;
    return Promise.resolve(
      status === 204
        ? new Response(null, { status })
        : new Response(JSON.stringify(reply.body ?? {}), {
            status,
            headers: { 'content-type': 'application/json' },
          }),
    );
  });
  setFetcher(fetcher);
  return { calls, fetcher };
}

export const shop: Project = {
  id: '7d3c3f2e-4a43-4c58-9d5b-0f0c4c3f1a10',
  slug: 'shop',
  name: 'Boutique',
};
export const blog: Project = {
  id: '0b5e9f0a-8f6e-4f60-9c39-5e8b5d0e2b21',
  slug: 'blog',
  name: 'Blog',
};

export const READ_TOKEN = `pp_read_${'a'.repeat(40)}`;

export const overview: Overview = {
  range: '7d',
  metrics: [
    {
      metric: 'LCP',
      p75: 2100,
      previousP75: 2400,
      samples: 120,
      good: 0.8,
      needsImprovement: 0.15,
      poor: 0.05,
    },
    {
      metric: 'INP',
      p75: 320,
      previousP75: 250,
      samples: 80,
      good: 0.6,
      needsImprovement: 0.3,
      poor: 0.1,
    },
    {
      metric: 'CLS',
      p75: 0.05,
      previousP75: 0.05,
      samples: 110,
      good: 1,
      needsImprovement: 0,
      poor: 0,
    },
    {
      metric: 'FCP',
      p75: 1200,
      previousP75: null,
      samples: 120,
      good: 0.9,
      needsImprovement: 0.1,
      poor: 0,
    },
    {
      metric: 'TTFB',
      p75: null,
      previousP75: null,
      samples: 0,
      good: 0,
      needsImprovement: 0,
      poor: 0,
    },
  ],
};

export function seriesOf(metric: Series['metric']): Series {
  return {
    metric,
    step: 'day',
    points: [
      { time: '2026-10-18T00:00:00.000Z', p75: metric === 'CLS' ? 0.04 : 1900, samples: 40 },
      { time: '2026-10-19T00:00:00.000Z', p75: null, samples: 0 },
      { time: '2026-10-20T00:00:00.000Z', p75: metric === 'CLS' ? 0.3 : 4600, samples: 30 },
    ],
  };
}

export const pages: PageRow[] = [
  { page: '/products/:id', views: 340, p75: { LCP: 2600, INP: 180, CLS: 0.02 } },
  { page: '/', views: 120, p75: { LCP: 1800 } },
];

export const FINGERPRINT = 'f'.repeat(40);

export const errorGroup: ErrorGroup = {
  fingerprint: FINGERPRINT,
  type: 'TypeError',
  message: "Cannot read properties of undefined (reading 'price')",
  count: 12,
  total: 40,
  firstSeen: '2026-10-01T08:00:00.000Z',
  lastSeen: '2026-10-20T09:30:00.000Z',
  browsers: { Firefox: 3, Chrome: 9 },
};

export const errorDetail: ErrorDetail = {
  ...errorGroup,
  daily: [
    { day: '2026-10-19', count: 1 },
    { day: '2026-10-20', count: 11 },
  ],
  samples: [
    {
      at: '2026-10-20T09:30:00.000Z',
      message: errorGroup.message,
      stack: 'TypeError: <img src=x onerror=alert(1)>\n    at cart.js:10:5',
      page: '/cart',
      browser: 'Chrome',
      os: 'Android',
      device: 'mobile',
      release: '1.4.0',
    },
    {
      at: '2026-10-19T12:00:00.000Z',
      message: errorGroup.message,
      stack: null,
      page: '/',
      browser: 'Firefox',
      os: 'Windows',
      device: 'desktop',
      release: null,
    },
  ],
};

/** The dashboard API of a session holding the shop project. */
export function dashboardApi(overrides: Handler = () => undefined): Handler {
  return (method, path, body) => {
    const custom = overrides(method, path, body);
    if (custom) return custom;
    const url = new URL(path, 'http://localhost');
    if (url.pathname === '/api/projects') return { body: { items: [shop] } };
    if (url.pathname === '/api/projects/shop/overview') {
      return { body: { ...overview, range: url.searchParams.get('range') } };
    }
    const vitals = /^\/api\/projects\/shop\/vitals\/(\w+)$/.exec(url.pathname);
    if (vitals?.[1]) return { body: seriesOf(vitals[1] as Series['metric']) };
    if (url.pathname === '/api/projects/shop/pages') return { body: { items: pages } };
    if (url.pathname === '/api/projects/shop/errors') return { body: { items: [errorGroup] } };
    if (url.pathname === `/api/projects/shop/errors/${FINGERPRINT}`) return { body: errorDetail };
    return undefined;
  };
}
