import type { Metric, NavigationType } from '@perfpulse/protocol';
import { guard } from './guard';

interface LayoutShift extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
}

interface EventTiming extends PerformanceEntry {
  interactionId?: number;
}

type Navigation = PerformanceNavigationTiming & { activationStart?: number };

function navigationEntry(): Navigation | undefined {
  return performance.getEntriesByType('navigation')[0] as Navigation | undefined;
}

/** Time spent prerendering does not count: Google measures from the activation. */
function activationStart(): number {
  return navigationEntry()?.activationStart ?? 0;
}

export function navigationType(): NavigationType {
  if (activationStart() > 0) return 'prerender';
  const type = navigationEntry()?.type;
  return type === 'reload' ? 'reload' : type === 'back_forward' ? 'back-forward' : 'navigate';
}

function observe(type: string, onEntries: (entries: PerformanceEntry[]) => void, extra?: object) {
  try {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) return undefined;
    const observer = new PerformanceObserver((list) => {
      guard(() => {
        onEntries(list.getEntries());
      });
    });
    observer.observe({ type, buffered: true, ...extra });
    return observer;
  } catch {
    return undefined;
  }
}

/**
 * Web Vitals of one page view, with the definitions of Google: final values are only known when
 * the page is hidden, so they are reported once, by `finalize`.
 */
export class Vitals {
  private values = new Map<Metric, number>();
  private reported = new Set<Metric>();
  private observers: PerformanceObserver[] = [];
  private clsSupported = false;
  private restored = false;
  private cls = 0;
  private window = 0;
  private windowStart = 0;
  private lastShift = 0;
  private interactions = new Map<number, number>();

  constructor(private readonly report: (metric: Metric, value: number) => void) {}

  /** `restored`: the page came back from the bfcache; only CLS and INP are measured again. */
  start(restored = false): void {
    this.stop();
    this.restored = restored;
    this.values.clear();
    this.reported.clear();
    this.cls = this.window = this.windowStart = this.lastShift = 0;
    this.interactions.clear();
    const offset = activationStart();
    const keep = (observer: PerformanceObserver | undefined) => {
      if (observer) this.observers.push(observer);
      return observer;
    };

    if (!restored) {
      keep(
        observe('paint', (entries) => {
          for (const entry of entries) {
            if (entry.name === 'first-contentful-paint') {
              this.values.set('FCP', Math.max(entry.startTime - offset, 0));
            }
          }
        }),
      );
      const lcp = keep(
        observe('largest-contentful-paint', (entries) => {
          const last = entries.at(-1);
          if (last) this.values.set('LCP', Math.max(last.startTime - offset, 0));
        }),
      );
      // The LCP candidate stops changing at the first interaction.
      const stopLcp = () => {
        lcp?.disconnect();
      };
      addEventListener('keydown', stopLcp, { once: true, capture: true });
      addEventListener('pointerdown', stopLcp, { once: true, capture: true });
    }

    this.clsSupported = Boolean(
      keep(
        observe('layout-shift', (entries) => {
          for (const shift of entries as LayoutShift[]) {
            if (shift.hadRecentInput) continue;
            // Session windows: a new one after 1 s without shift, or once it lasts 5 s.
            if (
              this.window === 0 ||
              shift.startTime - this.lastShift > 1000 ||
              shift.startTime - this.windowStart > 5000
            ) {
              this.window = 0;
              this.windowStart = shift.startTime;
            }
            this.window += shift.value;
            this.lastShift = shift.startTime;
            this.cls = Math.max(this.cls, this.window);
          }
        }),
      ),
    );

    keep(
      observe(
        'event',
        (entries) => {
          for (const entry of entries as EventTiming[]) {
            const id = entry.interactionId;
            if (!id || this.interactions.size > 500) continue;
            this.interactions.set(id, Math.max(this.interactions.get(id) ?? 0, entry.duration));
          }
        },
        { durationThreshold: 40 },
      ),
    );
  }

  /** INP: the worst interaction, ignoring one per 50 interactions (an approximation of the p98). */
  private inp(): number | undefined {
    if (this.interactions.size === 0) return undefined;
    const durations = [...this.interactions.values()].sort((a, b) => b - a);
    return durations[Math.min(Math.floor(this.interactions.size / 50), durations.length - 1)];
  }

  private ttfb(): number | undefined {
    const navigation = navigationEntry();
    if (!navigation || navigation.responseStart <= 0) return undefined;
    return Math.max(navigation.responseStart - activationStart(), 0);
  }

  finalize(): void {
    if (this.clsSupported) this.values.set('CLS', this.cls);
    const inp = this.inp();
    if (inp !== undefined) this.values.set('INP', inp);
    // A page restored from the bfcache made no request: it has no TTFB.
    const ttfb = this.restored ? undefined : this.ttfb();
    if (ttfb !== undefined) this.values.set('TTFB', ttfb);
    for (const [metric, value] of this.values) {
      if (this.reported.has(metric)) continue;
      this.reported.add(metric);
      this.report(metric, value);
    }
  }

  stop(): void {
    for (const observer of this.observers) observer.disconnect();
    this.observers = [];
  }
}
