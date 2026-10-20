import { defineConfig } from 'vitest/config';

// Real TimescaleDB and MongoDB started by Testcontainers (Docker required).
export default defineConfig({
  resolve: { conditions: ['@perfpulse/source'] },
  ssr: { resolve: { conditions: ['@perfpulse/source'] } },
  test: {
    include: ['test/integration/**/*.int-spec.ts'],
    environment: 'node',
    globalSetup: ['test/integration/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
