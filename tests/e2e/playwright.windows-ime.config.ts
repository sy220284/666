import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['m8-07-windows-ime.spec.ts'],
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  retries: 0,
  reporter: 'line',
  outputDir: process.env.WORLDFORGE_E2E_OUTPUT_DIR ?? 'test-results/windows-ime-playwright',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
