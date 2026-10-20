import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['@perfpulse/source'] },
  ssr: { resolve: { conditions: ['@perfpulse/source'] } },
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/main.ts',
        'src/cli/**',
        // Adapters over Redis, TimescaleDB and MongoDB: covered by the integration tests.
        'src/consumer.ts',
        'src/writers.ts',
        'src/migrator.ts',
        'src/project-store.ts',
      ],
      reporter: ['text-summary', 'lcov', 'html'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
