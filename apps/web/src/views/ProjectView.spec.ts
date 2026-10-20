import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { dashboardApi, FINGERPRINT, installFakeApi } from '../../test/fake-api';
import { mountView } from '../../test/mount';
import MetricCard from '../components/MetricCard.vue';
import ProjectView from './ProjectView.vue';

function paths(calls: { path: string }[]) {
  return calls.map((call) => call.path);
}

describe('ProjectView', () => {
  it('loads the overview, the LCP series, the pages and the errors of the last 7 days', async () => {
    const { calls } = installFakeApi(dashboardApi());
    const { wrapper } = await mountView(ProjectView, { route: '/p/shop' });

    expect(paths(calls)).toEqual(
      expect.arrayContaining([
        '/api/projects/shop/overview?range=7d&device=all',
        '/api/projects/shop/pages?range=7d',
        '/api/projects/shop/errors?range=7d',
        '/api/projects/shop/vitals/LCP?range=7d&device=all',
      ]),
    );
    expect(wrapper.find('h1').text()).toBe('Boutique');
    expect(wrapper.findAllComponents(MetricCard)).toHaveLength(5);
    expect(wrapper.find('[data-chart]').attributes('data-chart')).toContain(
      'Largest Contentful Paint',
    );

    const rows = wrapper.findAll('table.data-table tbody tr');
    expect(rows.some((row) => row.text().includes('/products/:id'))).toBe(true);
    expect(wrapper.text()).toContain('À améliorer');

    const error = wrapper.find(`a[href="/p/shop/errors/${FINGERPRINT}"]`);
    expect(error.text()).toContain("Cannot read properties of undefined (reading 'price')");
    expect(error.text()).toContain('12');
  });

  it('keeps the filters in the URL and reloads for them', async () => {
    const { calls } = installFakeApi(dashboardApi());
    const { wrapper, router } = await mountView(ProjectView, { route: '/p/shop' });
    calls.length = 0;

    await wrapper.findAll('[role="group"] button')[2]?.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.range).toBe('30d');
    expect(paths(calls)).toContain('/api/projects/shop/overview?range=30d&device=all');

    await wrapper.find('select').setValue('mobile');
    await flushPromises();
    expect(paths(calls)).toContain('/api/projects/shop/vitals/LCP?range=30d&device=mobile');
  });

  it('draws the series of the selected metric only', async () => {
    const { calls } = installFakeApi(dashboardApi());
    const { wrapper, router } = await mountView(ProjectView, { route: '/p/shop' });
    calls.length = 0;

    await wrapper.findAllComponents(MetricCard)[1]?.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.query.metric).toBe('INP');
    expect(paths(calls)).toEqual(['/api/projects/shop/vitals/INP?range=7d&device=all']);
    expect(wrapper.find('h2').text()).toContain('Interaction to Next Paint (INP)');
  });

  it('ignores filter values it does not know', async () => {
    const { calls } = installFakeApi(dashboardApi());
    await mountView(ProjectView, { route: '/p/shop?range=1y&device=watch&metric=FID' });

    expect(paths(calls)).toContain('/api/projects/shop/overview?range=7d&device=all');
    expect(paths(calls)).toContain('/api/projects/shop/vitals/LCP?range=7d&device=all');
  });

  it('shows empty states', async () => {
    installFakeApi(
      dashboardApi((_method, path) => {
        if (path.startsWith('/api/projects/shop/pages')) return { body: { items: [] } };
        if (path.startsWith('/api/projects/shop/errors')) return { body: { items: [] } };
        if (path.startsWith('/api/projects/shop/vitals/')) {
          return { body: { metric: 'LCP', step: 'day', points: [] } };
        }
        return undefined;
      }),
    );
    const { wrapper } = await mountView(ProjectView, { route: '/p/shop' });

    expect(wrapper.text()).toContain('Aucune page vue sur cette période.');
    expect(wrapper.text()).toContain('Aucune erreur sur cette période.');
    expect(wrapper.text()).toContain('Aucune mesure de LCP sur cette période.');
  });

  it('reports a failure of the API', async () => {
    installFakeApi(
      dashboardApi((_method, path) =>
        path.startsWith('/api/projects/shop/')
          ? { status: 503, body: { title: 'Unavailable' } }
          : undefined,
      ),
    );
    const { wrapper } = await mountView(ProjectView, { route: '/p/shop' });

    expect(wrapper.get('[role="alert"]').text()).toContain('indisponible');
    expect(wrapper.findAllComponents(MetricCard)).toHaveLength(0);
  });
});
