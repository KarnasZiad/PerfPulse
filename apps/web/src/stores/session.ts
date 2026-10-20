import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api, ApiError } from '../lib/api';
import type { Project } from '../lib/types';

export type SessionStatus = 'unknown' | 'anonymous' | 'authenticated';

/** Projects the session gives access to. The token itself never stays in the browser. */
export const useSessionStore = defineStore('session', () => {
  const status = ref<SessionStatus>('unknown');
  const projects = ref<Project[]>([]);
  const authenticated = computed(() => status.value === 'authenticated');

  function reset(): void {
    projects.value = [];
    status.value = 'anonymous';
  }

  async function load(): Promise<void> {
    try {
      projects.value = (await api<{ items: Project[] }>('/api/projects')).items;
      status.value = projects.value.length > 0 ? 'authenticated' : 'anonymous';
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      reset();
    }
  }

  /** Exchanges a read token for a session cookie; each further token adds its project. */
  async function signIn(token: string): Promise<Project> {
    const { project } = await api<{ project: Project }>('/api/session', {
      method: 'POST',
      body: { token },
    });
    await load();
    return project;
  }

  async function signOut(): Promise<void> {
    try {
      await api('/api/session', { method: 'DELETE' });
    } finally {
      reset();
    }
  }

  function find(slug: string): Project | undefined {
    return projects.value.find((project) => project.slug === slug);
  }

  return { status, projects, authenticated, reset, load, signIn, signOut, find };
});
