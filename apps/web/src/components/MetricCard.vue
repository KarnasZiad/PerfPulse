<script setup lang="ts">
import { computed } from 'vue';
import { formatValue, METRIC_LABELS, ratingOf, trend } from '../lib/format';
import type { MetricSummary } from '../lib/types';
import DistributionBar from './DistributionBar.vue';
import RatingBadge from './RatingBadge.vue';

const props = defineProps<{ summary: MetricSummary; selected: boolean }>();
defineEmits<{ select: [] }>();

const rating = computed(() => ratingOf(props.summary.metric, props.summary.p75));
const change = computed(() => trend(props.summary.p75, props.summary.previousP75));
</script>

<template>
  <button
    type="button"
    class="card flex flex-col gap-3 text-left transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-series focus-visible:outline-none"
    :class="selected ? 'ring-2 ring-series' : ''"
    :aria-pressed="selected"
    @click="$emit('select')"
  >
    <div class="flex items-start justify-between gap-2">
      <div>
        <p class="text-sm font-semibold">{{ summary.metric }}</p>
        <p class="text-xs text-muted">{{ METRIC_LABELS[summary.metric] }}</p>
      </div>
      <RatingBadge :rating="rating" />
    </div>
    <div class="flex items-baseline gap-2">
      <span class="text-3xl font-semibold">{{ formatValue(summary.metric, summary.p75) }}</span>
      <span class="text-xs text-muted">p75</span>
    </div>
    <!-- Lower is better for every vital: a drop is an improvement. -->
    <p class="text-xs text-ink-2">
      <template v-if="change === null">Pas de comparaison possible</template>
      <template v-else-if="change === 0">Stable par rapport à la période précédente</template>
      <template v-else>
        <span :class="change < 0 ? 'font-medium text-better' : 'font-medium text-poor'">
          {{ change < 0 ? '↓' : '↑' }} {{ Math.abs(change) }} %
          {{ change < 0 ? '(amélioration)' : '(dégradation)' }}
        </span>
        par rapport à la période précédente
      </template>
    </p>
    <DistributionBar
      v-if="summary.samples > 0"
      :good="summary.good"
      :needs-improvement="summary.needsImprovement"
      :poor="summary.poor"
    />
    <p class="text-xs text-muted tabular-nums">{{ summary.samples }} mesures</p>
  </button>
</template>
