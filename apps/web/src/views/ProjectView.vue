<script setup lang="ts">
import { METRICS, type Metric } from '@perfpulse/protocol';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import AlertMessage from '../components/AlertMessage.vue';
import MetricCard from '../components/MetricCard.vue';
import P75Chart from '../components/P75Chart.vue';
import RatingBadge from '../components/RatingBadge.vue';
import { api, describeError } from '../lib/api';
import { formatDateTime, formatValue, METRIC_LABELS, ratingOf } from '../lib/format';
import type { DeviceFilter, ErrorGroup, Overview, PageRow, Range, Series } from '../lib/types';
import { useSessionStore } from '../stores/session';

const RANGES: { value: Range; label: string }[] = [
  { value: '24h', label: '24 h' },
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
];
const DEVICES: { value: DeviceFilter; label: string }[] = [
  { value: 'all', label: 'Tous les appareils' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'tablet', label: 'Tablette' },
  { value: 'desktop', label: 'Ordinateur' },
];
/** The three Core Web Vitals lead the pages table; FCP and TTFB stay in the cards. */
const PAGE_METRICS: Metric[] = ['LCP', 'INP', 'CLS'];

const route = useRoute();
const router = useRouter();
const session = useSessionStore();

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.find((item) => item === value) ?? fallback;
}

// Filters live in the URL: a view can be bookmarked and shared with the team.
const slug = computed(() => String(route.params.slug));
const range = computed(() => pick(route.query.range, ['24h', '7d', '30d'], '7d'));
const device = computed(() =>
  pick(route.query.device, ['all', 'mobile', 'tablet', 'desktop'], 'all'),
);
const metric = computed(() => pick(route.query.metric, METRICS, 'LCP'));
const project = computed(() => session.find(slug.value));

const overview = ref<Overview | null>(null);
const pages = ref<PageRow[]>([]);
const errors = ref<ErrorGroup[]>([]);
const series = ref<Series | null>(null);
const loading = ref(true);
const failure = ref<string | null>(null);

function setQuery(patch: Record<string, string>) {
  void router.replace({ query: { ...route.query, ...patch } });
}

// A slower, older response must never overwrite the one for the current filters.
let generation = 0;

async function loadAll() {
  const current = ++generation;
  loading.value = true;
  failure.value = null;
  const base = `/api/projects/${encodeURIComponent(slug.value)}`;
  const filters = `range=${range.value}&device=${device.value}`;
  try {
    const [nextOverview, nextPages, nextErrors] = await Promise.all([
      api<Overview>(`${base}/overview?${filters}`),
      api<{ items: PageRow[] }>(`${base}/pages?range=${range.value}`),
      api<{ items: ErrorGroup[] }>(`${base}/errors?range=${range.value}`),
    ]);
    if (current !== generation) return;
    overview.value = nextOverview;
    pages.value = nextPages.items;
    errors.value = nextErrors.items;
  } catch (error) {
    if (current === generation) failure.value = describeError(error);
  } finally {
    if (current === generation) loading.value = false;
  }
}

let seriesGeneration = 0;

async function loadSeries() {
  const current = ++seriesGeneration;
  const path = `/api/projects/${encodeURIComponent(slug.value)}/vitals/${metric.value}`;
  try {
    const next = await api<Series>(`${path}?range=${range.value}&device=${device.value}`);
    if (current === seriesGeneration) series.value = next;
  } catch (error) {
    if (current === seriesGeneration) failure.value = describeError(error);
  }
}

watch([slug, range, device], loadAll, { immediate: true });
watch([slug, range, device, metric], loadSeries, { immediate: true });
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="font-mono text-xs text-muted">{{ slug }}</p>
        <h1 class="text-xl font-semibold">{{ project?.name }}</h1>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="Période"
          class="flex rounded-md border border-slate-300 bg-white p-0.5"
        >
          <button
            v-for="option in RANGES"
            :key="option.value"
            type="button"
            class="rounded px-3 py-1 text-sm"
            :class="
              option.value === range ? 'bg-pulse-900 text-white' : 'text-ink-2 hover:bg-slate-100'
            "
            :aria-pressed="option.value === range"
            @click="setQuery({ range: option.value })"
          >
            {{ option.label }}
          </button>
        </div>
        <label class="sr-only" for="device">Appareil</label>
        <select
          id="device"
          class="input w-auto"
          :value="device"
          @change="setQuery({ device: ($event.target as HTMLSelectElement).value })"
        >
          <option v-for="option in DEVICES" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>
    </div>

    <AlertMessage v-if="failure">{{ failure }}</AlertMessage>
    <p v-if="loading && !overview" class="text-sm text-muted" role="status">Chargement…</p>

    <template v-if="overview">
      <section aria-label="Indicateurs" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          v-for="summary in overview.metrics"
          :key="summary.metric"
          :summary="summary"
          :selected="summary.metric === metric"
          @select="setQuery({ metric: summary.metric })"
        />
      </section>

      <section class="card">
        <h2 class="font-semibold">{{ METRIC_LABELS[metric] }} ({{ metric }}) — p75</h2>
        <p class="mb-3 text-xs text-muted">
          75 % des visites font mieux que cette valeur : c’est le percentile retenu par Google.
        </p>
        <P75Chart v-if="series && series.metric === metric" :series="series" />
      </section>

      <div class="grid gap-6 xl:grid-cols-2">
        <section class="card overflow-x-auto p-0">
          <h2 class="px-5 pt-5 pb-3 font-semibold">Pages les plus vues</h2>
          <table v-if="pages.length > 0" class="data-table">
            <thead>
              <tr>
                <th scope="col">Page</th>
                <th scope="col" class="num">Vues</th>
                <th v-for="name in PAGE_METRICS" :key="name" scope="col" class="num">
                  {{ name }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in pages" :key="row.page">
                <td class="max-w-64 truncate font-mono text-xs" :title="row.page">
                  {{ row.page }}
                </td>
                <td class="num">{{ row.views }}</td>
                <td v-for="name in PAGE_METRICS" :key="name" class="num">
                  <span class="inline-flex items-center gap-1.5">
                    {{ formatValue(name, row.p75[name]) }}
                    <RatingBadge
                      v-if="row.p75[name] !== undefined && row.p75[name] !== null"
                      :rating="ratingOf(name, row.p75[name])"
                      compact
                    />
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else class="px-5 pb-5 text-sm text-muted">Aucune page vue sur cette période.</p>
        </section>

        <section class="card overflow-x-auto p-0">
          <h2 class="px-5 pt-5 pb-3 font-semibold">Erreurs JavaScript</h2>
          <ul v-if="errors.length > 0">
            <li v-for="group in errors" :key="group.fingerprint" class="border-t border-hairline">
              <RouterLink
                :to="`/p/${slug}/errors/${group.fingerprint}`"
                class="flex items-start justify-between gap-4 px-5 py-3 hover:bg-plane"
              >
                <span class="min-w-0">
                  <span class="block truncate text-sm font-medium">{{ group.message }}</span>
                  <span class="text-xs text-muted">
                    {{ group.type }} · vue le {{ formatDateTime(group.lastSeen) }}
                  </span>
                </span>
                <span class="text-right text-sm tabular-nums">
                  {{ group.count }}
                  <span class="block text-xs text-muted">occurrences</span>
                </span>
              </RouterLink>
            </li>
          </ul>
          <p v-else class="px-5 pb-5 text-sm text-muted">Aucune erreur sur cette période.</p>
        </section>
      </div>
    </template>
  </div>
</template>
