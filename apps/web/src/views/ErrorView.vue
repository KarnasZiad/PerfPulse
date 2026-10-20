<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import AlertMessage from '../components/AlertMessage.vue';
import EChart from '../components/EChart.vue';
import { api, ApiError, describeError } from '../lib/api';
import { dailyOption } from '../lib/charts';
import { formatDateTime } from '../lib/format';
import type { ErrorDetail } from '../lib/types';

const route = useRoute();
const slug = computed(() => String(route.params.slug));
const fingerprint = computed(() => String(route.params.fingerprint));

const detail = ref<ErrorDetail | null>(null);
const failure = ref<string | null>(null);
const missing = ref(false);

const option = computed(() => (detail.value ? dailyOption(detail.value.daily) : null));
const browsers = computed(() =>
  Object.entries(detail.value?.browsers ?? {}).sort(([, left], [, right]) => right - left),
);

async function load() {
  failure.value = null;
  missing.value = false;
  try {
    detail.value = await api<ErrorDetail>(
      `/api/projects/${encodeURIComponent(slug.value)}/errors/${encodeURIComponent(fingerprint.value)}`,
    );
  } catch (error) {
    detail.value = null;
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      missing.value = true;
    } else {
      failure.value = describeError(error);
    }
  }
}

watch([slug, fingerprint], load, { immediate: true });
</script>

<template>
  <div class="flex flex-col gap-6">
    <RouterLink :to="`/p/${slug}`" class="text-sm text-ink-2 hover:underline">
      ← Retour à la vue d’ensemble
    </RouterLink>

    <AlertMessage v-if="failure">{{ failure }}</AlertMessage>
    <AlertMessage v-if="missing" tone="info">
      Ce groupe d’erreurs n’existe pas ou n’a pas été vu depuis 30 jours.
    </AlertMessage>

    <template v-if="detail">
      <section class="card">
        <p class="font-mono text-xs text-muted">{{ detail.type }}</p>
        <h1 class="text-lg font-semibold break-words">{{ detail.message }}</h1>
        <dl class="mt-4 grid gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt class="text-muted">Sur 30 jours</dt>
            <dd class="text-xl font-semibold tabular-nums">{{ detail.count }}</dd>
          </div>
          <div>
            <dt class="text-muted">Depuis le début</dt>
            <dd class="text-xl font-semibold tabular-nums">{{ detail.total }}</dd>
          </div>
          <div>
            <dt class="text-muted">Première occurrence</dt>
            <dd>{{ formatDateTime(detail.firstSeen) }}</dd>
          </div>
          <div>
            <dt class="text-muted">Dernière occurrence</dt>
            <dd>{{ formatDateTime(detail.lastSeen) }}</dd>
          </div>
        </dl>
      </section>

      <div class="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <section class="card">
          <h2 class="mb-3 font-semibold">Occurrences par jour</h2>
          <div v-if="option && detail.daily.length > 0" class="h-56">
            <EChart :option="option" label="Nombre d’occurrences de cette erreur par jour" />
          </div>
          <details v-if="detail.daily.length > 0" class="mt-3 text-sm">
            <summary class="cursor-pointer text-ink-2">Voir les données</summary>
            <table class="data-table mt-2">
              <thead>
                <tr>
                  <th scope="col">Jour</th>
                  <th scope="col" class="num">Occurrences</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="entry in detail.daily" :key="entry.day">
                  <td>{{ entry.day }}</td>
                  <td class="num">{{ entry.count }}</td>
                </tr>
              </tbody>
            </table>
          </details>
        </section>
        <section class="card">
          <h2 class="mb-3 font-semibold">Navigateurs</h2>
          <ul aria-label="Occurrences par navigateur" class="flex flex-col gap-2 text-sm">
            <li v-for="[name, count] in browsers" :key="name" class="flex justify-between">
              <span>{{ name }}</span>
              <span class="tabular-nums text-ink-2">{{ count }}</span>
            </li>
          </ul>
        </section>
      </div>

      <section class="card">
        <h2 class="mb-3 font-semibold">Derniers exemples</h2>
        <ol class="flex flex-col gap-4">
          <li v-for="sample in detail.samples" :key="sample.at + sample.page" class="text-sm">
            <p class="text-ink-2">
              {{ formatDateTime(sample.at) }} · <span class="font-mono">{{ sample.page }}</span> ·
              {{ sample.browser }} / {{ sample.os }} / {{ sample.device }}
              <template v-if="sample.release"> · version {{ sample.release }}</template>
            </p>
            <!-- Text interpolation only: a stack trace comes from visitors and is never rendered as HTML. -->
            <pre
              v-if="sample.stack"
              class="mt-1 overflow-x-auto rounded-md bg-pulse-900 p-3 font-mono text-xs text-slate-100"
              >{{ sample.stack }}</pre>
          </li>
        </ol>
      </section>
    </template>
  </div>
</template>
