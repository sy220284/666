/* global console, process */
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { stageClosureErrors } from '../../scripts/task-control-lib.mjs';

const statePath = 'docs/tasks/ACTIVE_TASK.json';
const indexPath = 'docs/tasks/TASK_INDEX.md';

export function parseTaskRows(markdown) {
  const tasks = new Map();
  const pattern =
    /^\|\s*(M\d-\d{2})\s*\|\s*\[[^\]]+\]\(([^)]+)\)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/gmu;
  for (const match of markdown.matchAll(pattern)) {
    tasks.set(match[1], {
      id: match[1],
      source: path.posix.join('docs/tasks', match[2]),
      dependencyText: match[3].trim(),
      status: match[4].trim(),
    });
  }
  return tasks;
}

function taskBranchFor(task) {
  const cardName = path.posix.basename(task.source, '.md').toLowerCase().replaceAll('_', '-');
  return `work/${cardName}`;
}

function activeNextTaskErrors(headState, headTasks, previousId) {
  const errors = [];
  const next = headState?.activeTask;
  if (!next || next.status !== 'IN_PROGRESS') {
    errors.push('A next task must be active and IN_PROGRESS');
    return errors;
  }
  if (next.id === previousId) errors.push('The transitioned task cannot remain active');
  if (headTasks.get(next.id)?.status !== 'In Progress') {
    errors.push(`TASK_INDEX must mark ${next.id ?? '<missing>'} as In Progress`);
  }
  const indexed = headTasks.get(next.id);
  if (indexed && next.source !== indexed.source) {
    errors.push(`Active task source must match TASK_INDEX for ${next.id}`);
  }
  if (indexed && next.branch !== taskBranchFor(indexed)) {
    errors.push(`Active task branch must be ${taskBranchFor(indexed)}`);
  }
  return errors;
}

export function implementationAdvanceErrors(baseState, headState, headTasks) {
  const errors = [];
  const previous = baseState?.activeTask;
  if (!previous?.id || previous.status !== 'IN_PROGRESS') return errors;

  const snapshot = headState?.lastImplementedTask;
  if (snapshot?.id !== previous.id) {
    errors.push(`lastImplementedTask must record ${previous.id}`);
  } else {
    if (snapshot.source !== previous.source) {
      errors.push('lastImplementedTask source must match the completed task');
    }
    if (snapshot.branch !== previous.branch) {
      errors.push('lastImplementedTask branch must match the completed task');
    }
    if (snapshot.nextTaskId !== headState?.activeTask?.id) {
      errors.push('lastImplementedTask nextTaskId must match the active task');
    }
    if (!Array.isArray(snapshot.allowedPaths) || snapshot.allowedPaths.length === 0) {
      errors.push('lastImplementedTask must preserve the completed task allowedPaths snapshot');
    }
  }
  if (!(headState?.deferredVerification ?? []).some((entry) => entry.id === previous.id)) {
    errors.push(`deferredVerification must include ${previous.id}`);
  }
  if (headTasks.get(previous.id)?.status !== 'Implemented') {
    errors.push(`TASK_INDEX must mark ${previous.id} as Implemented`);
  }
  errors.push(...activeNextTaskErrors(headState, headTasks, previous.id));
  const nextTask = headTasks.get(headState?.activeTask?.id);
  if (nextTask) errors.push(...stageClosureErrors(nextTask, headTasks, headState));
  return errors;
}

export function revalidationReopenErrors(
  baseState,
  headState,
  baseTasks,
  headTasks,
  pullRequestBranch,
) {
  const errors = [];
  const paused = baseState?.activeTask;
  const target = headState?.activeTask;
  if (!paused?.id || paused.status !== 'IN_PROGRESS') return errors;
  if (!target?.id || target.status !== 'IN_PROGRESS' || target.id === paused.id) {
    errors.push('Revalidation reopen must activate a different IN_PROGRESS task');
    return errors;
  }

  if (baseTasks.get(paused.id)?.status !== 'In Progress') {
    errors.push(`Base TASK_INDEX must mark ${paused.id} as In Progress`);
  }
  const baseTargetStatus = baseTasks.get(target.id)?.status;
  if (!['Implemented', 'Verified'].includes(baseTargetStatus)) {
    errors.push(`${target.id} must be Implemented or Verified before revalidation`);
  }
  if (baseTargetStatus === 'Implemented') {
    const deferred = (baseState.deferredVerification ?? []).some((entry) => entry.id === target.id);
    if (!deferred) errors.push(`${target.id} must exist in base deferredVerification`);
  }
  if (headTasks.get(paused.id)?.status !== 'Planned') {
    errors.push(`TASK_INDEX must pause ${paused.id} as Planned`);
  }
  if (headTasks.get(target.id)?.status !== 'In Progress') {
    errors.push(`TASK_INDEX must reopen ${target.id} as In Progress`);
  }
  const targetRow = headTasks.get(target.id);
  if (targetRow && target.source !== targetRow.source) {
    errors.push(`Reopened task source must match TASK_INDEX for ${target.id}`);
  }
  if (targetRow && target.branch !== taskBranchFor(targetRow)) {
    errors.push(`Reopened task branch must be ${taskBranchFor(targetRow)}`);
  }
  if (target.branch !== pullRequestBranch) {
    errors.push('Revalidation PR branch must match the reopened task branch');
  }
  if ((headState.deferredVerification ?? []).some((entry) => entry.id === target.id)) {
    errors.push(`Reopened task ${target.id} must be removed from deferredVerification`);
  }
  if (
    JSON.stringify(headState.lastImplementedTask) !== JSON.stringify(baseState.lastImplementedTask)
  ) {
    errors.push('Revalidation reopen must preserve lastImplementedTask');
  }
  return errors;
}

export function revalidationClosureErrors(
  baseState,
  headState,
  baseTasks,
  headTasks,
  pullRequestBranch,
) {
  const errors = [];
  const verified = baseState?.activeTask;
  if (!verified?.id || verified.status !== 'IN_PROGRESS') return errors;

  if (pullRequestBranch !== verified.branch) {
    errors.push('Revalidation closure PR must use the task branch being verified');
  }
  if (baseTasks.get(verified.id)?.status !== 'In Progress') {
    errors.push(`Base TASK_INDEX must mark ${verified.id} as In Progress`);
  }
  if (headTasks.get(verified.id)?.status !== 'Verified') {
    errors.push(`TASK_INDEX must mark ${verified.id} as Verified`);
  }
  if (headState?.lastVerifiedTask?.id !== verified.id) {
    errors.push(`lastVerifiedTask must record ${verified.id}`);
  }
  if (!/^[0-9a-f]{7,40}$/iu.test(headState?.lastVerifiedTask?.commit ?? '')) {
    errors.push('lastVerifiedTask must reference a committed revision');
  }
  if ((headState?.deferredVerification ?? []).some((entry) => entry.id === verified.id)) {
    errors.push(`Verified task ${verified.id} must be absent from deferredVerification`);
  }
  errors.push(...activeNextTaskErrors(headState, headTasks, verified.id));
  const nextId = headState?.activeTask?.id;
  if (nextId && baseTasks.get(nextId)?.status !== 'Planned') {
    errors.push(`Restored task ${nextId} must be Planned in the base TASK_INDEX`);
  }
  const nextTask = headTasks.get(nextId);
  if (nextTask) errors.push(...stageClosureErrors(nextTask, headTasks, headState));
  return errors;
}

function governanceBranch(branch) {
  return /^(?:policy\/|chore\/governance-|fix\/governance-)/u.test(branch ?? '');
}

export function classifyTransition(baseState, headState, headTasks) {
  const previousId = baseState?.activeTask?.id;
  if (!previousId) return 'none';
  const previousHeadStatus = headTasks.get(previousId)?.status;
  if (headState?.lastImplementedTask?.id === previousId && previousHeadStatus === 'Implemented') {
    return 'implementation-advance';
  }
  if (headState?.lastVerifiedTask?.id === previousId && previousHeadStatus === 'Verified') {
    return 'revalidation-closure';
  }
  if (
    previousHeadStatus === 'Planned' &&
    headState?.activeTask?.id &&
    headState.activeTask.id !== previousId
  ) {
    return 'revalidation-reopen';
  }
  return 'unsupported';
}

async function validateReadyTransition() {
  const baseStatePath = process.env.TASK_BASE_STATE_PATH;
  const baseIndexPath = process.env.TASK_BASE_INDEX_PATH;
  const branch = process.env.TASK_PR_HEAD_REF ?? process.env.GITHUB_HEAD_REF ?? '';
  const draft = process.env.TASK_PR_DRAFT === 'true';
  if (draft || governanceBranch(branch)) {
    console.log(`Ready transition validation skipped for ${branch || 'unknown branch'}.`);
    return;
  }
  if (!baseStatePath || !baseIndexPath) {
    throw new Error('TASK_BASE_STATE_PATH and TASK_BASE_INDEX_PATH are required');
  }

  const baseState = JSON.parse(await readFile(baseStatePath, 'utf8'));
  if (baseState.authorization?.mode !== 'implementation-pr') return;

  const headState = JSON.parse(await readFile(statePath, 'utf8'));
  const [baseTasks, headTasks] = await Promise.all([
    readFile(baseIndexPath, 'utf8').then(parseTaskRows),
    readFile(indexPath, 'utf8').then(parseTaskRows),
  ]);
  const transition = classifyTransition(baseState, headState, headTasks);
  let errors;
  if (transition === 'implementation-advance') {
    errors = implementationAdvanceErrors(baseState, headState, headTasks);
  } else if (transition === 'revalidation-reopen') {
    errors = revalidationReopenErrors(baseState, headState, baseTasks, headTasks, branch);
  } else if (transition === 'revalidation-closure') {
    errors = revalidationClosureErrors(baseState, headState, baseTasks, headTasks, branch);
  } else {
    throw new Error(
      `Ready task PR has an unsupported transition from ${baseState.activeTask?.id ?? '<none>'}`,
    );
  }
  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log(`Task transition is valid: ${transition}.`);
}

function task(id, source, status, dependencyText = '无') {
  return { id, source, status, dependencyText };
}

function selfTest() {
  const pausedId = 'M9-90';
  const targetId = 'M9-91';
  const nextId = 'M9-92';
  const pausedSource = 'docs/tasks/M9/M9-90_PAUSED.md';
  const targetSource = 'docs/tasks/M9/M9-91_TARGET.md';
  const nextSource = 'docs/tasks/M9/M9-92_NEXT.md';
  const baseState = {
    activeTask: {
      id: pausedId,
      status: 'IN_PROGRESS',
      source: pausedSource,
      branch: 'work/m9-90-paused',
    },
    lastImplementedTask: { id: 'M9-89' },
    deferredVerification: [{ id: targetId }],
  };
  const baseTasks = new Map([
    [pausedId, task(pausedId, pausedSource, 'In Progress')],
    [targetId, task(targetId, targetSource, 'Implemented')],
    [nextId, task(nextId, nextSource, 'Planned')],
  ]);

  const advanceState = {
    ...baseState,
    activeTask: {
      id: nextId,
      status: 'IN_PROGRESS',
      source: nextSource,
      branch: 'work/m9-92-next',
    },
    lastImplementedTask: {
      id: pausedId,
      source: pausedSource,
      branch: 'work/m9-90-paused',
      nextTaskId: nextId,
      allowedPaths: ['packages/domain/'],
    },
    deferredVerification: [{ id: targetId }, { id: pausedId }],
  };
  const advanceTasks = new Map(baseTasks);
  advanceTasks.set(pausedId, task(pausedId, pausedSource, 'Implemented'));
  advanceTasks.set(nextId, task(nextId, nextSource, 'In Progress'));
  assert.equal(classifyTransition(baseState, advanceState, advanceTasks), 'implementation-advance');
  assert.deepEqual(implementationAdvanceErrors(baseState, advanceState, advanceTasks), []);

  const reopenState = {
    ...baseState,
    activeTask: {
      id: targetId,
      status: 'IN_PROGRESS',
      source: targetSource,
      branch: 'work/m9-91-target',
    },
    deferredVerification: [],
  };
  const reopenTasks = new Map(baseTasks);
  reopenTasks.set(pausedId, task(pausedId, pausedSource, 'Planned'));
  reopenTasks.set(targetId, task(targetId, targetSource, 'In Progress'));
  assert.equal(classifyTransition(baseState, reopenState, reopenTasks), 'revalidation-reopen');
  assert.deepEqual(
    revalidationReopenErrors(baseState, reopenState, baseTasks, reopenTasks, 'work/m9-91-target'),
    [],
  );

  const closureBaseState = reopenState;
  const closureBaseTasks = reopenTasks;
  const closureState = {
    ...closureBaseState,
    activeTask: {
      id: pausedId,
      status: 'IN_PROGRESS',
      source: pausedSource,
      branch: 'work/m9-90-paused',
    },
    lastVerifiedTask: { id: targetId, commit: '1234567' },
  };
  const closureTasks = new Map(closureBaseTasks);
  closureTasks.set(targetId, task(targetId, targetSource, 'Verified'));
  closureTasks.set(pausedId, task(pausedId, pausedSource, 'In Progress'));
  assert.equal(
    classifyTransition(closureBaseState, closureState, closureTasks),
    'revalidation-closure',
  );
  assert.deepEqual(
    revalidationClosureErrors(
      closureBaseState,
      closureState,
      closureBaseTasks,
      closureTasks,
      'work/m9-91-target',
    ),
    [],
  );

  assert.ok(
    revalidationReopenErrors(
      baseState,
      { ...reopenState, deferredVerification: [{ id: targetId }] },
      baseTasks,
      reopenTasks,
      'work/m9-91-target',
    ).includes(`Reopened task ${targetId} must be removed from deferredVerification`),
  );
  console.log('task transition policy self-test passed');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'self-test') selfTest();
  else await validateReadyTransition();
}
