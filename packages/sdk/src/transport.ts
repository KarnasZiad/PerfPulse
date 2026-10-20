import { type Batch, type CollectedEvent, LIMITS, PROTOCOL_VERSION } from '@perfpulse/protocol';

/** keepalive requests and beacons are capped around 64 KB by browsers. */
const MAX_BODY = 60_000;

export interface Header {
  key: string;
  session: string;
  path: string;
  release?: string;
}

function body(header: Header, events: CollectedEvent[]): string {
  const batch: Batch = {
    v: PROTOCOL_VERSION,
    k: header.key,
    s: header.session,
    p: header.path,
    ...(header.release ? { r: header.release } : {}),
    ev: events,
  };
  const json = JSON.stringify(batch);
  if (json.length <= MAX_BODY) return json;
  // Too big for a beacon: stacks are the first thing to go.
  return JSON.stringify({
    ...batch,
    ev: events.map((event) => (event.t === 'error' ? { ...event, st: undefined } : event)),
  });
}

function post(endpoint: string, payload: string): void {
  try {
    // text/plain keeps it a "simple" request: no CORS preflight.
    if (navigator.sendBeacon(endpoint, new Blob([payload], { type: 'text/plain' }))) return;
  } catch {
    // Fall through to fetch.
  }
  try {
    void fetch(endpoint, {
      method: 'POST',
      body: payload,
      keepalive: true,
      credentials: 'omit',
    }).catch(() => undefined);
  } catch {
    // Never retried: a lost measure is better than a slower page.
  }
}

/** Sends the events in batches of at most 50, as the protocol requires. */
export function send(endpoint: string, header: Header, events: CollectedEvent[]): void {
  for (let index = 0; index < events.length; index += LIMITS.events) {
    post(endpoint, body(header, events.slice(index, index + LIMITS.events)));
  }
}
