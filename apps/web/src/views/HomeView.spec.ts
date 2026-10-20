import { flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { blog, installFakeApi, READ_TOKEN, shop } from '../../test/fake-api';
import { mountView } from '../../test/mount';
import HomeView from './HomeView.vue';

describe('HomeView', () => {
  it('lists the projects of the session', async () => {
    const { wrapper } = await mountView(HomeView, { projects: [shop, blog] });

    const links = wrapper.findAll('li a');
    expect(links.map((link) => link.attributes('href'))).toEqual(['/p/shop', '/p/blog']);
    expect(links[0]?.text()).toContain('Boutique');
  });

  it('adds the project of another token and opens it', async () => {
    installFakeApi((method, path) => {
      if (method === 'POST' && path === '/api/session') return { body: { project: blog } };
      if (path === '/api/projects') return { body: { items: [blog, shop] } };
      return undefined;
    });
    const { wrapper, router, session } = await mountView(HomeView);

    await wrapper.find('input').setValue(READ_TOKEN);
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(session.projects).toEqual([blog, shop]);
    // The project view is a lazy route: its chunk loads after the click.
    await vi.waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/p/blog');
    });
  });
});
