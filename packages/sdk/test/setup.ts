import { beforeEach, vi } from 'vitest';

type Callback = (list: { getEntries: () => PerformanceEntry[] }) => void;

/** A PerformanceObserver driven by the tests: `emit` delivers entries to the observers of a type. */
export class FakeObserver {
  static supportedEntryTypes = [
    'navigation',
    'paint',
    'largest-contentful-paint',
    'layout-shift',
    'event',
  ];
  static instances: FakeObserver[] = [];
  type = '';
  options: Record<string, unknown> = {};
  disconnected = false;

  constructor(private readonly callback: Callback) {
    FakeObserver.instances.push(this);
  }

  observe(options: { type: string } & Record<string, unknown>): void {
    this.type = options.type;
    this.options = options;
  }

  disconnect(): void {
    this.disconnected = true;
  }

  deliver(entries: PerformanceEntry[]): void {
    this.callback({ getEntries: () => entries });
  }
}

export function emit(
  type: string,
  entries: Partial<PerformanceEntry & Record<string, unknown>>[],
): void {
  for (const observer of FakeObserver.instances) {
    if (observer.type === type && !observer.disconnected)
      observer.deliver(entries as PerformanceEntry[]);
  }
}

export function navigation(entry: Record<string, unknown> = {}): void {
  vi.spyOn(performance, 'getEntriesByType').mockImplementation((type: string) =>
    type === 'navigation'
      ? ([
          { type: 'navigate', responseStart: 120, activationStart: 0, ...entry },
        ] as unknown as PerformanceEntryList)
      : [],
  );
}

export function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('visibilitychange'));
}

export const beacon = vi.fn<(url: string, data: Blob) => boolean>(() => true);

/** Bodies of every beacon sent so far, parsed. */
export async function sentBatches(): Promise<Record<string, unknown>[]> {
  return Promise.all(
    beacon.mock.calls.map(
      async ([, data]) => JSON.parse(await data.text()) as Record<string, unknown>,
    ),
  );
}

beforeEach(() => {
  FakeObserver.instances = [];
  beacon.mockReset();
  beacon.mockReturnValue(true);
  vi.stubGlobal('PerformanceObserver', FakeObserver);
  Object.defineProperty(navigator, 'sendBeacon', {
    value: beacon,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  sessionStorage.clear();
  navigation();
});
