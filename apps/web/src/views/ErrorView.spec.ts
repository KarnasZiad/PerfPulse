import { describe, expect, it } from 'vitest';
import { dashboardApi, FINGERPRINT, installFakeApi } from '../../test/fake-api';
import { mountView } from '../../test/mount';
import ErrorView from './ErrorView.vue';

const route = `/p/shop/errors/${FINGERPRINT}`;

describe('ErrorView', () => {
  it('shows the group, its daily counts, its browsers and its samples', async () => {
    installFakeApi(dashboardApi());
    const { wrapper } = await mountView(ErrorView, { route });

    expect(wrapper.find('h1').text()).toBe("Cannot read properties of undefined (reading 'price')");
    expect(wrapper.find('[data-chart]').exists()).toBe(true);
    expect(wrapper.findAll('details tbody tr')).toHaveLength(2);

    const browsers = wrapper.findAll('ul[aria-label="Occurrences par navigateur"] li');
    expect(browsers.map((item) => item.text())).toEqual(['Chrome9', 'Firefox3']);
    expect(wrapper.text()).toContain('version 1.4.0');
  });

  it('renders a stack trace as text, never as markup', async () => {
    installFakeApi(dashboardApi());
    const { wrapper } = await mountView(ErrorView, { route });

    const pre = wrapper.get('pre');
    expect(pre.text()).toContain('<img src=x onerror=alert(1)>');
    expect(pre.find('img').exists()).toBe(false);
    expect(wrapper.findAll('pre')).toHaveLength(1);
  });

  it('says when the group does not exist', async () => {
    installFakeApi(
      dashboardApi((_method, path) => (path.includes('/errors/') ? { status: 404 } : undefined)),
    );
    const { wrapper } = await mountView(ErrorView, { route });

    expect(wrapper.get('[role="status"]').text()).toContain('n’existe pas');
    expect(wrapper.find('h1').exists()).toBe(false);
  });

  it('reports other failures', async () => {
    installFakeApi(
      dashboardApi((_method, path) =>
        path.includes('/errors/')
          ? { status: 500, body: { title: 'Internal Server Error' } }
          : undefined,
      ),
    );
    const { wrapper } = await mountView(ErrorView, { route });

    expect(wrapper.get('[role="alert"]').text()).toContain('indisponible');
  });
});
