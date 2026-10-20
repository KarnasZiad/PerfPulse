<script setup lang="ts">
import { RouterLink, RouterView, useRouter } from 'vue-router';
import LogoMark from './components/LogoMark.vue';
import { useSessionStore } from './stores/session';

const session = useSessionStore();
const router = useRouter();

async function signOut() {
  await session.signOut();
  await router.push('/login');
}
</script>

<template>
  <div class="min-h-screen">
    <header v-if="session.authenticated" class="bg-pulse-900 text-white">
      <div class="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
        <RouterLink to="/" class="flex items-center gap-2 font-semibold tracking-wide">
          <LogoMark class="size-6" />
          PerfPulse
        </RouterLink>
        <nav aria-label="Projets" class="flex flex-wrap gap-1">
          <RouterLink
            v-for="project in session.projects"
            :key="project.id"
            :to="`/p/${project.slug}`"
            class="rounded-md px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10"
            active-class="bg-white/15 text-white"
          >
            {{ project.name }}
          </RouterLink>
        </nav>
        <button
          type="button"
          class="ml-auto rounded-md px-3 py-1.5 text-sm hover:bg-white/10"
          @click="signOut"
        >
          Déconnexion
        </button>
      </div>
    </header>
    <main :class="session.authenticated ? 'mx-auto max-w-7xl px-4 py-6' : ''">
      <RouterView />
    </main>
  </div>
</template>
