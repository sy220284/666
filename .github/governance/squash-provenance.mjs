import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

function git(repositoryRoot, argumentsList, options = {}) {
  return execFileSync('git', argumentsList, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

function commitTree(repositoryRoot, commit) {
  try {
    return git(repositoryRoot, ['rev-parse', `${commit}^{tree}`]);
  } catch (error) {
    throw new Error(`Cannot resolve commit tree for ${commit}`, { cause: error });
  }
}

function assertCommitAncestor(repositoryRoot, ancestor, descendant, label) {
  try {
    git(repositoryRoot, ['merge-base', '--is-ancestor', ancestor, descendant]);
  } catch (error) {
    throw new Error(`${label} must be an ancestor of the expected Head`, { cause: error });
  }
}

function singleParent(repositoryRoot, commit) {
  const parents = git(repositoryRoot, ['show', '-s', '--format=%P', commit])
    .split(/\s+/u)
    .filter(Boolean);
  if (parents.length !== 1) {
    throw new Error('Patch-equivalent squash provenance requires a single-parent main commit');
  }
  return parents[0];
}

function diffBuffer(repositoryRoot, base, head) {
  return execFileSync(
    'git',
    ['diff', '--binary', '--full-index', '--no-ext-diff', '--no-renames', base, head],
    {
      cwd: repositoryRoot,
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function stablePatchId(repositoryRoot, diff) {
  if (diff.byteLength === 0) {
    throw new Error('Patch-equivalent squash provenance requires a non-empty change');
  }
  const result = spawnSync('git', ['patch-id', '--stable'], {
    cwd: repositoryRoot,
    input: diff,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(`Cannot calculate stable patch id: ${result.stderr.trim()}`);
  }
  const patchId = result.stdout.trim().split(/\s+/u)[0];
  if (!/^[0-9a-f]{40}$/u.test(patchId ?? '')) {
    throw new Error('Stable patch id is missing or invalid');
  }
  return patchId;
}

export function verifySquashProvenance({
  repositoryRoot,
  implementationHead,
  mainCommit,
  expectedHead,
}) {
  assertCommitAncestor(repositoryRoot, mainCommit, expectedHead, 'mainCommit');
  const implementationTree = commitTree(repositoryRoot, implementationHead);
  const mainTree = commitTree(repositoryRoot, mainCommit);

  if (implementationTree === mainTree) {
    return {
      method: 'identical-tree',
      implementationHead,
      mainCommit,
      implementationTree,
      mainTree,
    };
  }

  const mainParent = singleParent(repositoryRoot, mainCommit);
  const implementationBase = git(repositoryRoot, ['merge-base', implementationHead, mainParent]);
  assertCommitAncestor(
    repositoryRoot,
    implementationBase,
    implementationHead,
    'implementationBase',
  );
  assertCommitAncestor(repositoryRoot, implementationBase, mainParent, 'implementationBase');

  const implementationDiff = diffBuffer(repositoryRoot, implementationBase, implementationHead);
  const mainDiff = diffBuffer(repositoryRoot, mainParent, mainCommit);
  const implementationPatchId = stablePatchId(repositoryRoot, implementationDiff);
  const mainPatchId = stablePatchId(repositoryRoot, mainDiff);
  const implementationDiffSha256 = sha256(implementationDiff);
  const mainDiffSha256 = sha256(mainDiff);
  if (implementationPatchId !== mainPatchId || implementationDiffSha256 !== mainDiffSha256) {
    throw new Error(
      'Squash provenance requires identical trees or patch-equivalent implementation and main changes',
    );
  }

  return {
    method: 'patch-equivalent',
    implementationHead,
    mainCommit,
    implementationTree,
    mainTree,
    implementationBase,
    mainParent,
    implementationPatchId,
    mainPatchId,
    implementationDiffSha256,
    mainDiffSha256,
  };
}
