import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { installFakeApi, shop } from '../test/fake-api';
import { createAppRouter, safeNext } from './router';

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('router', () => {
  it('sends a visitor without a session to the sign-in page, keeping the target', async () => {
    installFakeApi(() => ({ status: 401, body: { title: 'Unauthorized' } }));
    const router = createAppRouter(createMemoryHistory());
    await router.push('/p/shop?range=30d');

    expect(router.currentRoute.value.path).toBe('/login');
    expect(router.currentRoute.value.query.next).toBe('/p/shop?range=30d');
    expect(document.title).toBe('Connexion · PerfPulse');
  });

  it('opens the projects of the session and nothing else', async () => {
    installFakeApi(() => ({ body: { items: [shop] } }));
    const router = createAppRouter(createMemoryHistory());

    await router.push('/p/shop');
    expect(router.currentRoute.value.path).toBe('/p/shop');
    expect(document.title).toBe('Vue d’ensemble · PerfPulse');

    await router.push('/p/someone-else');
    expect(router.currentRoute.value.path).toBe('/');
    await router.push('/does/not/exist');
    expect(router.currentRoute.value.path).toBe('/');
  });
});

describe('safeNext', () => {
  it('only accepts paths of the dashboard', () => {
    expect(safeNext('/p/shop?range=7d')).toBe('/p/shop?range=7d');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext(['/p/shop'])).toBe('/');
    expect(safeNext(undefined)).toBe('/');
  });
});
