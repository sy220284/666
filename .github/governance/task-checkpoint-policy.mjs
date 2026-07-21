/* global console, process */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const statePath = 'docs/tasks/ACTIVE_TASK.json';
const indexPath = 'docs/tasks/TASK_INDEX.md';

function normalizeText(value) {
  return value.replaceAll('\r\n', '\n');
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function checkpointErrors(baseState, headState, baseIndexSource, headIndexSource, branch) {
  const errors = [];
  const active = baseState?.activeTask;

  if (!active?.id || active.status !== 'IN_PROGRESS') {
    errors.push('Checkpoint requires an IN_PROGRESS base task');
    return errors;
  }
  if (branch !== active.branch) {
    errors.push(`Checkpoint PR branch must remain ${active.branch}`);
  }
  if (!sameJson(headState?.activeTask, active)) {
    errors.push('Checkpoint must preserve the complete activeTask record');
  }
  if (!sameJson(headState?.lastImplementedTask, baseState?.lastImplementedTask)) {
    errors.push('Checkpoint must preserve lastImplementedTask');
  }
  if (!sameJson(headState?.lastVerifiedTask, baseState?.lastVerifiedTask)) {
    errors.push('Checkpoint must preserve lastVerifiedTask');
  }
  if (!sameJson(headState?.deferredVerification, baseState?.deferredVerification)) {
    errors.push('Checkpoint must preserve deferredVerification');
  }
  if (normalizeText(headIndexSource) !== normalizeText(baseIndexSource)) {
    errors.push('Checkpoint must preserve TASK_INDEX without status or ordering changes');
  }

  return errors;
}

async function validateCheckpoint() {
  const baseStatePath = process.env.TASK_BASE_STATE_PATH;
  const baseIndexPath = process.env.TASK_BASE_INDEX_PATH;
  const branch = process.env.TASK_PR_HEAD_REF ?? process.env.GITHUB_HEAD_REF ?? '';

  if (!baseStatePath || !baseIndexPath) {
    throw new Error('TASK_BASE_STATE_PATH and TASK_BASE_INDEX_PATH are required');
  }

  const [baseStateSource, headStateSource, baseIndexSource, headIndexSource] = await Promise.all([
    readFile(baseStatePath, 'utf8'),
    readFile(statePath, 'utf8'),
    readFile(baseIndexPath, 'utf8'),
    readFile(indexPath, 'utf8'),
  ]);
  const baseState = JSON.parse(baseStateSource);
  if (baseState.authorization?.mode !== 'implementation-pr') return;

  const errors = checkpointErrors(
    baseState,
    JSON.parse(headStateSource),
    baseIndexSource,
    headIndexSource,
    branch,
  );
  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log(`Active task checkpoint is valid for ${baseState.activeTask.id}.`);
}

function selfTest() {
  const baseState = {
    authorization: { mode: 'implementation-pr' },
    activeTask: {
      id: 'M9-90',
      status: 'IN_PROGRESS',
      source: 'docs/tasks/M9/M9-90_CHECKPOINT.md',
      branch: 'work/m9-90-checkpoint',
      allowedPaths: ['packages/domain/'],
    },
    lastImplementedTask: { id: 'M9-89' },
    lastVerifiedTask: { id: 'M9-88' },
    deferredVerification: [{ id: 'M9-89' }],
  };
  const index = '| M9-90 | [x](M9/M9-90_CHECKPOINT.md) | 无 | In Progress |\n';

  assert.deepEqual(
    checkpointErrors(baseState, cloneJson(baseState), index, index, 'work/m9-90-checkpoint'),
    [],
  );
  assert.ok(
    checkpointErrors(baseState, cloneJson(baseState), index, index, 'work/other').includes(
      'Checkpoint PR branch must remain work/m9-90-checkpoint',
    ),
  );
  assert.ok(
    checkpointErrors(
      baseState,
      { ...cloneJson(baseState), deferredVerification: [] },
      index,
      index,
      'work/m9-90-checkpoint',
    ).includes('Checkpoint must preserve deferredVerification'),
  );
  assert.ok(
    checkpointErrors(
      baseState,
      cloneJson(baseState),
      index,
      index.replace('In Progress', 'Implemented'),
      'work/m9-90-checkpoint',
    ).includes('Checkpoint must preserve TASK_INDEX without status or ordering changes'),
  );
  console.log('task checkpoint policy self-test passed');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'self-test') selfTest();
  else await validateCheckpoint();
}
