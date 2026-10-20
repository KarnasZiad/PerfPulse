import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFakeApi } from '../../test/fake-api';
import { api, ApiError, describeError, setUnauthorizedHandler } from './api';

afterEach(() => {
  setUnauthorizedHandler(() => undefined);
});

describe('api', () => {
  it('sends same-origin JSON requests', async () => {
    const { fetcher } = installFakeApi(() => ({ body: { ok: true } }));
    await expect(api('/api/projects')).resolves.toEqual({ ok: true });
    await api('/api/session', { method: 'POST', body: { token: 't' } });

    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/projects', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    });
    expect(fetcher).toHaveBeenNthCalledWith(2, '/api/session', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: '{"token":"t"}',
    });
  });

  it('resolves no content to undefined', async () => {
    installFakeApi(() => ({ status: 204 }));
    await expect(api('/api/session', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('throws the title of a problem document', async () => {
    installFakeApi(() => ({ status: 403, body: { title: 'Cross-origin request' } }));
    await expect(api('/api/session', { method: 'DELETE' })).rejects.toEqual(
      new ApiError(403, 'Cross-origin request'),
    );
  });

  it('keeps the status text when the body is not JSON', async () => {
    const { fetcher } = installFakeApi(() => undefined);
    fetcher.mockResolvedValueOnce(new Response('oops', { status: 502, statusText: 'Bad Gateway' }));
    await expect(api('/api/projects')).rejects.toMatchObject({
      status: 502,
      message: 'Bad Gateway',
    });
  });

  it('reports an expired session, but not a refused token', async () => {
    const expired = vi.fn();
    setUnauthorizedHandler(expired);
    installFakeApi(() => ({ status: 401, body: { title: 'Unauthorized' } }));

    await expect(api('/api/session', { method: 'POST', body: {} })).rejects.toThrow(ApiError);
    expect(expired).not.toHaveBeenCalled();
    await expect(api('/api/projects/shop/overview')).rejects.toThrow(ApiError);
    expect(expired).toHaveBeenCalledOnce();
  });
});

describe('describeError', () => {
  it('prefers the wording given for a status', () => {
    expect(describeError(new ApiError(401, 'Unauthorized'), { 401: 'Jeton refusé.' })).toBe(
      'Jeton refusé.',
    );
  });

  it('explains rate limits, outages and network failures', () => {
    expect(describeError(new ApiError(429, 'Too Many Requests'))).toMatch(/une minute/);
    expect(describeError(new ApiError(503, 'Service Unavailable'))).toMatch(/indisponible/);
    expect(describeError(new TypeError('Failed to fetch'))).toMatch(/connexion/);
    expect(describeError(new ApiError(404, 'Not Found'))).toBe('Not Found');
  });
});
