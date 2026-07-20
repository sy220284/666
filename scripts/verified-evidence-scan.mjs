import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateTaskEvidence } from './evidence-policy.mjs';

export function verifiedTaskIds(taskIndexSource) {
  const tasks = [];
  const rowPattern = /^\|\s*(M\d-\d{2})\s*\|[^\n]*\|\s*Verified\s*\|\s*$/gmu;
  for (const match of taskIndexSource.matchAll(rowPattern)) {
    if (match[1]) tasks.push(match[1]);
  }
  return [...new Set(tasks)].sort((left, right) => left.localeCompare(right, 'en'));
}

function gitHead(repositoryRoot) {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export async function validateAllVerifiedEvidence(
  repositoryRoot = process.cwd(),
  expectedHead = process.env.EVIDENCE_HEAD_SHA ?? gitHead(repositoryRoot),
) {
  if (!/^[0-9a-f]{40}$/u.test(expectedHead)) {
    throw new Error('Verified evidence scan requires a full expected head SHA');
  }
  const indexSource = await readFile(
    path.join(repositoryRoot, 'docs', 'tasks', 'TASK_INDEX.md'),
    'utf8',
  );
  const taskIds = verifiedTaskIds(indexSource);
  if (taskIds.length === 0) throw new Error('No Verified tasks were found in TASK_INDEX');
  for (const taskId of taskIds) {
    await validateTaskEvidence(taskId, repositoryRoot, {
      final: true,
      expectedHead,
    });
  }
  console.log(`Validated all ${taskIds.length} Verified evidence package(s) at ${expectedHead}.`);
  return taskIds;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await validateAllVerifiedEvidence();
