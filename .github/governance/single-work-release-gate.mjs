/* global console, process */
import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCommitStatuses, isRuntimeEffectivelyVerified } from './effective-task-status.mjs';

const root = process.cwd();

function currentCommit() {
  if (/^[0-9a-f]{40}$/iu.test(process.env.GITHUB_SHA ?? '')) return process.env.GITHUB_SHA;
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export async function validateSingleWorkRelease(repositoryRoot = root) {
  const authorization = JSON.parse(
    await readFile(path.join(repositoryRoot, 'docs/tasks/TASK_AUTHORIZATION.json'), 'utf8'),
  );
  if (
    authorization.schemaVersion !== 2 ||
    authorization.mode !== 'single-work-pr' ||
    authorization.baseBranch !== 'main' ||
    authorization.workBranch !== 'work' ||
    authorization.mainWriteMode !== 'serialized'
  ) {
    throw new Error('Single work authorization is invalid');
  }

  const commitSha = currentCommit();
  const statuses = await loadCommitStatuses(commitSha);
  const directory = path.join(repositoryRoot, authorization.taskRuntimeDirectory);
  const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();
  if (files.length === 0) throw new Error('No task runtime files were found');

  const unfinished = [];
  for (const file of files) {
    const task = JSON.parse(await readFile(path.join(directory, file), 'utf8'));
    if (task.releaseBlocking === false) continue;
    if (!isRuntimeEffectivelyVerified(task, statuses)) {
      unfinished.push(`${task.id ?? file}:${task.status ?? 'missing'}`);
    }
  }
  if (unfinished.length > 0) {
    throw new Error(`Single work release gate blocked by ${unfinished.join(', ')}`);
  }
  console.log(
    `Single work release gate passed for ${files.length} runtime task(s) on ${commitSha}.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await validateSingleWorkRelease();
