import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

const source = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

const processBoundaryCoverageExcludes = [
  'apps/desktop/main/src/apply-fuses.ts',
  'apps/desktop/main/src/core-supervisor.ts',
  'apps/desktop/main/src/electron-main.ts',
  'apps/desktop/main/src/generation-ipc.ts',
  'apps/desktop/main/src/ipc-handlers.ts',
  'apps/desktop/preload/src/entry.ts',
  'apps/desktop/renderer/src/app/renderer-error-boundary.tsx',
  'apps/desktop/renderer/src/bridge/renderer-bridge-adapter.ts',
  'apps/desktop/renderer/src/bridge/request-lifecycle.ts',
  'apps/desktop/renderer/src/bridge/use-bridge-resource.ts',
  'apps/desktop/renderer/src/compat/legacy-surface.ts',
  'apps/desktop/renderer/src/features/writing/editor-selection.ts',
  'apps/desktop/renderer/src/features/writing/generation-task-subscription.ts',
  'apps/desktop/renderer/src/features/writing/paste-sanitizer.ts',
  'apps/desktop/renderer/src/features/writing/review-diff-panel.tsx',
  'apps/desktop/renderer/src/features/writing/use-chapter-session.ts',
  'apps/desktop/renderer/src/features/writing/use-draft-autosave.ts',
  'apps/desktop/renderer/src/features/writing/use-editor-lifecycle.ts',
  'apps/desktop/renderer/src/features/writing/use-generation-run-actions.ts',
  'apps/desktop/renderer/src/features/writing/use-generation-sources.ts',
  'apps/desktop/renderer/src/features/writing/use-writing-continuation.ts',
  'apps/desktop/renderer/src/features/writing/use-writing-editor-tools.ts',
  'apps/desktop/renderer/src/features/writing/use-writing-metrics.ts',
  'apps/desktop/renderer/src/features/writing/use-writing-session-controller.ts',
  'apps/desktop/renderer/src/features/writing/use-writing-status.ts',
  'packages/core-service/src/candidate-diff-worker.ts',
  'packages/core-service/src/utility-generation-router.ts',
  'packages/core-service/src/utility-search-rhythm-router.ts',
  'packages/core-service/src/utility-validation-router.ts',
] as const;

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
    setupFiles: ['tests/setup/restore-global-state.ts'],
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
      exclude: [
        '**/*.d.ts',
        '**/dist/**',
        '**/node_modules/**',
        ...processBoundaryCoverageExcludes,
      ],
      thresholds: {
        statements: 75,
        branches: 75,
        functions: 75,
        lines: 75,
      },
    },
  },
});
