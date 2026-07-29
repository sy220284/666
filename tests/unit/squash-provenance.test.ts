import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { verifySquashProvenance } from '../../.github/governance/squash-provenance.mjs';

const temporaryDirectories: string[] = [];

function git(root: string, argumentsList: string[]) {
  return execFileSync('git', argumentsList, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function commitFile(root: string, file: string, content: string, message: string) {
  await writeFile(path.join(root, file), content, 'utf8');
  git(root, ['add', file]);
  git(root, ['commit', '-m', message]);
  return git(root, ['rev-parse', 'HEAD']);
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('squash provenance', () => {
  it('accepts the same reviewed patch on a main branch that advanced independently', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'worldforge-squash-provenance-'));
    temporaryDirectories.push(root);
    git(root, ['init', '-b', 'main']);
    git(root, ['config', 'user.name', 'WorldForge Test']);
    git(root, ['config', 'user.email', 'worldforge@example.invalid']);
    const base = await commitFile(root, 'product.txt', 'before\n', 'base');

    git(root, ['checkout', '-b', 'implementation']);
    const implementationHead = await commitFile(root, 'product.txt', 'after\n', 'implementation');

    git(root, ['checkout', 'main']);
    await commitFile(root, 'audit.txt', 'independent\n', 'independent audit');
    const mainParent = git(root, ['rev-parse', 'HEAD']);
    const mainCommit = await commitFile(root, 'product.txt', 'after\n', 'squash');

    expect(
      verifySquashProvenance({
        repositoryRoot: root,
        implementationHead,
        mainCommit,
        expectedHead: mainCommit,
      }),
    ).toMatchObject({
      method: 'patch-equivalent',
      implementationBase: base,
      mainParent,
    });
  });

  it('rejects a main change that differs from the reviewed implementation patch', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'worldforge-squash-provenance-'));
    temporaryDirectories.push(root);
    git(root, ['init', '-b', 'main']);
    git(root, ['config', 'user.name', 'WorldForge Test']);
    git(root, ['config', 'user.email', 'worldforge@example.invalid']);
    await commitFile(root, 'product.txt', 'before\n', 'base');

    git(root, ['checkout', '-b', 'implementation']);
    const implementationHead = await commitFile(
      root,
      'product.txt',
      'reviewed\n',
      'implementation',
    );

    git(root, ['checkout', 'main']);
    const mainCommit = await commitFile(root, 'product.txt', 'different\n', 'squash');

    expect(() =>
      verifySquashProvenance({
        repositoryRoot: root,
        implementationHead,
        mainCommit,
        expectedHead: mainCommit,
      }),
    ).toThrow(/identical trees or patch-equivalent/u);
  });
});
