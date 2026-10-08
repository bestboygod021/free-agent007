import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      // Tests always run against shared SOURCE — no stale dist, no pre-build.
      // The runtime (tsx/node) resolves the same specifiers through the
      // package "exports" to dist/; only this test harness points at .ts.
      {
        find: /^@freellmapi\/shared\/schemas(\.js)?$/,
        replacement: fileURLToPath(new URL('../shared/schemas.ts', import.meta.url)),
      },
      {
        find: /^@freellmapi\/shared\/types(\.js)?$/,
        replacement: fileURLToPath(new URL('../shared/types.ts', import.meta.url)),
      },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      enabled: process.env.COVERAGE === '1',
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**', 'src/db/migrate/**', 'src/scripts/**', 'src/index.ts'],
      reporter: ['text', 'text-summary'],
    },
  },
});
