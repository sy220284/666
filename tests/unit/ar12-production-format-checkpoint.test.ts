import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import prettier from 'prettier';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const outputRoot = path.join(root, 'test-results/unit/ar12-production-format');
const files = [
  'packages/core-service/src/project-workspace.ts',
  'packages/core-service/src/project-workspace/project-workspace-service.ts',
  'packages/core-service/src/project-workspace/project-create.ts',
  'packages/core-service/src/project-workspace/project-open.ts',
  'packages/core-service/src/project-workspace/project-move.ts',
  'packages/core-service/src/project-workspace/workspace-verifier.ts',
  'packages/core-service/src/project-workspace/workspace-path-policy.ts',
  'packages/core-service/src/project-workspace/workspace-manifest.ts',
] as const;

describe('AR-12 production formatting checkpoint', () => {
  it('exports the eight production files using the repository Prettier configuration', async () => {
    await rm(outputRoot, { recursive: true, force: true });
    for (const relativePath of files) {
      const sourcePath = path.join(root, relativePath);
      const targetPath = path.join(outputRoot, relativePath);
      const config = (await prettier.resolveConfig(sourcePath)) ?? {};
      const formatted = await prettier.format(await readFile(sourcePath, 'utf8'), {
        ...config,
        filepath: sourcePath,
      });
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, formatted, 'utf8');
      expect(formatted.length).toBeGreaterThan(0);
    }
    throw new Error('AR-12 production formatting artifact checkpoint.');
  });
});
