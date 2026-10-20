import { enableAutoUnmount } from '@vue/test-utils';
import { afterEach, vi } from 'vitest';

// ECharts needs a real layout engine; jsdom gets a stub that exposes what it was asked to draw.
vi.mock('../src/components/EChart.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'EChart',
      props: { option: { type: Object, required: true }, label: { type: String, required: true } },
      setup: (props) => () => h('div', { 'data-chart': props.label }),
    }),
  };
});

// A view left mounted would keep reacting to the next test's fake API.
enableAutoUnmount(afterEach);
