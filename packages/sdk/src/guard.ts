/**
 * Runs SDK code without ever letting an exception reach the host page: a monitoring script that
 * breaks the page it monitors is worse than no monitoring at all.
 */
export function guard(run: () => void): void {
  try {
    run();
  } catch {
    // Swallowed on purpose: nothing the SDK does is worth an error in the host page.
  }
}

export function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

/** Fewer digits, fewer bytes: milliseconds to a tenth, CLS to the ten-thousandth. */
export function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
