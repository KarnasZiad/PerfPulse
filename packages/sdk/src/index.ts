import { type CollectedEvent, LIMITS } from '@perfpulse/protocol';
import { watchErrors } from './errors';
import { guard, round, truncate } from './guard';
import { currentSession } from './session';
import { send } from './transport';
import { navigationType, Vitals } from './vitals';

export interface PerfPulseOptions {
  /** Public key of the project (pk_…), shown in the PerfPulse console. */
  key: string;
  /** Collection endpoint, for instance https://rum.example.ma/v1/collect. */
  endpoint: string;
  /** Share of sessions measured, from 0 to 1 (default 1). */
  sampleRate?: number;
  /** Deployed release, to compare measures before and after a deployment. */
  release?: string;
}

let started = false;

/**
 * Starts measuring the current page view. Safe to call anywhere, any number of times: only the
 * first call counts, and nothing it does can throw into the page. Returns a function that stops
 * the measures and removes every listener.
 */
export function init(options: PerfPulseOptions): () => void {
  let stop = (): void => undefined;
  guard(() => {
    if (started || typeof PerformanceObserver === 'undefined') return;
    started = true;
    const session = currentSession(options.sampleRate ?? 1);
    if (!session.sampled) return;

    const header = {
      key: options.key,
      session: session.id,
      // The path only: query strings and fragments carry tokens and e-mails.
      path: truncate(location.pathname || '/', LIMITS.path),
      ...(options.release ? { release: options.release } : {}),
    };
    let events: CollectedEvent[] = [{ t: 'view', nt: navigationType() }];
    const vitals = new Vitals((metric, value) => {
      events.push({ t: 'vital', n: metric, v: round(value, metric === 'CLS' ? 4 : 1) });
    });
    vitals.start();
    const stopErrors = watchErrors((error) => {
      events.push(error);
    });

    const flush = () => {
      guard(() => {
        vitals.finalize();
        if (events.length === 0) return;
        const pending = events;
        events = [];
        send(options.endpoint, header, pending);
      });
    };

    const listeners = new AbortController();
    const on = (type: string, listener: (event: Event) => void) => {
      addEventListener(type, listener, { capture: true, signal: listeners.signal });
    };
    // Hidden is the last moment a page reliably runs code, on mobile above all.
    on('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    on('pagehide', flush);
    on('pageshow', (event) => {
      guard(() => {
        if (!(event as PageTransitionEvent).persisted) return;
        // Back from the bfcache: a new view of the same page.
        events.push({ t: 'view', nt: 'restore' });
        vitals.start(true);
      });
    });

    stop = () => {
      listeners.abort();
      stopErrors();
      vitals.stop();
      started = false;
    };
  });
  return stop;
}
