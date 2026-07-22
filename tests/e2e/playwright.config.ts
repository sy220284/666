import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: [
    'electron-shell.spec.ts',
    'candidate-preview.spec.ts',
    'candidate-action.spec.ts',
    'candidate-protection.spec.ts',
    'candidate-undo.spec.ts',
    'structure-recovery.spec.ts',
    'unreadable-project-recovery.spec.ts',
    'continuity-ledger.spec.ts',
    'scene-beat.spec.ts',
    'project-planning.spec.ts',
    'm1-09-import-export.spec.ts',
    'm1-deferred-acceptance.spec.ts',
    'narrative-planning-ledger.spec.ts',
    'state-proposal-valid-until.spec.ts',
    'state-proposal-workflow.spec.ts',
  ],
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  retries: 0,
  reporter: 'line',
  outputDir: process.env.WORLDFORGE_E2E_OUTPUT_DIR ?? 'test-results/electron',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
