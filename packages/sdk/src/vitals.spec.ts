import { describe, expect, it, vi } from 'vitest';
import { emit, FakeObserver, navigation } from '../test/setup';
import { navigationType, Vitals } from './vitals';

function collect(restored = false) {
  const reported: Record<string, number> = {};
  const vitals = new Vitals((metric, value) => {
    reported[metric] = value;
  });
  vitals.start(restored);
  return { vitals, reported };
}

describe('LCP and FCP', () => {
  it('keep the last LCP candidate and the first contentful paint', () => {
    const { vitals, reported } = collect();
    emit('paint', [
      { name: 'first-paint', startTime: 300 },
      { name: 'first-contentful-paint', startTime: 420 },
    ]);
    emit('largest-contentful-paint', [{ startTime: 900 }, { startTime: 1800 }]);
    vitals.finalize();
    expect(reported).toMatchObject({ FCP: 420, LCP: 1800 });
  });

  it('stop the LCP at the first interaction', () => {
    const { vitals, reported } = collect();
    emit('largest-contentful-paint', [{ startTime: 1200 }]);
    window.dispatchEvent(new Event('pointerdown'));
    emit('largest-contentful-paint', [{ startTime: 5000 }]);
    vitals.finalize();
    expect(reported.LCP).toBe(1200);
  });

  it('measure prerendered pages from their activation', () => {
    navigation({ activationStart: 1000, responseStart: 400 });
    const { vitals, reported } = collect();
    emit('paint', [{ name: 'first-contentful-paint', startTime: 1300 }]);
    emit('largest-contentful-paint', [{ startTime: 800 }]);
    vitals.finalize();
    expect(reported).toMatchObject({ FCP: 300, LCP: 0, TTFB: 0 });
    expect(navigationType()).toBe('prerender');
  });
});

describe('CLS', () => {
  it('takes the largest session window, ignoring shifts after an input', () => {
    const { vitals, reported } = collect();
    emit('layout-shift', [
      { startTime: 1000, value: 0.05, hadRecentInput: false },
      { startTime: 1500, value: 0.05, hadRecentInput: false },
      { startTime: 1700, value: 0.3, hadRecentInput: true },
      // More than 1 s later: a new window.
      { startTime: 4000, value: 0.02, hadRecentInput: false },
    ]);
    vitals.finalize();
    expect(reported.CLS).toBeCloseTo(0.1);
  });

  it('closes a window after 5 seconds even without a pause', () => {
    const { vitals, reported } = collect();
    emit(
      'layout-shift',
      Array.from({ length: 12 }, (_, index) => ({
        startTime: 1000 + index * 900,
        value: 0.01,
        hadRecentInput: false,
      })),
    );
    vitals.finalize();
    // 900 ms apart: windows of 6 shifts (5 s), never one of 12.
    expect(reported.CLS).toBeCloseTo(0.06);
  });

  it('reports 0 when the page did not move, and nothing when unsupported', () => {
    const { vitals, reported } = collect();
    vitals.finalize();
    expect(reported.CLS).toBe(0);

    FakeObserver.supportedEntryTypes = ['navigation', 'paint'];
    try {
      const unsupported = collect();
      unsupported.vitals.finalize();
      expect(unsupported.reported).not.toHaveProperty('CLS');
    } finally {
      FakeObserver.supportedEntryTypes = [
        'navigation',
        'paint',
        'largest-contentful-paint',
        'layout-shift',
        'event',
      ];
    }
  });
});

describe('INP', () => {
  it('is the worst interaction, entries of one interaction merged', () => {
    const { vitals, reported } = collect();
    emit('event', [
      { interactionId: 1, duration: 80 },
      { interactionId: 1, duration: 120 },
      { interactionId: 2, duration: 64 },
      { interactionId: 0, duration: 900 },
    ]);
    vitals.finalize();
    expect(reported.INP).toBe(120);
  });

  it('ignores one interaction per 50, like the p98 of Google', () => {
    const { vitals, reported } = collect();
    emit(
      'event',
      Array.from({ length: 120 }, (_, index) => ({
        interactionId: index + 1,
        duration: index + 1,
      })),
    );
    vitals.finalize();
    // 120 interactions: the 2 worst are ignored.
    expect(reported.INP).toBe(118);
    const observer = FakeObserver.instances.find((instance) => instance.type === 'event');
    expect(observer?.options).toMatchObject({ buffered: true, durationThreshold: 40 });
  });

  it('is not reported without any interaction', () => {
    const { vitals, reported } = collect();
    vitals.finalize();
    expect(reported).not.toHaveProperty('INP');
  });
});

describe('Vitals', () => {
  it('reports TTFB from the navigation entry, and each metric once', () => {
    const report = vi.fn();
    const vitals = new Vitals(report);
    vitals.start();
    emit('largest-contentful-paint', [{ startTime: 900 }]);
    vitals.finalize();
    vitals.finalize();
    expect(report).toHaveBeenCalledWith('TTFB', 120);
    expect(report.mock.calls.filter(([metric]) => metric === 'LCP')).toHaveLength(1);
  });

  it('measures only CLS and INP for a page restored from the bfcache', () => {
    const { vitals, reported } = collect(true);
    emit('largest-contentful-paint', [{ startTime: 900 }]);
    emit('layout-shift', [{ startTime: 100, value: 0.02, hadRecentInput: false }]);
    vitals.finalize();
    expect(Object.keys(reported).sort()).toEqual(['CLS']);
  });

  it('starts afresh and disconnects its observers', () => {
    const { vitals } = collect();
    vitals.start(true);
    expect(
      FakeObserver.instances.filter((observer) => observer.disconnected).length,
    ).toBeGreaterThan(0);
    vitals.stop();
    expect(FakeObserver.instances.every((observer) => observer.disconnected)).toBe(true);
  });

  it('survives a browser without PerformanceObserver support for a type, or a throwing observer', () => {
    vi.stubGlobal(
      'PerformanceObserver',
      class {
        static supportedEntryTypes = ['paint'];
        observe() {
          throw new Error('not allowed');
        }
      },
    );
    const { vitals, reported } = collect();
    expect(() => {
      vitals.finalize();
    }).not.toThrow();
    expect(reported).toEqual({ TTFB: 120 });
  });

  it('maps navigation types', () => {
    navigation({ type: 'reload' });
    expect(navigationType()).toBe('reload');
    navigation({ type: 'back_forward' });
    expect(navigationType()).toBe('back-forward');
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
    expect(navigationType()).toBe('navigate');
  });
});
