import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'm1-deferred-acceptance.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  retries: 0,
  reporter: 'line',
  outputDir: process.env.WORLDFORGE_E2E_OUTPUT_DIR ?? 'test-results/m1-acceptance',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
