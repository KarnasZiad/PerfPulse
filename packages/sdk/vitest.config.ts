import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['@perfpulse/source'] },
  test: {
    environment: 'jsdom',
    // A query string and a fragment, to check that only the path is collected.
    environmentOptions: { jsdom: { url: 'https://shop.example.ma/produits/42?token=secret#avis' } },
    include: ['src/**/*.spec.ts'],
    setupFiles: ['./test/setup.ts'],
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts'],
      reporter: ['text-summary', 'lcov', 'html'],
      thresholds: { lines: 95, statements: 95, functions: 95, branches: 90 },
    },
  },
});
