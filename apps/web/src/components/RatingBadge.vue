<script setup lang="ts">
import type { Rating } from '@perfpulse/protocol';
import { computed } from 'vue';
import { RATING_LABELS } from '../lib/format';

const props = defineProps<{ rating: Rating | null; compact?: boolean }>();

const label = computed(() => (props.rating ? RATING_LABELS[props.rating] : 'Pas de données'));
</script>

<template>
  <!-- The color is a cue, the word is the meaning: in compact cells it stays for screen readers. -->
  <span
    class="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2"
    :title="compact ? label : undefined"
  >
    <span
      aria-hidden="true"
      class="size-2 rounded-full"
      :class="{
        'bg-good': rating === 'good',
        'bg-warn': rating === 'needs-improvement',
        'bg-poor': rating === 'poor',
        'bg-hairline': rating === null,
      }"
    />
    <span :class="compact ? 'sr-only' : ''">{{ label }}</span>
  </span>
</template>
