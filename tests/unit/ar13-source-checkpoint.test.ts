import { cp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const exportsToCapture = [
  'packages/core-service/src',
  'packages/core-service/package.json',
  'packages/core-service/tsconfig.json',
  'packages/contracts/src',
  'packages/contracts/package.json',
  'packages/contracts/tsconfig.json',
  'packages/domain/src',
  'packages/domain/package.json',
  'packages/domain/tsconfig.json',
  'packages/testkit/src',
  'packages/testkit/package.json',
  'packages/testkit/tsconfig.json',
  'tests',
  'scripts/check-boundaries.mjs',
  'scripts/check-source-structure.mjs',
  'docs/architecture/source-structure-baseline.json',
  'docs/tasks/M9/V1_1_ARCHITECTURE_REFACTOR_WORK_PACKAGES.md',
  'package.json',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'vitest.config.ts',
  'vitest.coverage.config.ts',
] as const;

describe('AR-13 source checkpoint', () => {
  it('exports the frozen Recovery and tool-domain source graph for offline candidate validation', async () => {
    const repositoryRoot = process.cwd();
    const outputRoot = path.join(repositoryRoot, 'test-results', 'unit', 'ar13-source');
    await mkdir(outputRoot, { recursive: true });

    expect(exportsToCapture.length).toBeGreaterThan(0);
    for (const relativePath of exportsToCapture) {
      await cp(path.join(repositoryRoot, relativePath), path.join(outputRoot, relativePath), {
        recursive: true,
      });
    }

    await writeFile(
      path.join(outputRoot, 'checkpoint.json'),
      `${JSON.stringify(
        {
          checkpoint: 'AR-13_SOURCE_EXPORT',
          sourceSha: process.env.GITHUB_SHA ?? null,
          paths: exportsToCapture,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    throw new Error('AR-13_SOURCE_CHECKPOINT_READY');
  });
});
