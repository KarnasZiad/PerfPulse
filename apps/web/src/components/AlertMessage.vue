<script setup lang="ts">
defineProps<{ tone?: 'error' | 'info' }>();
</script>

<template>
  <div
    :role="tone === 'info' ? 'status' : 'alert'"
    class="rounded-md border px-3 py-2 text-sm"
    :class="
      tone === 'info'
        ? 'border-hairline bg-surface text-ink-2'
        : 'border-red-200 bg-red-50 text-red-800'
    "
  >
    <slot />
  </div>
</template>
