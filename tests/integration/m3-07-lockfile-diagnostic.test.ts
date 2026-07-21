import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();
const rendererPackagePath = path.join(root, 'apps/desktop/renderer/package.json');
const lockfilePath = path.join(root, 'pnpm-lock.yaml');
const artifactPath = path.join(root, 'test-results/integration/pnpm-lock.yaml');

function run(args: readonly string[]): void {
  const result = spawnSync('pnpm', args, {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`pnpm ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
  }
}

describe('M3-07 dependency lock diagnostic', () => {
  it('generates the official pnpm lockfile artifact and then stops the temporary run', async () => {
    const originalPackage = await readFile(rendererPackagePath, 'utf8');
    const originalLock = await readFile(lockfilePath, 'utf8');
    try {
      run([
        '--filter',
        '@worldforge/renderer',
        'add',
        'react@19.2.7',
        'react-dom@19.2.7',
        'zustand@5.0.14',
        '--lockfile-only',
      ]);
      run([
        '--filter',
        '@worldforge/renderer',
        'add',
        '--save-dev',
        '@types/react@19.2.17',
        '@types/react-dom@19.2.3',
        '--lockfile-only',
      ]);
      await mkdir(path.dirname(artifactPath), { recursive: true });
      await writeFile(artifactPath, await readFile(lockfilePath));
    } finally {
      await writeFile(rendererPackagePath, originalPackage);
      await writeFile(lockfilePath, originalLock);
    }
    expect.fail('M3-07 lockfile generated at test-results/integration/pnpm-lock.yaml');
  }, 120_000);
});
