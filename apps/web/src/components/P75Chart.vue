<script setup lang="ts">
import { computed } from 'vue';
import { p75Option } from '../lib/charts';
import { formatAxis, formatValue, METRIC_LABELS, ratingLabel } from '../lib/format';
import type { Series } from '../lib/types';
import EChart from './EChart.vue';

const props = defineProps<{ series: Series }>();

const option = computed(() => p75Option(props.series));
const hasData = computed(() => props.series.points.some((point) => point.p75 !== null));
</script>

<template>
  <div>
    <div v-if="hasData" class="h-72">
      <EChart
        :option="option"
        :label="`p75 de ${METRIC_LABELS[series.metric]} sur la période, avec les seuils de Google`"
      />
    </div>
    <p v-else class="py-16 text-center text-sm text-muted">
      Aucune mesure de {{ series.metric }} sur cette période.
    </p>
    <details v-if="hasData" class="mt-3 text-sm">
      <summary class="cursor-pointer text-ink-2">Voir les données</summary>
      <table class="data-table mt-2">
        <thead>
          <tr>
            <th scope="col">{{ series.step === 'hour' ? 'Heure' : 'Jour' }}</th>
            <th scope="col" class="num">p75</th>
            <th scope="col">Évaluation</th>
            <th scope="col" class="num">Mesures</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="point in series.points" :key="point.time">
            <td>{{ formatAxis(point.time, series.step) }}</td>
            <td class="num">{{ formatValue(series.metric, point.p75) }}</td>
            <td>{{ ratingLabel(series.metric, point.p75) }}</td>
            <td class="num">{{ point.samples }}</td>
          </tr>
        </tbody>
      </table>
    </details>
  </div>
</template>
