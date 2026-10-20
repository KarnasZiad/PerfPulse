<script setup lang="ts">
import { ref } from 'vue';
import { describeError } from '../lib/api';
import type { Project } from '../lib/types';
import { useSessionStore } from '../stores/session';
import AlertMessage from './AlertMessage.vue';

defineProps<{ submitLabel: string }>();
const emit = defineEmits<{ added: [project: Project] }>();

const session = useSessionStore();
const token = ref('');
const error = ref<string | null>(null);
const pending = ref(false);

const TOKEN = /^pp_read_[A-Za-z0-9]{40}$/;

async function submit() {
  const value = token.value.trim();
  error.value = null;
  if (!TOKEN.test(value)) {
    error.value = 'Un jeton de lecture commence par pp_read_ suivi de 40 caractères.';
    return;
  }
  pending.value = true;
  try {
    const project = await session.signIn(value);
    emit('added', project);
  } catch (caught) {
    error.value = describeError(caught, { 401: 'Jeton invalide ou révoqué.' });
  } finally {
    // The token is exchanged for a cookie: nothing keeps it in the page.
    token.value = '';
    pending.value = false;
  }
}
</script>

<template>
  <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
    <label class="flex flex-col gap-1.5">
      <span class="label">Jeton de lecture</span>
      <input
        v-model="token"
        class="input font-mono"
        type="password"
        autocomplete="off"
        spellcheck="false"
        placeholder="pp_read_…"
        required
      />
    </label>
    <AlertMessage v-if="error">{{ error }}</AlertMessage>
    <button type="submit" class="btn-primary" :disabled="pending">
      {{ pending ? 'Vérification…' : submitLabel }}
    </button>
  </form>
</template>
