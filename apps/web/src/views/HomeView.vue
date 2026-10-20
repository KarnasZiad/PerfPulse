<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router';
import TokenForm from '../components/TokenForm.vue';
import type { Project } from '../lib/types';
import { useSessionStore } from '../stores/session';

const session = useSessionStore();
const router = useRouter();

async function open(project: Project) {
  await router.push(`/p/${project.slug}`);
}
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-[1fr_20rem]">
    <section>
      <h1 class="mb-4 text-xl font-semibold">Projets</h1>
      <ul class="grid gap-3 sm:grid-cols-2">
        <li v-for="project in session.projects" :key="project.id">
          <RouterLink :to="`/p/${project.slug}`" class="card block hover:shadow-md">
            <p class="font-medium">{{ project.name }}</p>
            <p class="font-mono text-xs text-muted">{{ project.slug }}</p>
          </RouterLink>
        </li>
      </ul>
    </section>
    <aside class="card h-fit">
      <h2 class="mb-1 font-semibold">Ajouter un projet</h2>
      <p class="mb-4 text-sm text-ink-2">
        Le jeton de lecture d’un autre projet l’ajoute à cette session.
      </p>
      <TokenForm submit-label="Ajouter" @added="open" />
    </aside>
  </div>
</template>
