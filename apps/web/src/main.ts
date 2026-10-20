import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { setUnauthorizedHandler } from './lib/api';
import { createAppRouter } from './router';
import { useSessionStore } from './stores/session';
import './style.css';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

const session = useSessionStore(pinia);
const router = createAppRouter();

// An expired session sends the user back to the sign-in page, then to where they were.
setUnauthorizedHandler(() => {
  if (!session.authenticated) return;
  session.reset();
  void router.push({ path: '/login', query: { next: router.currentRoute.value.fullPath } });
});

app.use(router);
app.mount('#app');
