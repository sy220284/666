import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: [
    'electron-shell.spec.ts',
    'candidate-preview.spec.ts',
    'candidate-action.spec.ts',
    'candidate-protection.spec.ts',
  ],
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  retries: 0,
  reporter: 'line',
  outputDir: process.env.WORLDFORGE_E2E_OUTPUT_DIR ?? 'test-results/electron',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
