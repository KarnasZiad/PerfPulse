/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  // Thresholds and buckets come from the protocol sources: no build of the workspace needed.
  resolve: { conditions: ['@perfpulse/source', 'module', 'browser', 'development|production'] },
  server: {
    port: 5174,
    // Same origin as behind Nginx in production: the session cookie stays first-party.
    proxy: { '/api': 'http://localhost:4200' },
  },
  build: {
    sourcemap: true,
    // ECharts (tree-shaken) is one lazy chunk of about 190 kB gzip, loaded by the chart views only.
    chunkSizeWarningLimit: 600,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.spec.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,vue}'],
      // The canvas wrapper is a stub in jsdom: ECharts needs a real layout engine.
      exclude: ['src/main.ts', 'src/**/*.spec.ts', 'src/lib/types.ts', 'src/components/EChart.vue'],
      reporter: ['text-summary', 'lcov', 'html'],
      thresholds: { lines: 85, statements: 85, functions: 80, branches: 80 },
    },
  },
});
