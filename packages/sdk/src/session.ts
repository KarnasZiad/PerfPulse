const KEY = 'pp_s';

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  // base64url without padding: 22 characters for 16 bytes.
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface Session {
  id: string;
  sampled: boolean;
}

/**
 * One session per tab, in sessionStorage: no cookie, nothing that follows a visitor from one visit
 * to the next. The sampling decision is part of the session, so a session is kept or dropped whole.
 */
export function currentSession(sampleRate: number): Session {
  try {
    const stored = sessionStorage.getItem(KEY);
    const match = stored ? /^([\w-]{22}):([01])$/.exec(stored) : null;
    if (match?.[1]) return { id: match[1], sampled: match[2] === '1' };
  } catch {
    // Storage blocked (privacy mode, sandboxed frame): a session per page view instead.
  }
  const session = { id: randomId(), sampled: Math.random() < sampleRate };
  try {
    sessionStorage.setItem(KEY, `${session.id}:${session.sampled ? '1' : '0'}`);
  } catch {
    // Same as above.
  }
  return session;
}
