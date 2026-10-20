import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { overview } from '../../test/fake-api';
import type { MetricSummary } from '../lib/types';
import DistributionBar from './DistributionBar.vue';
import MetricCard from './MetricCard.vue';

function summary(metric: MetricSummary['metric']): MetricSummary {
  const found = overview.metrics.find((item) => item.metric === metric);
  if (!found) throw new Error(`no fixture for ${metric}`);
  return found;
}

describe('MetricCard', () => {
  it('shows the p75, its rating and an improvement', async () => {
    const wrapper = mount(MetricCard, { props: { summary: summary('LCP'), selected: true } });

    expect(wrapper.text()).toContain('2,1 s');
    expect(wrapper.text()).toContain('Bon');
    expect(wrapper.text()).toContain('↓ 12 % (amélioration)');
    expect(wrapper.attributes('aria-pressed')).toBe('true');
    await wrapper.trigger('click');
    expect(wrapper.emitted('select')).toHaveLength(1);
  });

  it('names a regression, a stable value and a missing comparison', () => {
    expect(
      mount(MetricCard, { props: { summary: summary('INP'), selected: false } }).text(),
    ).toContain('↑ 28 % (dégradation)');
    expect(
      mount(MetricCard, { props: { summary: summary('CLS'), selected: false } }).text(),
    ).toContain('Stable');
    expect(
      mount(MetricCard, { props: { summary: summary('FCP'), selected: false } }).text(),
    ).toContain('Pas de comparaison possible');
  });

  it('has no distribution without measures', () => {
    const wrapper = mount(MetricCard, { props: { summary: summary('TTFB'), selected: false } });

    expect(wrapper.text()).toContain('Pas de données');
    expect(wrapper.findComponent(DistributionBar).exists()).toBe(false);
  });
});

describe('DistributionBar', () => {
  it('labels every non-empty share', () => {
    const wrapper = mount(DistributionBar, {
      props: { good: 0.7, needsImprovement: 0.3, poor: 0 },
    });

    expect(wrapper.findAll('li').map((item) => item.text())).toEqual([
      'Bon 70 %',
      'À améliorer 30 %',
    ]);
    expect(wrapper.find('[aria-hidden="true"] span').attributes('style')).toContain('width: 70%');
  });
});
