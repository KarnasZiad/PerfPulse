import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { blog, installFakeApi, READ_TOKEN, shop } from '../../test/fake-api';
import { useSessionStore } from './session';

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('session store', () => {
  it('is authenticated when the cookie gives access to projects', async () => {
    installFakeApi(() => ({ body: { items: [shop, blog] } }));
    const session = useSessionStore();
    await session.load();

    expect(session.status).toBe('authenticated');
    expect(session.find('blog')).toEqual(blog);
    expect(session.find('other')).toBeUndefined();
  });

  it('is anonymous without a session or without projects', async () => {
    installFakeApi(() => ({ status: 401, body: { title: 'Unauthorized' } }));
    const session = useSessionStore();
    await session.load();
    expect(session.status).toBe('anonymous');

    installFakeApi(() => ({ body: { items: [] } }));
    await session.load();
    expect(session.status).toBe('anonymous');
  });

  it('lets other failures through', async () => {
    installFakeApi(() => ({ status: 500, body: { title: 'Internal Server Error' } }));
    await expect(useSessionStore().load()).rejects.toMatchObject({ status: 500 });
  });

  it('exchanges a token for the session, then lists the projects', async () => {
    const { calls } = installFakeApi((method, path) => {
      if (method === 'POST' && path === '/api/session') return { body: { project: blog } };
      if (path === '/api/projects') return { body: { items: [blog, shop] } };
      return undefined;
    });
    const session = useSessionStore();

    await expect(session.signIn(READ_TOKEN)).resolves.toEqual(blog);
    expect(calls[0]).toEqual({ method: 'POST', path: '/api/session', body: { token: READ_TOKEN } });
    expect(session.projects).toEqual([blog, shop]);
    expect(session.authenticated).toBe(true);
  });

  it('forgets the projects on sign-out, even when the call fails', async () => {
    installFakeApi(() => ({ status: 403, body: { title: 'Cross-origin request' } }));
    const session = useSessionStore();
    session.$patch({ status: 'authenticated', projects: [shop] });

    await expect(session.signOut()).rejects.toMatchObject({ status: 403 });
    expect(session.status).toBe('anonymous');
    expect(session.projects).toEqual([]);
  });
});
