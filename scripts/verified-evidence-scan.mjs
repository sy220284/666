import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isRuntimeEffectivelyVerified,
  loadCommitStatuses,
} from '../.github/governance/effective-task-status.mjs';
import { validateTaskEvidence } from './evidence-policy.mjs';
import { parseTaskIndex } from './task-control-lib.mjs';

function independentTaskIndex(taskIndexSource) {
  const [section = ''] = taskIndexSource.split(/^## 3\. 被吸收的需求来源\s*$/mu, 1);
  return parseTaskIndex(section);
}

export function effectivelyVerifiedTaskIds(taskIndexSource, runtimes = [], statuses = []) {
  const tasks = independentTaskIndex(taskIndexSource);
  const runtimeById = new Map(
    runtimes
      .filter((runtime) => typeof runtime?.id === 'string')
      .map((runtime) => [runtime.id, runtime]),
  );
  return [...tasks.values()]
    .filter((task) => {
      const runtime = runtimeById.get(task.id);
      return runtime
        ? isRuntimeEffectivelyVerified(runtime, statuses, task.status)
        : task.status === 'Verified';
    })
    .map((task) => task.id)
    .sort((left, right) => left.localeCompare(right, 'en'));
}

function gitHead(repositoryRoot) {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function loadRuntimes(repositoryRoot, directory) {
  const absolute = path.join(repositoryRoot, directory);
  const files = (await readdir(absolute)).filter((file) => file.endsWith('.json')).sort();
  return Promise.all(
    files.map((file) => readFile(path.join(absolute, file), 'utf8').then(JSON.parse)),
  );
}

export async function validateAllVerifiedEvidence(
  repositoryRoot = process.cwd(),
  expectedHead = process.env.EVIDENCE_HEAD_SHA ?? gitHead(repositoryRoot),
) {
  if (!/^[0-9a-f]{40}$/u.test(expectedHead)) {
    throw new Error('Verified evidence scan requires a full expected head SHA');
  }
  const [indexSource, authorizationSource, statuses] = await Promise.all([
    readFile(path.join(repositoryRoot, 'docs', 'tasks', 'TASK_INDEX.md'), 'utf8'),
    readFile(path.join(repositoryRoot, 'docs', 'tasks', 'TASK_AUTHORIZATION.json'), 'utf8'),
    loadCommitStatuses(expectedHead),
  ]);
  const authorization = JSON.parse(authorizationSource);
  const runtimes = await loadRuntimes(repositoryRoot, authorization.taskRuntimeDirectory);
  const taskIds = effectivelyVerifiedTaskIds(indexSource, runtimes, statuses);
  if (taskIds.length === 0) throw new Error('No effectively Verified tasks were found');

  const failures = [];
  for (const taskId of taskIds) {
    try {
      await validateTaskEvidence(taskId, repositoryRoot, {
        final: true,
        expectedHead,
      });
    } catch (error) {
      failures.push(`${taskId}: ${errorMessage(error)}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `Verified evidence scan failed for ${failures.length} task(s):\n- ${failures.join('\n- ')}`,
    );
  }

  console.log(
    `Validated all ${taskIds.length} effectively Verified evidence package(s) at ${expectedHead}.`,
  );
  return taskIds;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await validateAllVerifiedEvidence();
