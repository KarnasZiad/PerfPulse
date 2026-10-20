import { flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { blog, installFakeApi, READ_TOKEN, shop } from '../../test/fake-api';
import { mountView } from '../../test/mount';
import LoginView from './LoginView.vue';

function signInApi(project = shop) {
  return installFakeApi((method, path) => {
    if (method === 'POST' && path === '/api/session') return { body: { project } };
    if (path === '/api/projects') return { body: { items: [project] } };
    return undefined;
  });
}

async function submit(wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'], token: string) {
  await wrapper.find('input').setValue(token);
  await wrapper.find('form').trigger('submit');
  await flushPromises();
}

describe('LoginView', () => {
  it('checks the token format before calling the API', async () => {
    const { calls } = signInApi();
    const { wrapper } = await mountView(LoginView, { projects: null, route: '/login' });

    await submit(wrapper, 'pp_ingest_123');
    expect(wrapper.get('[role="alert"]').text()).toContain('pp_read_');
    expect(calls).toHaveLength(0);
  });

  it('opens the dashboard of the project of the token', async () => {
    signInApi(blog);
    const { wrapper, router } = await mountView(LoginView, { projects: null, route: '/login' });

    await submit(wrapper, `  ${READ_TOKEN}  `);
    // The project view is a lazy route: its chunk loads after the click.
    await vi.waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/p/blog');
    });
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('');
  });

  it('goes back to the page asked for before sign-in', async () => {
    signInApi();
    const { wrapper, router } = await mountView(LoginView, {
      projects: null,
      route: '/login?next=/p/shop%3Frange%3D30d',
    });

    await submit(wrapper, READ_TOKEN);
    await vi.waitFor(() => {
      expect(router.currentRoute.value.fullPath).toBe('/p/shop?range=30d');
    });
  });

  it('says when the token is refused', async () => {
    installFakeApi(() => ({ status: 401, body: { title: 'Invalid or revoked token' } }));
    const { wrapper, router } = await mountView(LoginView, { projects: null, route: '/login' });

    await submit(wrapper, READ_TOKEN);
    expect(wrapper.get('[role="alert"]').text()).toBe('Jeton invalide ou révoqué.');
    expect(router.currentRoute.value.path).toBe('/login');
  });
});
