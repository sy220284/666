import { describe, expect, it } from 'vitest';

import { resolveElectronE2EInvocation } from '../../scripts/run-electron-e2e.mjs';

describe('Electron desktop E2E launcher', () => {
  it('runs Playwright against the Electron-only configuration', () => {
    expect(
      resolveElectronE2EInvocation({
        platform: 'darwin',
        display: undefined,
        xvfbAvailable: false,
        pnpmCommand: 'pnpm',
      }),
    ).toEqual({
      command: 'pnpm',
      arguments: ['exec', 'playwright', 'test', '--config', 'tests/e2e/playwright.config.ts'],
    });
  });

  it('wraps headless Linux in Xvfb and fails clearly when Xvfb is absent', () => {
    expect(
      resolveElectronE2EInvocation({
        platform: 'linux',
        display: '',
        xvfbAvailable: true,
        pnpmCommand: 'pnpm',
        additionalArguments: ['--grep', 'sandboxed renderer'],
      }),
    ).toEqual({
      command: 'xvfb-run',
      arguments: [
        '-a',
        'pnpm',
        'exec',
        'playwright',
        'test',
        '--config',
        'tests/e2e/playwright.config.ts',
        '--grep',
        'sandboxed renderer',
      ],
    });
    expect(() =>
      resolveElectronE2EInvocation({
        platform: 'linux',
        display: '',
        xvfbAvailable: false,
        pnpmCommand: 'pnpm',
      }),
    ).toThrow(/E2E_DISPLAY_UNAVAILABLE/);
  });
});
