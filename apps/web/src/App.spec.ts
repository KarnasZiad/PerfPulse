import { flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { blog, installFakeApi, shop } from '../test/fake-api';
import { mountView } from '../test/mount';
import App from './App.vue';

describe('App', () => {
  it('links every project of the session', async () => {
    installFakeApi(() => undefined);
    const { wrapper } = await mountView(App, { projects: [shop, blog] });

    const nav = wrapper.get('nav[aria-label="Projets"]');
    expect(nav.findAll('a').map((link) => link.text())).toEqual(['Boutique', 'Blog']);
  });

  it('signs out and returns to the sign-in page', async () => {
    const { calls } = installFakeApi((method) =>
      method === 'DELETE' ? { status: 204 } : undefined,
    );
    const { wrapper, router, session } = await mountView(App);

    await wrapper.get('header button').trigger('click');
    await flushPromises();

    expect(calls).toContainEqual({ method: 'DELETE', path: '/api/session', body: undefined });
    expect(session.authenticated).toBe(false);
    await vi.waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/login');
    });
    expect(wrapper.find('header').exists()).toBe(false);
  });
});
