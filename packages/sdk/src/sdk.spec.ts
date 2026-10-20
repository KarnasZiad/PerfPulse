import { afterEach, describe, expect, it, vi } from 'vitest';
import { beacon, emit, FakeObserver, sentBatches, setVisibility } from '../test/setup';
import { watchErrors } from './errors';
import { guard, round, truncate } from './guard';
import { currentSession } from './session';
import { send } from './transport';

const stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

/** A fresh module (the SDK starts once per page), stopped after the test. */
async function freshInit() {
  vi.resetModules();
  const { init } = await import('./index');
  return (options: Parameters<typeof init>[0]) => {
    const stop = init(options);
    stops.push(stop);
    return stop;
  };
}

const OPTIONS = { key: `pk_${'a'.repeat(32)}`, endpoint: 'https://rum.example.ma/v1/collect' };

describe('init', () => {
  it('sends one batch when the page is hidden: view, vitals and errors, path only', async () => {
    const init = await freshInit();
    init({ ...OPTIONS, release: '2026.10.3' });
    emit('paint', [{ name: 'first-contentful-paint', startTime: 412.345 }]);
    emit('layout-shift', [{ startTime: 500, value: 0.012345, hadRecentInput: false }]);
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom', error: new Error('boom') }));

    setVisibility('hidden');

    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0]?.[0]).toBe(OPTIONS.endpoint);
    expect(beacon.mock.calls[0]?.[1].type).toBe('text/plain');
    const [batch] = await sentBatches();
    expect(batch).toMatchObject({
      v: 1,
      k: OPTIONS.key,
      p: '/produits/42',
      r: '2026.10.3',
      ev: expect.arrayContaining([
        { t: 'view', nt: 'navigate' },
        { t: 'vital', n: 'FCP', v: 412.3 },
        { t: 'vital', n: 'CLS', v: 0.0123 },
        { t: 'vital', n: 'TTFB', v: 120 },
        expect.objectContaining({ t: 'error', m: 'boom', src: 'error' }),
      ]),
    });
    expect(JSON.stringify(batch)).not.toContain('token=secret');
    expect(batch?.s).toMatch(/^[\w-]{22}$/);
  });

  it('does not send the same measures twice, and sends new errors later', async () => {
    const init = await freshInit();
    init(OPTIONS);
    setVisibility('hidden');
    setVisibility('visible');
    setVisibility('hidden');
    expect(beacon).toHaveBeenCalledTimes(1);

    window.dispatchEvent(
      new PromiseRejectionEvent('unhandledrejection', {
        promise: Promise.resolve(),
        reason: new Error('late'),
      }),
    );
    window.dispatchEvent(new Event('pagehide'));
    expect(beacon).toHaveBeenCalledTimes(2);
    const batches = await sentBatches();
    expect(batches[1]?.ev).toEqual([expect.objectContaining({ m: 'late', src: 'rejection' })]);
  });

  it('measures a page restored from the bfcache as a new view', async () => {
    const init = await freshInit();
    init(OPTIONS);
    setVisibility('hidden');
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
    emit('layout-shift', [{ startTime: 10, value: 0.2, hadRecentInput: false }]);
    setVisibility('hidden');

    const batches = await sentBatches();
    expect(batches[1]?.ev).toEqual([
      { t: 'view', nt: 'restore' },
      { t: 'vital', n: 'CLS', v: 0.2 },
    ]);
  });

  it('starts only once, and not at all without PerformanceObserver or outside the sample', async () => {
    const init = await freshInit();
    init(OPTIONS);
    init(OPTIONS);
    setVisibility('hidden');
    expect(beacon).toHaveBeenCalledTimes(1);

    const unsupported = await freshInit();
    vi.stubGlobal('PerformanceObserver', undefined);
    unsupported(OPTIONS);
    setVisibility('hidden');
    expect(beacon).toHaveBeenCalledTimes(1);

    sessionStorage.clear();
    const sampled = await freshInit();
    vi.stubGlobal('PerformanceObserver', FakeObserver);
    sampled({ ...OPTIONS, sampleRate: 0 });
    setVisibility('hidden');
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it('stops measuring when asked, and can start again', async () => {
    const init = await freshInit();
    const stop = init(OPTIONS);
    stop();
    window.dispatchEvent(new ErrorEvent('error', { message: 'after stop' }));
    setVisibility('hidden');
    expect(beacon).not.toHaveBeenCalled();

    init(OPTIONS);
    setVisibility('hidden');
    expect(beacon).toHaveBeenCalledTimes(1);
  });
});

describe('transport', () => {
  const header = { key: OPTIONS.key, session: 'Hk3n0x1Wq8m2v4c7Zb5Ra9', path: '/' };

  it('splits large batches in chunks of 50 events', async () => {
    send(
      OPTIONS.endpoint,
      header,
      Array.from({ length: 120 }, () => ({ t: 'view' as const, nt: 'navigate' as const })),
    );
    const batches = await sentBatches();
    expect(batches.map((batch) => (batch.ev as unknown[]).length)).toEqual([50, 50, 20]);
  });

  it('drops stacks when the body would be too big for a beacon', async () => {
    const error = { t: 'error' as const, m: 'boom', st: 'x'.repeat(4000), src: 'error' as const };
    send(
      OPTIONS.endpoint,
      header,
      Array.from({ length: 20 }, () => error),
    );
    const [batch] = await sentBatches();
    expect(JSON.stringify(batch).length).toBeLessThan(60_000);
    expect((batch?.ev as Record<string, unknown>[])[0]).not.toHaveProperty('st');
  });

  it('falls back to fetch keepalive when the beacon is refused or missing, and never throws', () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetch);
    beacon.mockReturnValue(false);
    send(OPTIONS.endpoint, header, [{ t: 'view', nt: 'navigate' }]);
    expect(fetch).toHaveBeenCalledWith(
      OPTIONS.endpoint,
      expect.objectContaining({ method: 'POST', keepalive: true, credentials: 'omit' }),
    );

    beacon.mockImplementation(() => {
      throw new TypeError('blocked');
    });
    vi.stubGlobal('fetch', () => {
      throw new TypeError('offline');
    });
    expect(() => {
      send(OPTIONS.endpoint, header, [{ t: 'view', nt: 'navigate' }]);
    }).not.toThrow();
  });
});

describe('errors', () => {
  function watch() {
    const errors: Record<string, unknown>[] = [];
    const stop = watchErrors((error) => errors.push({ ...error }));
    return { errors, stop };
  }

  it('captures errors and rejections of any kind, without duplicates', () => {
    const { errors, stop } = watch();
    const error = new TypeError('x is undefined');
    window.dispatchEvent(
      new ErrorEvent('error', { message: 'Uncaught TypeError: x is undefined', error }),
    );
    window.dispatchEvent(
      new ErrorEvent('error', { message: 'Uncaught TypeError: x is undefined', error }),
    );
    window.dispatchEvent(new Event('error'));
    window.dispatchEvent(
      new PromiseRejectionEvent('unhandledrejection', {
        promise: Promise.resolve(),
        reason: { code: 42 },
      }),
    );
    window.dispatchEvent(
      new PromiseRejectionEvent('unhandledrejection', {
        promise: Promise.resolve(),
        reason: undefined,
      }),
    );
    window.dispatchEvent(
      new PromiseRejectionEvent('unhandledrejection', {
        promise: Promise.resolve(),
        reason: 'plain',
      }),
    );
    stop();
    window.dispatchEvent(new ErrorEvent('error', { message: 'after stop' }));

    expect(errors).toEqual([
      expect.objectContaining({
        m: 'Uncaught TypeError: x is undefined',
        src: 'error',
        st: expect.stringContaining('TypeError'),
      }),
      { t: 'error', m: '{"code":42}', src: 'rejection' },
      { t: 'error', m: 'undefined', src: 'rejection' },
      { t: 'error', m: 'plain', src: 'rejection' },
    ]);
  });

  it('keeps at most 10 errors per view and truncates them', () => {
    const { errors, stop } = watch();
    for (let index = 0; index < 15; index += 1) {
      window.dispatchEvent(
        new ErrorEvent('error', { message: `error ${index} ${'x'.repeat(600)}` }),
      );
    }
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    stop();
    expect(errors).toHaveLength(10);
    expect((errors[0]?.m as string).length).toBe(512);

    const second = watch();
    window.dispatchEvent(
      new PromiseRejectionEvent('unhandledrejection', {
        promise: Promise.resolve(),
        reason: circular,
      }),
    );
    window.dispatchEvent(new ErrorEvent('error', { message: '' }));
    second.stop();
    expect(second.errors).toEqual([
      { t: 'error', m: '[object Object]', src: 'rejection' },
      { t: 'error', m: 'Unknown error', src: 'error' },
    ]);
  });
});

describe('session', () => {
  it('keeps one id per tab with its sampling decision', () => {
    const first = currentSession(1);
    expect(first.sampled).toBe(true);
    expect(currentSession(0)).toEqual(first);
    sessionStorage.setItem('pp_s', 'garbage');
    expect(currentSession(0).sampled).toBe(false);
  });

  it('works when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(currentSession(1).id).toMatch(/^[\w-]{22}$/);
  });
});

describe('helpers', () => {
  it('swallow errors, truncate and round', () => {
    expect(() => {
      guard(() => {
        throw new Error('inside the SDK');
      });
    }).not.toThrow();
    expect(truncate('abcdef', 3)).toBe('abc');
    expect(truncate('ab', 3)).toBe('ab');
    expect(round(412.345, 1)).toBe(412.3);
    expect(round(0.012345, 4)).toBe(0.0123);
  });
});
