<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import LogoMark from '../components/LogoMark.vue';
import TokenForm from '../components/TokenForm.vue';
import type { Project } from '../lib/types';
import { safeNext } from '../router';

const route = useRoute();
const router = useRouter();

async function open(project: Project) {
  const next = safeNext(route.query.next);
  await router.replace(next === '/' ? `/p/${project.slug}` : next);
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-pulse-900 p-4">
    <div class="card w-full max-w-sm">
      <div class="mb-6 text-center">
        <LogoMark class="mx-auto mb-2 size-10" />
        <p class="text-2xl font-semibold">PerfPulse</p>
        <h1 class="mt-1 text-sm text-ink-2">Accès au tableau de bord d’un projet</h1>
      </div>
      <TokenForm submit-label="Ouvrir le tableau de bord" @added="open" />
      <p class="mt-4 text-xs text-muted">
        Le jeton est fourni à la création du projet. Il est échangé contre un cookie de session et
        n’est jamais conservé dans le navigateur.
      </p>
    </div>
  </div>
</template>
