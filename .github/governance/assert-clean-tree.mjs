/* global console, process */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function workingTreeStatus(repositoryRoot = process.cwd()) {
  return execFileSync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    { cwd: repositoryRoot, encoding: 'utf8' },
  ).trim();
}

export function assertCleanWorkingTree(repositoryRoot = process.cwd()) {
  const status = workingTreeStatus(repositoryRoot);
  if (status) {
    throw new Error(`Formal validation mutated the checked-out commit:\n${status}`);
  }
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
  console.log(`Working tree is clean at ${head}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) assertCleanWorkingTree();
