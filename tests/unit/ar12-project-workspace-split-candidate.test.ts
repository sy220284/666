import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import prettier from 'prettier';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const outputRoot = path.join(root, 'test-results/ar12-project-workspace');
const diagnosticRoot = path.join(root, 'test-results/unit/ar12-project-workspace');

async function exportCandidateDiagnostics(): Promise<void> {
  await rm(diagnosticRoot, { recursive: true, force: true });
  await mkdir(diagnosticRoot, { recursive: true });
  await cp(outputRoot, path.join(diagnosticRoot, 'generated'), { recursive: true });

  for (const relativePath of [
    'scripts/generate-ar12-project-workspace-split.mjs',
    'scripts/typecheck-ar12-project-workspace-split.mjs',
    'tests/unit/ar12-project-workspace-split-candidate.test.ts',
  ]) {
    const sourcePath = path.join(root, relativePath);
    const targetPath = path.join(diagnosticRoot, 'formatted', relativePath);
    const config = (await prettier.resolveConfig(sourcePath)) ?? {};
    const formatted = await prettier.format(await readFile(sourcePath, 'utf8'), {
      ...config,
      filepath: sourcePath,
    });
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, formatted, 'utf8');
  }
}

describe('AR-12 Project Workspace split candidate', () => {
  it('exports the frozen eight-file structure with zero TypeScript diagnostics', async () => {
    const generation = spawnSync(
      process.execPath,
      ['scripts/generate-ar12-project-workspace-split.mjs'],
      { cwd: root, stdio: 'inherit' },
    );
    expect(generation.status).toBe(0);

    const typecheck = spawnSync(
      process.execPath,
      ['scripts/typecheck-ar12-project-workspace-split.mjs'],
      { cwd: root, stdio: 'inherit' },
    );
    await exportCandidateDiagnostics();
    expect(typecheck.status).toBe(0);

    const summaryText = await readFile(path.join(outputRoot, 'summary.json'), 'utf8');
    const diagnostics = await readFile(path.join(outputRoot, 'diagnostics.txt'), 'utf8');
    const summary = JSON.parse(summaryText) as {
      readonly files: readonly string[];
      readonly diagnosticCount: number;
    };

    expect(summary.files).toHaveLength(8);
    expect(summary.diagnosticCount).toBe(0);
    expect(diagnostics.trim()).toBe('');
    expect(summary.files).toEqual([
      'packages/core-service/src/project-workspace.ts',
      'packages/core-service/src/project-workspace/project-workspace-service.ts',
      'packages/core-service/src/project-workspace/project-create.ts',
      'packages/core-service/src/project-workspace/project-open.ts',
      'packages/core-service/src/project-workspace/project-move.ts',
      'packages/core-service/src/project-workspace/workspace-verifier.ts',
      'packages/core-service/src/project-workspace/workspace-path-policy.ts',
      'packages/core-service/src/project-workspace/workspace-manifest.ts',
    ]);
    for (const file of summary.files) {
      expect((await stat(path.join(outputRoot, file))).size).toBeGreaterThan(0);
    }
  });
});
