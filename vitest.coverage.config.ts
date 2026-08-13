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

interface CoverageExclusionRegistry {
  schemaVersion: number;
  policy: 'explicit-exclusions-with-substitute-tests';
  exclusions: readonly {
    path: string;
    category: 'process-boundary' | 'renderer-dom-lifecycle';
    reason: string;
    substituteTests: readonly string[];
    exitCondition: string;
  }[];
}

const coverageExclusions = JSON.parse(
  readFileSync(source('./docs/architecture/coverage-exclusions.json'), 'utf8'),
) as CoverageExclusionRegistry;
const registeredCoverageExcludes = coverageExclusions.exclusions.map((entry) => entry.path);

export default defineConfig({
  resolve: {
    alias: {
      electron: source('./tests/setup/electron-runtime-stub.ts'),
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
      exclude: ['**/*.d.ts', '**/dist/**', '**/node_modules/**', ...registeredCoverageExcludes],
      thresholds: {
        [coverageBaseline.core.pattern]: coverageBaseline.core.thresholdPercent,
        [coverageBaseline.rendererTsx.pattern]: rendererTsxThresholds,
      },
    },
  },
});
