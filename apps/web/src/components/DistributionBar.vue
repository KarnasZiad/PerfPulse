<script setup lang="ts">
import { computed } from 'vue';
import { formatPercent, RATING_LABELS } from '../lib/format';

const props = defineProps<{ good: number; needsImprovement: number; poor: number }>();

const segments = computed(() =>
  [
    { key: 'good', label: RATING_LABELS.good, share: props.good, fill: 'bg-good' },
    {
      key: 'needs-improvement',
      label: RATING_LABELS['needs-improvement'],
      share: props.needsImprovement,
      fill: 'bg-warn',
    },
    { key: 'poor', label: RATING_LABELS.poor, share: props.poor, fill: 'bg-poor' },
  ].filter((segment) => segment.share > 0),
);
</script>

<template>
  <div>
    <!-- Segments touch through a 2px surface gap; empty shares draw nothing. -->
    <div class="flex h-2 gap-0.5 overflow-hidden rounded bg-surface" aria-hidden="true">
      <span
        v-for="segment in segments"
        :key="segment.key"
        class="h-full first:rounded-l last:rounded-r"
        :class="segment.fill"
        :style="{ width: `${segment.share * 100}%` }"
      />
    </div>
    <ul class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
      <li v-for="segment in segments" :key="segment.key" class="inline-flex items-center gap-1">
        <span aria-hidden="true" class="size-2 rounded-full" :class="segment.fill" />
        {{ segment.label }}
        <span class="tabular-nums text-ink">{{ formatPercent(segment.share) }}</span>
      </li>
    </ul>
  </div>
</template>
