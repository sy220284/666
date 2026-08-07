import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

const source = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

type CoverageMetric = 'statements' | 'branches' | 'functions' | 'lines';

interface CoverageBaseline {
  schemaVersion: number;
  policy: 'dual-track';
  core: {
    pattern: string;
    thresholdPercent: Record<CoverageMetric, number>;
  };
  rendererTsx: {
    pattern: string;
    metrics: Record<
      CoverageMetric,
      {
        covered: number;
        total: number;
        maxUncovered: number;
        percent: number;
      }
    >;
  };
}

const coverageBaseline = JSON.parse(
  readFileSync(source('./docs/architecture/coverage-baseline.json'), 'utf8'),
) as CoverageBaseline;

const rendererTsxThresholds = {
  statements: -coverageBaseline.rendererTsx.metrics.statements.maxUncovered,
  branches: -coverageBaseline.rendererTsx.metrics.branches.maxUncovered,
  functions: -coverageBaseline.rendererTsx.metrics.functions.maxUncovered,
  lines: -coverageBaseline.rendererTsx.metrics.lines.maxUncovered,
};

const processBoundaryCoverageExcludes = [
  'apps/desktop/main/src/apply-fuses.ts',
  'apps/desktop/main/src/core-supervisor.ts',
  'apps/desktop/main/src/electron-main.ts',
  'apps/desktop/main/src/generation-ipc.ts',
  'apps/desktop/main/src/ipc-handlers.ts',
  'apps/desktop/preload/src/entry.ts',
  'apps/desktop/renderer/src/app/renderer-error-boundary.tsx',
  'apps/desktop/renderer/src/bridge/renderer-bridge-adapter.ts',
  'apps/desktop/renderer/src/bridge/use-bridge-resource.ts',
  'packages/core-service/src/candidate-diff-worker.ts',
  'packages/core-service/src/utility-generation-router.ts',
  'packages/core-service/src/utility-search-rhythm-router.ts',
  'packages/core-service/src/utility-validation-router.ts',
] as const;

// These files bind React or browser DOM lifecycle APIs that the repository's Node coverage
// environment cannot execute faithfully. Each exclusion requires alternative unit/source-invariant
// coverage plus Electron E2E evidence and has an explicit sunset condition in M9-03 evidence.
const rendererDomLifecycleCoverageExcludes = [
  'apps/desktop/renderer/src/app/use-app-settings-persistence.ts',
  'apps/desktop/renderer/src/app/use-app-shell-actions.ts',
  'apps/desktop/renderer/src/app/use-app-shell-navigation.ts',
  'apps/desktop/renderer/src/app/use-project-session-controller.ts',
  'apps/desktop/renderer/src/app/use-workspace-runtime.ts',
  'apps/desktop/renderer/src/app/use-workspace-startup.ts',
  'apps/desktop/renderer/src/features/writing/editor-selection.ts',
  'apps/desktop/renderer/src/features/writing/paste-sanitizer.ts',
  'apps/desktop/renderer/src/features/writing/review-diff-panel.tsx',
  'apps/desktop/renderer/src/features/writing/use-chapter-session.ts',
  'apps/desktop/renderer/src/features/writing/use-draft-autosave.ts',
  'apps/desktop/renderer/src/features/writing/use-editor-lifecycle.ts',
  'apps/desktop/renderer/src/features/writing/use-generation-sources.ts',
  'apps/desktop/renderer/src/features/writing/use-writing-continuation.ts',
  'apps/desktop/renderer/src/features/writing/use-writing-editor-tools.ts',
  'apps/desktop/renderer/src/features/writing/use-writing-metrics.ts',
  'apps/desktop/renderer/src/features/writing/use-writing-session-controller.ts',
  'apps/desktop/renderer/src/features/writing/use-writing-status.ts',
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
      'tests/unit/**/*.test.{ts,tsx}',
      'tests/integration/**/*.test.{ts,tsx}',
      'tests/migration/**/*.test.{ts,tsx}',
      'tests/security/**/*.test.{ts,tsx}',
    ],
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      reportsDirectory: 'coverage',
      include: [
        'apps/desktop/main/src/**/*.ts',
        'apps/desktop/preload/src/**/*.ts',
        'apps/desktop/renderer/src/**/*.{ts,tsx}',
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
        ...rendererDomLifecycleCoverageExcludes,
      ],
      thresholds: {
        [coverageBaseline.core.pattern]: coverageBaseline.core.thresholdPercent,
        [coverageBaseline.rendererTsx.pattern]: rendererTsxThresholds,
      },
    },
  },
});
