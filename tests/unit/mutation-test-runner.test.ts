import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  MutationSurvivedError,
  replaceExactlyOnce,
  runMutationSuite,
  validateMutationMatrix,
} from '../../scripts/mutation-test.mjs';

const temporaryDirectories: string[] = [];

async function createFixture(source = 'const guard = true;\n'): Promise<{
  readonly root: string;
  readonly sourcePath: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-mutation-runner-'));
  temporaryDirectories.push(root);
  const sourcePath = path.join(root, 'src', 'guard.ts');
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, source, 'utf8');
  return { root, sourcePath };
}

const matrix = {
  schemaVersion: 1,
  mutants: [
    {
      id: 'guard-disabled',
      sourcePath: 'src/guard.ts',
      search: 'guard = true',
      replacement: 'guard = false',
      tests: ['tests/guard.test.ts'],
    },
  ],
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('targeted mutation runner', () => {
  it('requires a green baseline, kills the mutant, and restores the source byte-for-byte', async () => {
    const fixture = await createFixture();
    const calls: string[] = [];
    const report = await runMutationSuite({
      repositoryRoot: fixture.root,
      matrix,
      writeReport: false,
      executeTests: async (_tests, mutantId) => {
        calls.push(mutantId);
        const source = await readFile(fixture.sourcePath, 'utf8');
        if (mutantId === 'baseline') {
          expect(source).toContain('guard = true');
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        expect(source).toContain('guard = false');
        return { exitCode: 1, stdout: 'expected failure', stderr: '' };
      },
    });

    expect(calls).toEqual(['baseline', 'guard-disabled']);
    expect(report).toMatchObject({ killed: 1, survived: 0 });
    expect(await readFile(fixture.sourcePath, 'utf8')).toBe('const guard = true;\n');
  });

  it('fails when a mutant survives and still restores the source', async () => {
    const fixture = await createFixture();
    await expect(
      runMutationSuite({
        repositoryRoot: fixture.root,
        matrix,
        writeReport: false,
        executeTests: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      }),
    ).rejects.toBeInstanceOf(MutationSurvivedError);
    expect(await readFile(fixture.sourcePath, 'utf8')).toBe('const guard = true;\n');
  });

  it('fails closed when mutation search text is absent or duplicated', () => {
    expect(() => replaceExactlyOnce('alpha', 'beta', 'gamma', 'missing')).toThrow(/not found/u);
    expect(() => replaceExactlyOnce('guard guard', 'guard', 'mutant', 'duplicate')).toThrow(
      /exactly once/u,
    );
  });

  it('rejects unsafe matrix paths and duplicate ids', () => {
    expect(() =>
      validateMutationMatrix({
        schemaVersion: 1,
        mutants: [{ ...matrix.mutants[0], sourcePath: '../escape.ts' }],
      }),
    ).toThrow(/escape/u);
    expect(() =>
      validateMutationMatrix({
        schemaVersion: 1,
        mutants: [matrix.mutants[0], matrix.mutants[0]],
      }),
    ).toThrow(/duplicated/u);
  });
});
