import { createHash } from 'node:crypto';

const MAX_FRAMES = 3;

/**
 * The stable part of an error message: what varies between two occurrences of the same bug (an
 * identifier, a number, a URL, a long quoted payload) is replaced by a placeholder. Short quoted
 * words stay: in "reading 'id'", the property name is the bug.
 */
export function normalizeMessage(message: string): string {
  return message
    .replace(/https?:\/\/[^\s'"`)]+/g, '<url>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/(["'`])[^"'`\n]{17,200}\1/g, '<str>')
    .replace(/\b0x[0-9a-f]+\b|\b[0-9a-f]{12,}\b/gi, '<hex>')
    .replace(/\d+(?:\.\d+)?/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim();
}

// "    at handler (https://cdn.example.ma/app.js?v=3:1:2345)" (V8) or "handler@https://…:1:2345".
const FRAME = /^\s*(?:at\s+)?(.*?)(?:\s*\(|@)?((?:https?|file):\/\/[^\s)]+?)(?::\d+){1,2}\)?\s*$/;

/** Top frames without positions nor query strings: a new build moves lines, not the bug. */
export function normalizeStack(stack: string | undefined): string[] {
  if (!stack) return [];
  const frames: string[] = [];
  for (const line of stack.split('\n').slice(0, 30)) {
    const match = FRAME.exec(line.slice(0, 500));
    if (!match) continue;
    const fn = (match[1] ?? '').replace(/^async\s+/, '').trim() || '<anonymous>';
    const file = (match[2] ?? '').replace(/[?#].*$/, '').replace(/^https?:\/\/[^/]+/, '');
    frames.push(`${fn} ${file}`);
    if (frames.length === MAX_FRAMES) break;
  }
  return frames;
}

export function fingerprint(
  project: string,
  type: string,
  message: string,
  stack: string | undefined,
): string {
  return createHash('sha1')
    .update([project, type, normalizeMessage(message), ...normalizeStack(stack)].join('\n'))
    .digest('hex');
}
