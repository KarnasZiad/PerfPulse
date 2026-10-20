import { type ErrorEvent as CollectedError, type ErrorSource, LIMITS } from '@perfpulse/protocol';
import { guard, truncate } from './guard';

const MAX_PER_VIEW = 10;

function describe(reason: unknown): { message: string; stack?: string } {
  if (reason instanceof Error)
    return { message: reason.message || reason.name, stack: reason.stack };
  try {
    if (typeof reason === 'string') return { message: reason };
    // JSON.stringify(undefined) returns undefined, whatever its declared type says.
    const json = JSON.stringify(reason) as string | undefined;
    return { message: json ?? String(reason) };
  } catch {
    return { message: String(reason) };
  }
}

/** Uncaught errors and unhandled rejections: at most 10 per view, each distinct one only once. */
export function watchErrors(push: (error: CollectedError) => void): () => void {
  const seen = new Set<string>();

  const record = (message: string, stack: string | undefined, src: ErrorSource) => {
    const key = `${message}\n${stack?.split('\n')[1] ?? ''}`;
    if (seen.size >= MAX_PER_VIEW || seen.has(key)) return;
    seen.add(key);
    push({
      t: 'error',
      m: truncate(message || 'Unknown error', LIMITS.message),
      ...(stack ? { st: truncate(stack, LIMITS.stack) } : {}),
      src,
    });
  };

  const onError = (event: Event) => {
    guard(() => {
      // Failed resources (img, script) dispatch a plain Event, not an ErrorEvent.
      if (!(event instanceof ErrorEvent)) return;
      const { message, stack } = describe(event.error ?? event.message);
      record(event.message || message, stack, 'error');
    });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    guard(() => {
      const { message, stack } = describe(event.reason);
      record(message, stack, 'rejection');
    });
  };

  addEventListener('error', onError);
  addEventListener('unhandledrejection', onRejection);
  return () => {
    removeEventListener('error', onError);
    removeEventListener('unhandledrejection', onRejection);
  };
}
