import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

const source = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@worldforge/contracts': source('./packages/contracts/src/public-index.ts'),
      '@worldforge/core-service': source('./packages/core-service/src/index.ts'),
      '@worldforge/domain': source('./packages/domain/src/index.ts'),
      '@worldforge/editor-core': source('./packages/editor-core/src/index.ts'),
      '@worldforge/prompts': source('./packages/prompts/src/index.ts'),
      '@worldforge/testkit': source('./packages/testkit/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 20_000,
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/migration/**/*.test.ts',
      'tests/security/**/*.test.ts',
    ],
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      reportsDirectory: 'coverage',
      include: [
        'apps/desktop/main/src/**/*.ts',
        'apps/desktop/preload/src/**/*.ts',
        'apps/desktop/renderer/src/**/*.ts',
        'packages/contracts/src/**/*.ts',
        'packages/core-service/src/**/*.ts',
        'packages/domain/src/**/*.ts',
        'packages/editor-core/src/**/*.ts',
        'packages/prompts/src/**/*.ts',
      ],
      exclude: ['**/*.d.ts', '**/dist/**', '**/node_modules/**'],
    },
  },
});
