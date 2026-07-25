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

function m3Rows(tasks) {
  return [...tasks.values()].filter((task) => task.id.startsWith('M3-'));
}

function allM3Verified(tasks) {
  const rows = m3Rows(tasks);
  return rows.length > 0 && rows.every((task) => task.status === 'Verified');
}

export function m3BatchClosureErrors(
  baseState,
  headState,
  baseTasks,
  headTasks,
  pullRequestBranch,
) {
  const errors = [];
  const active = baseState?.activeTask;
  if (active?.id !== 'M3-01' || active.status !== 'IN_PROGRESS') {
    errors.push('M3 batch closure requires M3-01 as the active revalidation task');
    return errors;
  }
  if (pullRequestBranch !== active.branch) {
    errors.push('M3 batch closure PR must use the M3-01 revalidation branch');
  }
  if (baseTasks.get('M3-01')?.status !== 'In Progress') {
    errors.push('Base TASK_INDEX must mark M3-01 as In Progress');
  }
  if (baseTasks.get('M4-01')?.status !== 'Planned') {
    errors.push('Base TASK_INDEX must mark M4-01 as Planned');
  }

  const baseM3 = m3Rows(baseTasks);
  const headM3 = m3Rows(headTasks);
  if (baseM3.length === 0 || headM3.length !== baseM3.length) {
    errors.push('M3 batch closure must preserve the complete indexed M3 task set');
  }
  for (const task of headM3) {
    if (task.status !== 'Verified') errors.push(`${task.id} must be Verified in M3 batch closure`);
  }

  const deferredM3 = (headState?.deferredVerification ?? [])
    .map((entry) => entry?.id)
    .filter((id) => typeof id === 'string' && id.startsWith('M3-'));
  if (deferredM3.length > 0) {
    errors.push(`M3 batch closure must clear deferredVerification: ${deferredM3.join(', ')}`);
  }

  const baseDeferredM307 = (baseState?.deferredTasks ?? []).find(
    (entry) => entry?.id === 'M3-07',
  );
  if (baseDeferredM307?.status !== 'Deferred' || baseDeferredM307?.absorbedBy !== 'M3-08') {
    errors.push('M3-07 must be a Deferred task absorbed by M3-08 before batch closure');
  }
  if ((headState?.deferredTasks ?? []).some((entry) => entry?.id === 'M3-07')) {
    errors.push('M3 batch closure must remove M3-07 from deferredTasks');
  }
  if (headTasks.get('M3-07')?.status !== 'Verified') {
    errors.push('M3-07 must be Verified using M3-08 absorbed evidence');
  }
  if (headTasks.get('M3-08')?.status !== 'Verified') {
    errors.push('M3-08 must be Verified before absorbed M3-07 can close');
  }

  if (headState?.lastVerifiedTask?.id !== 'M3-10') {
    errors.push('M3 batch closure lastVerifiedTask must record M3-10');
  }
  if (!/^[0-9a-f]{7,40}$/iu.test(headState?.lastVerifiedTask?.commit ?? '')) {
    errors.push('M3 batch closure lastVerifiedTask must reference a committed revision');
  }
  if (
    JSON.stringify(headState.lastImplementedTask) !== JSON.stringify(baseState.lastImplementedTask)
  ) {
    errors.push('M3 batch closure must preserve lastImplementedTask');
  }

  for (const [id, baseTask] of baseTasks.entries()) {
    if (id.startsWith('M3-') || id === 'M4-01') continue;
    if (headTasks.get(id)?.status !== baseTask.status) {
      errors.push(`${id} status must not change during M3 batch closure`);
    }
  }

  errors.push(...activeNextTaskErrors(headState, headTasks, active.id));
  if (headState?.activeTask?.id !== 'M4-01') {
    errors.push('M3 batch closure must activate M4-01');
  }
  const nextTask = headTasks.get(headState?.activeTask?.id);
  if (nextTask) errors.push(...stageClosureErrors(nextTask, headTasks, headState));
  return errors;
}

function governanceBranch(branch) {
  return /^(?:policy\/|chore\/governance-|fix\/governance-)/u.test(branch ?? '');
}

export function classifyTransition(baseState, headState, headTasks) {
  const previousId = baseState?.activeTask?.id;
  if (!previousId) return 'none';
  if (
    previousId === 'M3-01' &&
    headState?.activeTask?.id === 'M4-01' &&
    headState?.lastVerifiedTask?.id === 'M3-10' &&
    allM3Verified(headTasks)
  ) {
    return 'm3-batch-closure';
  }
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
  } else if (transition === 'm3-batch-closure') {
    errors = m3BatchClosureErrors(baseState, headState, baseTasks, headTasks, branch);
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

  const m3Task = (id, status) =>
    task(id, `docs/tasks/M3/${id}_TASK.md`, status, id === 'M3-01' ? 'M2' : 'M3-01');
  const m3BaseTasks = new Map([
    ['M3-01', m3Task('M3-01', 'In Progress')],
    ['M3-02', m3Task('M3-02', 'Verified')],
    ['M3-03', m3Task('M3-03', 'Implemented')],
    ['M3-04', m3Task('M3-04', 'Verified')],
    ['M3-05', m3Task('M3-05', 'Implemented')],
    ['M3-06', m3Task('M3-06', 'Implemented')],
    ['M3-07', m3Task('M3-07', 'Deferred')],
    ['M3-08', m3Task('M3-08', 'Implemented')],
    ['M3-09', m3Task('M3-09', 'Implemented')],
    ['M3-10', m3Task('M3-10', 'Implemented')],
    [
      'M4-01',
      task('M4-01', 'docs/tasks/M4/M4-01_FTS_INDEX_DICTIONARY.md', 'Planned', 'M3'),
    ],
  ]);
  const m3BaseState = {
    activeTask: {
      id: 'M3-01',
      status: 'IN_PROGRESS',
      source: m3BaseTasks.get('M3-01').source,
      branch: 'work/m3-01-task',
    },
    lastImplementedTask: { id: 'M3-10' },
    deferredVerification: [
      { id: 'M3-03' },
      { id: 'M3-05' },
      { id: 'M3-06' },
      { id: 'M3-08' },
      { id: 'M3-09' },
      { id: 'M3-10' },
    ],
    deferredTasks: [{ id: 'M3-07', status: 'Deferred', absorbedBy: 'M3-08' }],
  };
  const m3ClosedTasks = new Map(m3BaseTasks);
  for (const id of [...m3ClosedTasks.keys()].filter((id) => id.startsWith('M3-'))) {
    const row = m3ClosedTasks.get(id);
    m3ClosedTasks.set(id, { ...row, status: 'Verified' });
  }
  m3ClosedTasks.set('M4-01', {
    ...m3ClosedTasks.get('M4-01'),
    status: 'In Progress',
  });
  const m3ClosedState = {
    ...m3BaseState,
    activeTask: {
      id: 'M4-01',
      status: 'IN_PROGRESS',
      source: m3ClosedTasks.get('M4-01').source,
      branch: 'work/m4-01-fts-index-dictionary',
    },
    deferredVerification: [],
    deferredTasks: [],
    lastVerifiedTask: { id: 'M3-10', commit: '1234567' },
  };
  assert.equal(
    classifyTransition(m3BaseState, m3ClosedState, m3ClosedTasks),
    'm3-batch-closure',
  );
  assert.deepEqual(
    m3BatchClosureErrors(
      m3BaseState,
      m3ClosedState,
      m3BaseTasks,
      m3ClosedTasks,
      'work/m3-01-task',
    ),
    [],
  );
  assert.ok(
    m3BatchClosureErrors(
      m3BaseState,
      { ...m3ClosedState, deferredVerification: [{ id: 'M3-09' }] },
      m3BaseTasks,
      m3ClosedTasks,
      'work/m3-01-task',
    ).some((error) => error.includes('clear deferredVerification')),
  );

  console.log('task transition policy self-test passed');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'self-test') selfTest();
  else await validateReadyTransition();
}
