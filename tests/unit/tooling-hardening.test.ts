import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { importsFrom } from '../../scripts/check-boundaries.mjs';
import { inspectWorkspaces } from '../../scripts/check-workspaces.mjs';
import {
  parseRunnerArguments,
  resolveElectronE2EInvocation,
} from '../../scripts/run-electron-e2e.mjs';

describe('tooling hardening', () => {
  it('uses one Electron E2E runner, strips its private CI flag and routes platform experience', async () => {
    expect(parseRunnerArguments(['--ci-only', 'tests/e2e/electron-shell.spec.ts'])).toEqual({
      ciOnly: true,
      configPath: 'tests/e2e/playwright.config.ts',
      playwrightArguments: ['tests/e2e/electron-shell.spec.ts'],
    });
    expect(parseRunnerArguments(['tests/e2e/platform-experience.spec.ts'])).toEqual({
      ciOnly: false,
      configPath: 'tests/e2e/playwright.platform-experience.config.ts',
      playwrightArguments: ['tests/e2e/platform-experience.spec.ts'],
    });
    const manifest = JSON.parse(await readFile('package.json', 'utf8'));
    expect(manifest.scripts.test).toContain('pnpm test:e2e -- --ci-only');
    await expect(readFile('apps/desktop/main/run-e2e.mjs', 'utf8')).rejects.toThrow();
    await expect(readFile('apps/desktop/main/run-ci-e2e.mjs', 'utf8')).rejects.toThrow();
  });

  it('uses xvfb only for headless Linux', () => {
    expect(
      resolveElectronE2EInvocation({
        platform: 'linux',
        display: '',
        xvfbAvailable: true,
        pnpmCommand: 'pnpm',
        additionalArguments: ['tests/e2e/electron-shell.spec.ts'],
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
        'tests/e2e/electron-shell.spec.ts',
      ],
    });
  });

  it('uses fileURLToPath for renderer build paths', async () => {
    const source = await readFile('apps/desktop/renderer/build-assets.mjs', 'utf8');
    expect(source).toContain('fileURLToPath');
    expect(source).not.toContain('.pathname');
  });

  it('rejects a discovered workspace without an architecture declaration', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-workspaces-'));
    await mkdir(path.join(root, 'packages', 'alpha'), { recursive: true });
    await mkdir(path.join(root, '.github', 'governance'), { recursive: true });
    await writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
    await writeFile(
      path.join(root, 'packages', 'alpha', 'package.json'),
      JSON.stringify({ name: '@worldforge/alpha', private: true }),
    );
    await writeFile(
      path.join(root, '.github', 'governance', 'workspace-architecture.json'),
      JSON.stringify({ schemaVersion: 1, workspaces: {} }),
    );
    await expect(inspectWorkspaces(root)).rejects.toThrow('missing: packages/alpha');
  });

  it('extracts imports through the TypeScript AST', () => {
    const source = [
      "import x from '@worldforge/contracts';",
      "export { y } from '@worldforge/domain';",
      "void import('@worldforge/prompts');",
      "import z = require('@worldforge/editor-core');",
    ].join('\n');
    expect(importsFrom(source)).toEqual([
      '@worldforge/contracts',
      '@worldforge/domain',
      '@worldforge/prompts',
      '@worldforge/editor-core',
    ]);
  });

  it('paginates rulesets, verifies release assets and avoids duplicate source startup smoke', async () => {
    const ruleset = await readFile('scripts/ruleset-policy.mjs', 'utf8');
    const release = await readFile('.github/workflows/release.yml', 'utf8');
    expect(ruleset).toContain('per_page=100&page=');
    expect(ruleset).toContain('pageItems.length < 100');
    expect(release).not.toContain('Run platform startup smoke');
    expect(release).toContain('verify-package-assets.mjs');
    expect(release).toContain('smoke-packaged-desktop.mjs');
  });
});
