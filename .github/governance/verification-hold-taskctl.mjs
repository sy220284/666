/* global console, process */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  isGovernanceOnlyPullRequest,
  parseTaskIndex,
  renderActiveTask,
  validateChangedPaths,
} from '../../scripts/task-control-lib.mjs';

const root = process.cwd();
const currentFile = fileURLToPath(import.meta.url);
const statePath = 'docs/tasks/ACTIVE_TASK.json';
const indexPath = 'docs/tasks/TASK_INDEX.md';
const mirrorPath = 'docs/tasks/ACTIVE_TASK.md';

function git(argumentsList) {
  return execFileSync('git', argumentsList, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function delegate(argumentsList) {
  execFileSync(process.execPath, ['scripts/taskctl.mjs', ...argumentsList], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
}

function delegateParallel(command) {
  execFileSync(process.execPath, ['.github/governance/parallel-task-policy.mjs', command], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
}

async function pullRequestBody() {
  if (process.env.TASK_PR_BODY) return process.env.TASK_PR_BODY;
  if (!process.env.GITHUB_EVENT_PATH) return '';
  try {
    const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
    return event.pull_request?.body ?? '';
  } catch {
    return '';
  }
}

async function activeParallelTask() {
  try {
    const authorization = JSON.parse(await readFile('docs/tasks/TASK_AUTHORIZATION.json', 'utf8'));
    if (authorization.mode !== 'parallel-pr') return null;
    const taskId = /<!--\s*worldforge-task:\s*(M\d+-\d{2})\s*-->/iu
      .exec(await pullRequestBody())?.[1]
      ?.toUpperCase();
    if (!taskId) return null;
    const runtime = JSON.parse(await readFile('docs/tasks/runtime/' + taskId + '.json', 'utf8'));
    return ['IN_PROGRESS', 'IMPLEMENTED'].includes(runtime.status) ? taskId : null;
  } catch {
    return null;
  }
}

async function parallelRuntimeStatuses() {
  const statuses = new Map();
  try {
    const authorization = JSON.parse(await readFile('docs/tasks/TASK_AUTHORIZATION.json', 'utf8'));
    if (authorization.mode !== 'parallel-pr') return statuses;
    for (const name of await readdir('docs/tasks/runtime')) {
      if (!/^M\d+-\d{2}\.json$/u.test(name)) continue;
      const runtime = JSON.parse(await readFile('docs/tasks/runtime/' + name, 'utf8'));
      statuses.set(runtime.id, runtime.status);
    }
  } catch {
    // Legacy repositories without parallel task state retain the original hold behavior.
  }
  return statuses;
}

async function load() {
  const [stateSource, indexSource, mirrorSource] = await Promise.all([
    readFile(statePath, 'utf8'),
    readFile(indexPath, 'utf8'),
    readFile(mirrorPath, 'utf8'),
  ]);
  return {
    state: JSON.parse(stateSource),
    indexSource,
    taskIndex: parseTaskIndex(indexSource),
    mirrorSource,
  };
}

function isVerificationHold(state) {
  return state?.activeTask?.status === 'VERIFIED_HOLD';
}

function holdErrors(state, taskIndex, runtimeStatuses = new Map()) {
  const errors = [];
  const active = state?.activeTask;
  const hold = state?.verificationHold;
  const verifiedTasks = hold?.verifiedTasks ?? [];
  const finalTask = hold?.finalTask === true;

  if (state?.schemaVersion !== 1) errors.push('Unsupported ACTIVE_TASK schemaVersion');
  if (state?.authorization?.mode !== 'implementation-pr') {
    errors.push('Verification hold requires implementation-pr authorization');
  }
  if (state?.authorization?.branch !== 'main') {
    errors.push('Authorized integration branch must be main');
  }
  if (state?.authorization?.allowDirectMainCommits !== false) {
    errors.push('Verification hold must keep direct main commits disabled');
  }
  if (state?.authorization?.autoActivateNext !== false) {
    errors.push('Verification hold requires autoActivateNext=false');
  }
  if (state?.authorization?.deferVerificationUntilBatch !== true) {
    errors.push('Verification hold must preserve batch verification mode');
  }

  if (!active || active.status !== 'VERIFIED_HOLD') {
    errors.push('Verification hold requires one VERIFIED_HOLD anchor task');
    return errors;
  }
  if (!/^M\d+-\d{2}$/u.test(active.id ?? '')) errors.push('Invalid verification hold task id');
  if (!active.branch || active.branch === 'main') {
    errors.push('Verification hold anchor must preserve a non-main task branch');
  }
  if (!Array.isArray(active.allowedPaths) || active.allowedPaths.length === 0) {
    errors.push('Verification hold anchor must preserve allowedPaths');
  }
  if (!Array.isArray(active.verification) || active.verification.length === 0) {
    errors.push('Verification hold anchor must preserve verification commands');
  }

  const indexed = taskIndex.get(active.id);
  if (!indexed) errors.push(`Verification hold task ${active.id} is absent from TASK_INDEX`);
  if (indexed && indexed.status !== 'Verified') {
    errors.push(`TASK_INDEX must mark ${active.id} as Verified`);
  }
  if (indexed && indexed.source !== active.source) {
    errors.push(`Verification hold source differs from TASK_INDEX: ${indexed.source}`);
  }

  if (!hold || hold.taskId !== active.id) {
    errors.push('verificationHold.taskId must match the anchor task');
  }
  if (!Array.isArray(verifiedTasks) || verifiedTasks.length === 0) {
    errors.push('verificationHold.verifiedTasks must list the closed tasks');
  } else {
    if (new Set(verifiedTasks).size !== verifiedTasks.length) {
      errors.push('verificationHold.verifiedTasks must not contain duplicates');
    }
    for (const taskId of verifiedTasks) {
      if (taskIndex.get(taskId)?.status !== 'Verified') {
        errors.push(`${taskId} must be Verified during verification hold`);
      }
      if ((state.deferredVerification ?? []).some((entry) => entry?.id === taskId)) {
        errors.push(`${taskId} must be absent from deferredVerification`);
      }
    }
  }
  if (finalTask) {
    if (hold.nextTaskId !== null) errors.push('Final verification hold requires nextTaskId=null');
    const unfinished = [...taskIndex.values()].filter((task) => task.status !== 'Verified');
    if (unfinished.length > 0) {
      errors.push(
        'Final verification hold requires every task Verified: ' +
          unfinished.map((task) => task.id).join(', '),
      );
    }
    if ((state.deferredVerification ?? []).length > 0) {
      errors.push('Final verification hold requires an empty deferredVerification ledger');
    }
  } else if (!hold?.nextTaskId || hold.nextTaskId === active.id) {
    errors.push('verificationHold.nextTaskId must identify the deferred next task');
  } else {
    const indexedNextStatus = taskIndex.get(hold.nextTaskId)?.status;
    const runtimeNextStatus = runtimeStatuses.get(hold.nextTaskId);
    const supportedParallelState =
      (indexedNextStatus === 'In Progress' && runtimeNextStatus === 'IN_PROGRESS') ||
      (indexedNextStatus === 'Implemented' && runtimeNextStatus === 'IMPLEMENTED');
    if (indexedNextStatus !== 'Planned' && !supportedParallelState) {
      errors.push(
        `${hold.nextTaskId} must be Planned or match an active parallel runtime during verification hold`,
      );
    }
  }
  if (!String(hold?.reason ?? '').trim()) {
    errors.push('verificationHold.reason is required');
  }
  if (Number.isNaN(Date.parse(hold?.heldAt ?? ''))) {
    errors.push('verificationHold.heldAt must be an ISO datetime');
  }
  if (!Array.isArray(hold?.allowedPaths) || hold.allowedPaths.length === 0) {
    errors.push('verificationHold.allowedPaths must declare closure paths');
  }

  if (state?.lastVerifiedTask?.id !== active.id) {
    errors.push(`lastVerifiedTask must record ${active.id}`);
  }
  for (const field of ['commit', 'evidenceHead']) {
    if (!/^[0-9a-f]{7,40}$/iu.test(state?.lastVerifiedTask?.[field] ?? '')) {
      errors.push(`lastVerifiedTask.${field} must reference a committed revision`);
    }
  }
  return errors;
}

function normalizeText(value) {
  return value.replaceAll('\r\n', '\n');
}

async function validateHold() {
  const { state, taskIndex, mirrorSource } = await load();
  const errors = holdErrors(state, taskIndex, await parallelRuntimeStatuses());
  const expectedMirror = renderActiveTask(state);
  if (normalizeText(mirrorSource) !== normalizeText(expectedMirror)) {
    errors.push('ACTIVE_TASK.md is out of sync with ACTIVE_TASK.json');
  }
  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log(`Verification hold is valid for ${state.activeTask.id}.`);
}

function resolveDiffHead() {
  for (const candidate of [process.env.TASK_HEAD_REF, 'HEAD']) {
    if (!candidate) continue;
    try {
      return git(['rev-parse', '--verify', candidate]);
    } catch {
      // Continue to the next representation.
    }
  }
  throw new Error('Cannot resolve the pull request head');
}

function changedFiles() {
  const base = process.env.TASK_BASE_REF ?? 'HEAD^';
  const head = resolveDiffHead();
  const output = git(['diff', '--name-only', base, head]);
  return output.split(/\r?\n/u).filter(Boolean);
}

async function validateHoldPaths() {
  if (await activeParallelTask()) return delegateParallel('validate');
  const { state } = await load();
  const files = changedFiles();
  const branch = process.env.TASK_PR_HEAD_REF ?? process.env.GITHUB_HEAD_REF ?? '';
  if (isGovernanceOnlyPullRequest(branch, files)) {
    console.log('Final governance closure paths accepted from ' + branch + '.');
    return;
  }
  const violations = validateChangedPaths(
    files,
    state.verificationHold.allowedPaths,
    state.verificationHold.forbiddenPaths ?? [],
  );
  if (violations.length > 0) throw new Error(violations.join('\n'));
  console.log(`Verification hold paths passed for ${files.length} changed file(s).`);
}

async function validateHoldBranch() {
  if (await activeParallelTask()) return delegateParallel('pr-policy');
  const { state } = await load();
  const branch = process.env.TASK_PR_HEAD_REF ?? process.env.GITHUB_HEAD_REF ?? '';
  const files = changedFiles();
  if (isGovernanceOnlyPullRequest(branch, files)) {
    console.log('Final governance closure PR accepted: ' + branch + '.');
    return;
  }
  if (state.verificationHold?.finalTask === true && /^fix\/governance-/u.test(branch)) {
    await validateHoldPaths();
    console.log('Final task governance closure PR accepted: ' + branch + '.');
    return;
  }
  if (!branch || branch !== state.activeTask.branch) {
    throw new Error(
      `Verification hold PR branch must match ${state.activeTask.branch}, found ${branch || '<none>'}`,
    );
  }
  await validateHoldPaths();
  console.log(`Verification hold PR branch accepted: ${branch}.`);
}

export function selfTest() {
  const taskIndex = new Map([
    ['M4-01', { id: 'M4-01', source: 'docs/tasks/M4/M4-01.md', status: 'Verified' }],
    ['M4-02', { id: 'M4-02', source: 'docs/tasks/M4/M4-02.md', status: 'Verified' }],
    ['M4-03', { id: 'M4-03', source: 'docs/tasks/M4/M4-03.md', status: 'Verified' }],
    ['M4-04', { id: 'M4-04', source: 'docs/tasks/M4/M4-04.md', status: 'Planned' }],
  ]);
  const state = {
    schemaVersion: 1,
    authorization: {
      mode: 'implementation-pr',
      branch: 'main',
      allowDirectMainCommits: false,
      autoActivateNext: false,
      deferVerificationUntilBatch: true,
    },
    activeTask: {
      id: 'M4-03',
      status: 'VERIFIED_HOLD',
      source: 'docs/tasks/M4/M4-03.md',
      branch: 'work/m4-03-provider',
      allowedPaths: ['docs/tasks/'],
      forbiddenPaths: [],
      requiredDocs: ['AGENTS.md'],
      verification: ['pnpm test'],
    },
    deferredVerification: [],
    lastVerifiedTask: {
      id: 'M4-03',
      commit: '1234567',
      evidenceHead: '1234567',
    },
    verificationHold: {
      taskId: 'M4-03',
      verifiedTasks: ['M4-01', 'M4-02', 'M4-03'],
      nextTaskId: 'M4-04',
      heldAt: '2026-07-25T13:30:00.000Z',
      reason: 'author hold',
      allowedPaths: ['docs/tasks/'],
      forbiddenPaths: [],
    },
  };
  assert.deepEqual(holdErrors(state, taskIndex), []);
  const parallelIndex = new Map(taskIndex);
  parallelIndex.set('M4-04', {
    id: 'M4-04',
    source: 'docs/tasks/M4/M4-04.md',
    status: 'In Progress',
  });
  assert.deepEqual(holdErrors(state, parallelIndex, new Map([['M4-04', 'IN_PROGRESS']])), []);
  assert.ok(
    holdErrors(
      { ...state, authorization: { ...state.authorization, autoActivateNext: true } },
      taskIndex,
    ).includes('Verification hold requires autoActivateNext=false'),
  );
  assert.ok(
    holdErrors(
      {
        ...state,
        deferredVerification: [{ id: 'M4-02' }],
      },
      taskIndex,
    ).includes('M4-02 must be absent from deferredVerification'),
  );
  const finalIndex = new Map([
    ['M4-04', { id: 'M4-04', source: 'docs/tasks/M4/M4-04.md', status: 'Verified' }],
    ['M8-02', { id: 'M8-02', source: 'docs/tasks/M8/M8-02.md', status: 'Verified' }],
  ]);
  const finalState = {
    ...state,
    activeTask: {
      ...state.activeTask,
      id: 'M8-02',
      source: 'docs/tasks/M8/M8-02.md',
      branch: 'work/m8-02-final',
    },
    deferredVerification: [],
    lastVerifiedTask: { id: 'M8-02', commit: 'a'.repeat(40), evidenceHead: 'b'.repeat(40) },
    verificationHold: {
      taskId: 'M8-02',
      verifiedTasks: ['M4-04', 'M8-02'],
      finalTask: true,
      nextTaskId: null,
      heldAt: '2026-07-29T00:00:00.000Z',
      reason: 'final closure',
      allowedPaths: ['docs/tasks/'],
      forbiddenPaths: [],
    },
  };
  assert.deepEqual(holdErrors(finalState, finalIndex), []);
  console.log('Verification hold taskctl self-test passed.');
}

async function main() {
  const argumentsList = process.argv.slice(2);
  const command = argumentsList[0] ?? 'status';
  if (command === 'self-test') return selfTest();

  const state = JSON.parse(await readFile(statePath, 'utf8'));
  if (!isVerificationHold(state)) return delegate(argumentsList);
  if (command === 'validate') return validateHold();
  if (command === 'preflight') return validateHoldPaths();
  if (command === 'pr-policy') return validateHoldBranch();
  return delegate(argumentsList);
}

if (process.argv[1] === currentFile) await main();
