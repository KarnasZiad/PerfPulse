import type { Metric } from '@perfpulse/protocol';
import { formatAxis, formatValue, thresholdsOf } from './format';
import type { ErrorDetail, Series } from './types';

/** Chart chrome: recessive grid and axes, one series hue, ink for every text. */
export const CHART = {
  series: '#2a78d6',
  ink: '#0b0b0b',
  ink2: '#52514e',
  muted: '#898781',
  hairline: '#e1e0d9',
  baseline: '#c3c2b7',
  surface: '#fcfcfb',
  font: "system-ui, -apple-system, 'Segoe UI', sans-serif",
} as const;

const tooltipBase = {
  backgroundColor: CHART.surface,
  borderColor: CHART.hairline,
  textStyle: { color: CHART.ink, fontFamily: CHART.font, fontSize: 12 },
  extraCssText: 'box-shadow: 0 4px 12px rgba(11,11,11,0.08); border-radius: 8px;',
};

const axisLabel = { color: CHART.muted, fontFamily: CHART.font, fontSize: 11 };

/**
 * Tooltip row: value first and strong, label after; every part is a number or a date we format.
 * Classes, not style attributes: the CSP refuses inline styles in markup (see style.css).
 */
function tooltipRow(value: string, label: string): string {
  return `<strong class="pp-tip-value">${value}</strong> <span class="pp-tip-label">${label}</span>`;
}

function tooltipTitle(text: string): string {
  return `<div class="pp-tip-title">${text}</div>`;
}

/**
 * p75 over time with the two thresholds as labelled reference lines. The axis always reaches the
 * "good" threshold so a fast site still shows how much margin it has.
 */
export function p75Option(series: Series) {
  const metric: Metric = series.metric;
  const [good, poor] = thresholdsOf(metric);
  const values = series.points.flatMap((point) => (point.p75 === null ? [] : [point.p75]));
  const top = Math.max(good, ...values) * 1.15;
  const lines = [
    { yAxis: good, name: `Bon ≤ ${formatValue(metric, good)}` },
    ...(poor <= top ? [{ yAxis: poor, name: `Mauvais > ${formatValue(metric, poor)}` }] : []),
  ];
  return {
    animation: false,
    grid: { left: 8, right: 112, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: CHART.baseline, width: 1 } },
      formatter: (params: { dataIndex: number }[]) => {
        const point = series.points[params[0]?.dataIndex ?? -1];
        if (!point) return '';
        return [
          tooltipTitle(formatAxis(point.time, series.step)),
          tooltipRow(formatValue(metric, point.p75), 'p75'),
          tooltipRow(String(point.samples), 'mesures'),
        ].join('<br>');
      },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: series.points.map((point) => formatAxis(point.time, series.step)),
      axisLine: { lineStyle: { color: CHART.baseline } },
      axisTick: { show: false },
      axisLabel: { ...axisLabel, hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: top,
      splitNumber: 4,
      splitLine: { lineStyle: { color: CHART.hairline } },
      axisLabel: { ...axisLabel, formatter: (value: number) => formatValue(metric, value) },
    },
    series: [
      {
        name: 'p75',
        type: 'line',
        data: series.points.map((point) => point.p75),
        connectNulls: false,
        showSymbol: false,
        symbolSize: 8,
        lineStyle: { width: 2, color: CHART.series },
        itemStyle: { color: CHART.series, borderColor: CHART.surface, borderWidth: 2 },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: CHART.muted, type: 'dashed', width: 1 },
          label: { position: 'end', color: CHART.ink2, fontFamily: CHART.font, formatter: '{b}' },
          data: lines,
        },
      },
    ],
  };
}

/** Occurrences per day: one bar per day, the tooltip on the bar itself. */
export function dailyOption(daily: ErrorDetail['daily']) {
  return {
    animation: false,
    grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      ...tooltipBase,
      trigger: 'item',
      formatter: (params: { dataIndex: number }) => {
        const entry = daily[params.dataIndex];
        if (!entry) return '';
        return [
          tooltipTitle(formatAxis(entry.day, 'day')),
          tooltipRow(String(entry.count), entry.count > 1 ? 'occurrences' : 'occurrence'),
        ].join('<br>');
      },
    },
    xAxis: {
      type: 'category',
      data: daily.map((entry) => formatAxis(entry.day, 'day')),
      axisLine: { lineStyle: { color: CHART.baseline } },
      axisTick: { show: false },
      axisLabel: { ...axisLabel, hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitNumber: 3,
      splitLine: { lineStyle: { color: CHART.hairline } },
      axisLabel,
    },
    series: [
      {
        name: 'Occurrences',
        type: 'bar',
        data: daily.map((entry) => entry.count),
        barMaxWidth: 16,
        itemStyle: { color: CHART.series, borderRadius: [4, 4, 0, 0] },
      },
    ],
  };
}
