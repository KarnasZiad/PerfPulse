export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type Fetcher = typeof fetch;

let fetcher: Fetcher = (...args) => fetch(...args);
let onUnauthorized: () => void = () => undefined;

/** Tests replace the transport; the application uses the browser's fetch. */
export function setFetcher(next: Fetcher): void {
  fetcher = next;
}

/** Called when the session expires during navigation: the application sends the user to sign in. */
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

/**
 * Same-origin JSON calls: the session lives in an HttpOnly cookie the browser sends by itself, and
 * the browser adds the Origin header the API checks on state-changing requests.
 */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const hasBody = init.body !== undefined;
  const response = await fetcher(path, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: hasBody
      ? { accept: 'application/json', 'content-type': 'application/json' }
      : { accept: 'application/json' },
    ...(hasBody ? { body: JSON.stringify(init.body) } : {}),
  });
  if (response.status === 204) return undefined as T;
  if (!response.ok) {
    let title = response.statusText;
    try {
      title = ((await response.json()) as { title?: string }).title ?? title;
    } catch {
      // Not a problem document: keep the status text.
    }
    // A refused token is a form error, not an expired session.
    if (response.status === 401 && path !== '/api/session') onUnauthorized();
    throw new ApiError(response.status, title);
  }
  return (await response.json()) as T;
}

/** A message for the person, with wording per status where the generic title would not help. */
export function describeError(
  error: unknown,
  messages: Partial<Record<number, string>> = {},
): string {
  if (error instanceof ApiError) {
    const specific = messages[error.status];
    if (specific) return specific;
    if (error.status === 429) return 'Trop de tentatives : réessayez dans une minute.';
    if (error.status >= 500) return 'Le service est indisponible pour le moment.';
    return error.message;
  }
  return 'Impossible de joindre le service. Vérifiez votre connexion.';
}
