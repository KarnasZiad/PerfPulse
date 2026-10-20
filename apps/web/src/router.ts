import { createRouter, createWebHistory, type Router, type RouterHistory } from 'vue-router';
import { useSessionStore } from './stores/session';

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean;
    title?: string;
  }
}

export function createAppRouter(history: RouterHistory = createWebHistory()): Router {
  const router = createRouter({
    history,
    routes: [
      {
        path: '/login',
        component: () => import('./views/LoginView.vue'),
        meta: { public: true, title: 'Connexion' },
      },
      { path: '/', component: () => import('./views/HomeView.vue'), meta: { title: 'Projets' } },
      {
        path: '/p/:slug',
        component: () => import('./views/ProjectView.vue'),
        meta: { title: 'Vue d’ensemble' },
      },
      {
        path: '/p/:slug/errors/:fingerprint',
        component: () => import('./views/ErrorView.vue'),
        meta: { title: 'Erreur' },
      },
      { path: '/:pathMatch(.*)*', redirect: '/' },
    ],
  });

  router.beforeEach(async (to) => {
    const session = useSessionStore();
    if (session.status === 'unknown') await session.load();
    if (to.meta.public) return true;
    if (!session.authenticated) return { path: '/login', query: { next: to.fullPath } };
    // A project outside the session: back to the list, which shows what is available.
    if (typeof to.params.slug === 'string' && !session.find(to.params.slug)) return '/';
    return true;
  });

  router.afterEach((to) => {
    document.title = to.meta.title ? `${to.meta.title} · PerfPulse` : 'PerfPulse';
  });

  return router;
}

/** Only paths of the dashboard after sign-in, never another site. */
export function safeNext(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/';
}
