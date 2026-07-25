/* global console, process */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import * as core from './task-transition-policy-core.mjs';

export * from './task-transition-policy-core.mjs';

const statePath = 'docs/tasks/ACTIVE_TASK.json';
const indexPath = 'docs/tasks/TASK_INDEX.md';
const currentFile = fileURLToPath(import.meta.url);
const coreFile = path.join(path.dirname(currentFile), 'task-transition-policy-core.mjs');

function governanceBranch(branch) {
  return /^(?:policy\/|chore\/governance-|fix\/governance-)/u.test(branch ?? '');
}

export function classifyTransition(baseState, headState, headTasks) {
  const previousId = baseState?.activeTask?.id;
  if (
    previousId &&
    baseState.activeTask.status === 'IN_PROGRESS' &&
    headState?.authorization?.autoActivateNext === false &&
    headState?.activeTask?.id === previousId &&
    headState.activeTask.status === 'IMPLEMENTED' &&
    headState?.lastImplementedTask?.id === previousId &&
    headState.lastImplementedTask.activationDeferred === true &&
    headTasks.get(previousId)?.status === 'Implemented'
  ) {
    return 'implementation-hold';
  }
  return core.classifyTransition(baseState, headState, headTasks);
}

export function implementationHoldErrors(
  baseState,
  headState,
  baseTasks,
  headTasks,
  pullRequestBranch,
) {
  const errors = [];
  const previous = baseState?.activeTask;
  const held = headState?.activeTask;
  const snapshot = headState?.lastImplementedTask;

  if (!previous?.id || previous.status !== 'IN_PROGRESS') {
    return ['Implementation hold requires an IN_PROGRESS base task'];
  }
  if (pullRequestBranch !== previous.branch) {
    errors.push('Implementation hold PR must use the completed task branch');
  }
  if (baseTasks.get(previous.id)?.status !== 'In Progress') {
    errors.push(`Base TASK_INDEX must mark ${previous.id} as In Progress`);
  }
  if (held?.id !== previous.id || held?.status !== 'IMPLEMENTED') {
    errors.push('Implementation hold must keep the completed task active as IMPLEMENTED');
  } else {
    if (held.source !== previous.source) {
      errors.push('Held active task source must match the completed task');
    }
    if (held.branch !== previous.branch) {
      errors.push('Held active task branch must match the completed task');
    }
    if (JSON.stringify(held.allowedPaths) !== JSON.stringify(previous.allowedPaths)) {
      errors.push('Held active task must preserve allowedPaths');
    }
    if (JSON.stringify(held.forbiddenPaths ?? []) !== JSON.stringify(previous.forbiddenPaths ?? [])) {
      errors.push('Held active task must preserve forbiddenPaths');
    }
  }
  if (headTasks.get(previous.id)?.status !== 'Implemented') {
    errors.push(`TASK_INDEX must mark ${previous.id} as Implemented`);
  }
  if (headState?.authorization?.autoActivateNext !== false) {
    errors.push('Implementation hold requires authorization.autoActivateNext=false');
  }
  if (snapshot?.id !== previous.id) {
    errors.push(`lastImplementedTask must record ${previous.id}`);
  } else {
    if (snapshot.source !== previous.source) {
      errors.push('lastImplementedTask source must match the completed task');
    }
    if (snapshot.branch !== previous.branch) {
      errors.push('lastImplementedTask branch must match the completed task');
    }
    if (!/^[0-9a-f]{7,40}$/iu.test(snapshot.commit ?? '')) {
      errors.push('lastImplementedTask must reference a committed revision');
    }
    if (!Array.isArray(snapshot.allowedPaths) || snapshot.allowedPaths.length === 0) {
      errors.push('lastImplementedTask must preserve the completed task allowedPaths snapshot');
    }
    if (JSON.stringify(snapshot.allowedPaths) !== JSON.stringify(previous.allowedPaths)) {
      errors.push('lastImplementedTask allowedPaths must match the completed task snapshot');
    }
    if (snapshot.activationDeferred !== true) {
      errors.push('lastImplementedTask must record activationDeferred=true');
    }
    if (!String(snapshot.activationDeferredReason ?? '').trim()) {
      errors.push('lastImplementedTask must record an activation deferral reason');
    }
    if (!snapshot.nextTaskId || snapshot.nextTaskId === previous.id) {
      errors.push('lastImplementedTask must identify the deferred next task');
    } else {
      if (baseTasks.get(snapshot.nextTaskId)?.status !== 'Planned') {
        errors.push(`Deferred next task ${snapshot.nextTaskId} must be Planned in the base`);
      }
      if (headTasks.get(snapshot.nextTaskId)?.status !== 'Planned') {
        errors.push(`Deferred next task ${snapshot.nextTaskId} must remain Planned`);
      }
    }
  }

  const deferred = (headState?.deferredVerification ?? []).find(
    (entry) => entry?.id === previous.id,
  );
  if (!deferred) {
    errors.push(`deferredVerification must include ${previous.id}`);
  } else if (snapshot?.commit && deferred.implementationCommit !== snapshot.commit) {
    errors.push('Deferred verification commit must match lastImplementedTask.commit');
  }

  for (const [id, baseTask] of baseTasks.entries()) {
    if (id === previous.id) continue;
    if (headTasks.get(id)?.status !== baseTask.status) {
      errors.push(`${id} status must not change during implementation hold`);
    }
  }
  return errors;
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
    readFile(baseIndexPath, 'utf8').then(core.parseTaskRows),
    readFile(indexPath, 'utf8').then(core.parseTaskRows),
  ]);
  const transition = classifyTransition(baseState, headState, headTasks);
  let errors;
  if (transition === 'implementation-hold') {
    errors = implementationHoldErrors(baseState, headState, baseTasks, headTasks, branch);
  } else if (transition === 'implementation-advance') {
    errors = core.implementationAdvanceErrors(baseState, headState, headTasks);
  } else if (transition === 'revalidation-reopen') {
    errors = core.revalidationReopenErrors(baseState, headState, baseTasks, headTasks, branch);
  } else if (transition === 'revalidation-closure') {
    errors = core.revalidationClosureErrors(baseState, headState, baseTasks, headTasks, branch);
  } else if (transition === 'm3-batch-closure') {
    errors = core.m3BatchClosureErrors(baseState, headState, baseTasks, headTasks, branch);
  } else {
    throw new Error(
      `Ready task PR has an unsupported transition from ${baseState.activeTask?.id ?? '<none>'}`,
    );
  }
  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log(`Task transition is valid: ${transition}.`);
}

function selfTestHold() {
  execFileSync(process.execPath, [coreFile, 'self-test'], { stdio: 'inherit' });
  const currentId = 'M9-90';
  const nextId = 'M9-91';
  const currentSource = 'docs/tasks/M9/M9-90_CURRENT.md';
  const nextSource = 'docs/tasks/M9/M9-91_NEXT.md';
  const baseState = {
    authorization: { mode: 'implementation-pr', autoActivateNext: true },
    activeTask: {
      id: currentId,
      status: 'IN_PROGRESS',
      source: currentSource,
      branch: 'work/m9-90-current',
      allowedPaths: ['packages/domain/'],
      forbiddenPaths: [],
    },
    lastImplementedTask: { id: 'M9-89' },
    deferredVerification: [],
  };
  const baseTasks = new Map([
    [currentId, { id: currentId, source: currentSource, status: 'In Progress' }],
    [nextId, { id: nextId, source: nextSource, status: 'Planned' }],
  ]);
  const holdState = {
    ...baseState,
    authorization: { ...baseState.authorization, autoActivateNext: false },
    activeTask: { ...baseState.activeTask, status: 'IMPLEMENTED' },
    lastImplementedTask: {
      id: currentId,
      commit: '1234567',
      source: currentSource,
      branch: 'work/m9-90-current',
      nextTaskId: nextId,
      activationDeferred: true,
      activationDeferredReason: 'author hold',
      allowedPaths: ['packages/domain/'],
      forbiddenPaths: [],
    },
    deferredVerification: [{ id: currentId, implementationCommit: '1234567' }],
  };
  const holdTasks = new Map(baseTasks);
  holdTasks.set(currentId, { id: currentId, source: currentSource, status: 'Implemented' });
  assert.equal(classifyTransition(baseState, holdState, holdTasks), 'implementation-hold');
  assert.deepEqual(
    implementationHoldErrors(
      baseState,
      holdState,
      baseTasks,
      holdTasks,
      'work/m9-90-current',
    ),
    [],
  );
  assert.ok(
    implementationHoldErrors(
      baseState,
      { ...holdState, authorization: { ...holdState.authorization, autoActivateNext: true } },
      baseTasks,
      holdTasks,
      'work/m9-90-current',
    ).includes('Implementation hold requires authorization.autoActivateNext=false'),
  );
  console.log('implementation hold transition self-test passed');
}

if (process.argv[1] === currentFile) {
  if (process.argv[2] === 'self-test') selfTestHold();
  else await validateReadyTransition();
}
