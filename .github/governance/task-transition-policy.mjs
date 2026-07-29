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
    baseState.activeTask.status === 'IMPLEMENTED' &&
    headState?.authorization?.autoActivateNext === false &&
    headState?.activeTask?.id === previousId &&
    headState.activeTask.status === 'VERIFIED_HOLD' &&
    headState?.lastVerifiedTask?.id === previousId &&
    headState?.verificationHold?.taskId === previousId &&
    headTasks.get(previousId)?.status === 'Verified'
  ) {
    return 'verification-hold';
  }
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
    if (
      JSON.stringify(held.forbiddenPaths ?? []) !== JSON.stringify(previous.forbiddenPaths ?? [])
    ) {
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
    if (snapshot.finalTask === true) {
      if (snapshot.nextTaskId !== null) {
        errors.push('Final implementation hold requires nextTaskId=null');
      }
      const unfinished = [...baseTasks.values()].filter(
        (task) => task.id !== previous.id && task.status !== 'Verified',
      );
      if (unfinished.length > 0) {
        errors.push(
          'Final implementation hold requires every earlier task Verified: ' +
            unfinished.map((task) => task.id).join(', '),
        );
      }
    } else if (!snapshot.nextTaskId || snapshot.nextTaskId === previous.id) {
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

export function verificationHoldErrors(
  baseState,
  headState,
  baseTasks,
  headTasks,
  pullRequestBranch,
) {
  const errors = [];
  const previous = baseState?.activeTask;
  const held = headState?.activeTask;
  const hold = headState?.verificationHold;
  const verifiedTasks = hold?.verifiedTasks ?? [];

  if (!previous?.id || previous.status !== 'IMPLEMENTED') {
    return ['Verification hold requires an IMPLEMENTED base task'];
  }
  if (pullRequestBranch !== previous.branch) {
    errors.push('Verification hold PR must use the task branch being verified');
  }
  if (baseTasks.get(previous.id)?.status !== 'Implemented') {
    errors.push(`Base TASK_INDEX must mark ${previous.id} as Implemented`);
  }
  if (held?.id !== previous.id || held?.status !== 'VERIFIED_HOLD') {
    errors.push('Verification hold must preserve the verified task as VERIFIED_HOLD');
  } else {
    for (const field of ['source', 'branch']) {
      if (held[field] !== previous[field]) {
        errors.push(`Verification hold must preserve activeTask.${field}`);
      }
    }
    for (const field of ['allowedPaths', 'forbiddenPaths', 'requiredDocs', 'verification']) {
      if (JSON.stringify(held[field] ?? []) !== JSON.stringify(previous[field] ?? [])) {
        errors.push(`Verification hold must preserve activeTask.${field}`);
      }
    }
  }
  if (headTasks.get(previous.id)?.status !== 'Verified') {
    errors.push(`TASK_INDEX must mark ${previous.id} as Verified`);
  }
  if (headState?.authorization?.autoActivateNext !== false) {
    errors.push('Verification hold requires authorization.autoActivateNext=false');
  }
  if (!hold || hold.taskId !== previous.id) {
    errors.push('verificationHold.taskId must match the verified task');
  }
  if (!Array.isArray(verifiedTasks) || verifiedTasks.length === 0) {
    errors.push('verificationHold.verifiedTasks must list the closed tasks');
  } else {
    if (new Set(verifiedTasks).size !== verifiedTasks.length) {
      errors.push('verificationHold.verifiedTasks must not contain duplicates');
    }
    if (!verifiedTasks.includes(previous.id)) {
      errors.push(`verificationHold.verifiedTasks must include ${previous.id}`);
    }
    for (const taskId of verifiedTasks) {
      if (!['Implemented', 'Verified'].includes(baseTasks.get(taskId)?.status)) {
        errors.push(`${taskId} must be Implemented or Verified in the base`);
      }
      if (headTasks.get(taskId)?.status !== 'Verified') {
        errors.push(`${taskId} must be Verified in the head`);
      }
      if ((headState?.deferredVerification ?? []).some((entry) => entry?.id === taskId)) {
        errors.push(`${taskId} must be absent from deferredVerification`);
      }
    }
  }
  if (hold?.finalTask === true) {
    if (hold.nextTaskId !== null) {
      errors.push('Final verification hold requires nextTaskId=null');
    }
    const unfinished = [...headTasks.values()].filter((task) => task.status !== 'Verified');
    if (unfinished.length > 0) {
      errors.push(
        'Final verification hold requires every task Verified: ' +
          unfinished.map((task) => task.id).join(', '),
      );
    }
    if ((headState?.deferredVerification ?? []).length > 0) {
      errors.push('Final verification hold requires an empty deferredVerification ledger');
    }
  } else if (!hold?.nextTaskId || hold.nextTaskId === previous.id) {
    errors.push('verificationHold.nextTaskId must identify the deferred next task');
  } else {
    if (baseTasks.get(hold.nextTaskId)?.status !== 'Planned') {
      errors.push(`${hold.nextTaskId} must be Planned in the base`);
    }
    if (headTasks.get(hold.nextTaskId)?.status !== 'Planned') {
      errors.push(`${hold.nextTaskId} must remain Planned`);
    }
  }
  if (!String(hold?.reason ?? '').trim()) errors.push('verificationHold.reason is required');
  if (Number.isNaN(Date.parse(hold?.heldAt ?? ''))) {
    errors.push('verificationHold.heldAt must be an ISO datetime');
  }
  if (!Array.isArray(hold?.allowedPaths) || hold.allowedPaths.length === 0) {
    errors.push('verificationHold.allowedPaths must declare closure paths');
  }
  if (headState?.lastVerifiedTask?.id !== previous.id) {
    errors.push(`lastVerifiedTask must record ${previous.id}`);
  }
  for (const field of ['commit', 'evidenceHead']) {
    if (!/^[0-9a-f]{7,40}$/iu.test(headState?.lastVerifiedTask?.[field] ?? '')) {
      errors.push(`lastVerifiedTask.${field} must reference a committed revision`);
    }
  }
  if (
    JSON.stringify(headState.lastImplementedTask) !== JSON.stringify(baseState.lastImplementedTask)
  ) {
    errors.push('Verification hold must preserve lastImplementedTask');
  }

  const mutable = new Set([...verifiedTasks, hold?.nextTaskId].filter(Boolean));
  for (const [id, baseTask] of baseTasks.entries()) {
    if (mutable.has(id)) continue;
    if (headTasks.get(id)?.status !== baseTask.status) {
      errors.push(`${id} status must not change during verification hold`);
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
  if (transition === 'verification-hold') {
    errors = verificationHoldErrors(baseState, headState, baseTasks, headTasks, branch);
  } else if (transition === 'implementation-hold') {
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
      requiredDocs: ['AGENTS.md'],
      verification: ['pnpm test'],
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
    implementationHoldErrors(baseState, holdState, baseTasks, holdTasks, 'work/m9-90-current'),
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
  const finalBaseTasks = new Map([
    ['M9-89', { id: 'M9-89', source: 'docs/tasks/M9/M9-89_PREVIOUS.md', status: 'Verified' }],
    [currentId, { id: currentId, source: currentSource, status: 'In Progress' }],
  ]);
  const finalHoldTasks = new Map(finalBaseTasks);
  finalHoldTasks.set(currentId, {
    id: currentId,
    source: currentSource,
    status: 'Implemented',
  });
  const finalHoldState = {
    ...holdState,
    lastImplementedTask: {
      ...holdState.lastImplementedTask,
      nextTaskId: null,
      finalTask: true,
    },
  };
  assert.deepEqual(
    implementationHoldErrors(
      baseState,
      finalHoldState,
      finalBaseTasks,
      finalHoldTasks,
      'work/m9-90-current',
    ),
    [],
  );

  const implementedBase = {
    ...holdState,
    activeTask: { ...holdState.activeTask, status: 'IMPLEMENTED' },
    deferredVerification: [
      { id: currentId, implementationCommit: '1234567' },
      { id: 'M9-89', implementationCommit: '7654321' },
    ],
  };
  const implementedTasks = new Map([
    ['M9-89', { id: 'M9-89', source: 'docs/tasks/M9/M9-89_PREVIOUS.md', status: 'Implemented' }],
    [currentId, { id: currentId, source: currentSource, status: 'Implemented' }],
    [nextId, { id: nextId, source: nextSource, status: 'Planned' }],
  ]);
  const verifiedState = {
    ...implementedBase,
    activeTask: { ...implementedBase.activeTask, status: 'VERIFIED_HOLD' },
    deferredVerification: [],
    lastVerifiedTask: { id: currentId, commit: 'abcdef1', evidenceHead: 'abcdef1' },
    verificationHold: {
      taskId: currentId,
      verifiedTasks: ['M9-89', currentId],
      nextTaskId: nextId,
      heldAt: '2026-07-25T13:30:00.000Z',
      reason: 'author hold',
      allowedPaths: ['docs/tasks/'],
      forbiddenPaths: [],
    },
  };
  const verifiedTasks = new Map(implementedTasks);
  verifiedTasks.set('M9-89', {
    id: 'M9-89',
    source: 'docs/tasks/M9/M9-89_PREVIOUS.md',
    status: 'Verified',
  });
  verifiedTasks.set(currentId, { id: currentId, source: currentSource, status: 'Verified' });
  assert.equal(
    classifyTransition(implementedBase, verifiedState, verifiedTasks),
    'verification-hold',
  );
  assert.deepEqual(
    verificationHoldErrors(
      implementedBase,
      verifiedState,
      implementedTasks,
      verifiedTasks,
      'work/m9-90-current',
    ),
    [],
  );
  assert.ok(
    verificationHoldErrors(
      implementedBase,
      { ...verifiedState, deferredVerification: [{ id: currentId }] },
      implementedTasks,
      verifiedTasks,
      'work/m9-90-current',
    ).includes(`${currentId} must be absent from deferredVerification`),
  );
  const finalVerifiedBase = {
    ...implementedBase,
    deferredVerification: [{ id: currentId, implementationCommit: '1234567' }],
  };
  const finalVerifiedBaseTasks = new Map([
    ['M9-89', { id: 'M9-89', source: 'docs/tasks/M9/M9-89_PREVIOUS.md', status: 'Verified' }],
    [currentId, { id: currentId, source: currentSource, status: 'Implemented' }],
  ]);
  const finalVerifiedTasks = new Map(finalVerifiedBaseTasks);
  finalVerifiedTasks.set(currentId, {
    id: currentId,
    source: currentSource,
    status: 'Verified',
  });
  const finalVerifiedState = {
    ...verifiedState,
    verificationHold: {
      ...verifiedState.verificationHold,
      verifiedTasks: ['M9-89', currentId],
      finalTask: true,
      nextTaskId: null,
    },
  };
  assert.deepEqual(
    verificationHoldErrors(
      finalVerifiedBase,
      finalVerifiedState,
      finalVerifiedBaseTasks,
      finalVerifiedTasks,
      'work/m9-90-current',
    ),
    [],
  );
  console.log('implementation and verification hold transition self-tests passed');
}

if (process.argv[1] === currentFile) {
  if (process.argv[2] === 'self-test') selfTestHold();
  else await validateReadyTransition();
}
