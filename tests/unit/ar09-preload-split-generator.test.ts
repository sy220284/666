import { spawnSync } from 'node:child_process';
import { copyFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const outputDirectory = path.resolve('test-results/unit/ar09-generated/apps/desktop/preload/src');

describe('AR-09 preload split generator', () => {
  it('exports a formatted and typechecked split for review', () => {
    rmSync(path.resolve('test-results/unit/ar09-generated'), { force: true, recursive: true });
    const generated = spawnSync(
      process.execPath,
      ['scripts/ar09-generate-preload-split.mjs', outputDirectory],
      { encoding: 'utf8' },
    );
    expect(generated.status, `${generated.stdout}\n${generated.stderr}`).toBe(0);

    copyFileSync(
      path.resolve('apps/desktop/preload/src/lifecycle-bridge.ts'),
      path.join(outputDirectory, 'lifecycle-bridge.ts'),
    );
    const baseConfig = path
      .relative(outputDirectory, path.resolve('tsconfig.base.json'))
      .replaceAll('\\', '/');
    writeFileSync(
      path.join(outputDirectory, 'tsconfig.json'),
      `${JSON.stringify(
        {
          extends: baseConfig,
          compilerOptions: {
            noEmit: true,
            outDir: './dist',
            rootDir: '.',
            types: ['node'],
          },
          include: ['./*.ts'],
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    const typechecked = spawnSync(
      'pnpm',
      ['exec', 'tsc', '-p', path.join(outputDirectory, 'tsconfig.json')],
      { encoding: 'utf8' },
    );
    expect(typechecked.status, `${typechecked.stdout}\n${typechecked.stderr}`).toBe(0);
    throw new Error('AR09_TYPECHECKED_OUTPUT_READY');
  });
});
