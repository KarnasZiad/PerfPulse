import { describe, expect, it } from 'vitest';
import { errorDetail, seriesOf } from '../../test/fake-api';
import { dailyOption, p75Option } from './charts';

describe('p75Option', () => {
  it('draws the p75 line with both thresholds when values reach them', () => {
    const option = p75Option(seriesOf('LCP'));
    const [line] = option.series;

    expect(line?.data).toEqual([1900, null, 4600]);
    expect(line?.markLine.data).toEqual([
      { yAxis: 2500, name: 'Bon ≤ 2,5 s' },
      { yAxis: 4000, name: 'Mauvais > 4,0 s' },
    ]);
    expect(option.yAxis.max).toBeCloseTo(4600 * 1.15);
    expect(option.yAxis.axisLabel.formatter(500)).toBe('500 ms');
  });

  it('keeps the good threshold in view and omits a poor one far above the data', () => {
    const fast = {
      metric: 'INP' as const,
      step: 'hour' as const,
      points: [{ time: '2026-10-20T09:00:00Z', p75: 80, samples: 5 }],
    };
    const option = p75Option(fast);

    expect(option.yAxis.max).toBeCloseTo(200 * 1.15);
    expect(option.series[0]?.markLine.data).toEqual([{ yAxis: 200, name: 'Bon ≤ 200 ms' }]);
  });

  it('describes the hovered point in the tooltip', () => {
    const { tooltip } = p75Option(seriesOf('CLS'));

    const html = tooltip.formatter([{ dataIndex: 2 }]);
    expect(html).toContain('0,3');
    expect(html).toContain('30');
    expect(tooltip.formatter([])).toBe('');
  });
});

describe('dailyOption', () => {
  it('draws one bar per day with a tooltip per bar', () => {
    const option = dailyOption(errorDetail.daily);

    expect(option.series[0]?.data).toEqual([1, 11]);
    expect(option.tooltip.formatter({ dataIndex: 0 })).toContain('occurrence<');
    expect(option.tooltip.formatter({ dataIndex: 1 })).toContain('occurrences');
    expect(option.tooltip.formatter({ dataIndex: 9 })).toBe('');
  });
});
