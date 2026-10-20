import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { Component } from 'vue';
import { createMemoryHistory } from 'vue-router';
import type { Project } from '../src/lib/types';
import { createAppRouter } from '../src/router';
import { useSessionStore } from '../src/stores/session';
import { shop } from './fake-api';

interface MountOptions {
  /** Projects of the session; null for a visitor without a session. */
  projects?: Project[] | null;
  route?: string;
}

/** Mounts a component with Pinia, the real router (memory history) and a session. */
export async function mountView(
  view: Component,
  { projects = [shop], route = '/' }: MountOptions = {},
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const session = useSessionStore();
  if (projects === null) {
    session.reset();
  } else {
    session.$patch({ status: 'authenticated', projects });
  }
  const router = createAppRouter(createMemoryHistory());
  await router.push(route);
  await router.isReady();
  const wrapper = mount(view, { global: { plugins: [pinia, router] } });
  await flushPromises();
  return { wrapper, router, session };
}
