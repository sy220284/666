import { execFileSync } from 'node:child_process';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  dependenciesSatisfied,
  extractBacktickBullets,
  findNextReadyTask,
  isGovernanceOnlyPullRequest,
  parseTaskIndex,
  renderActiveTask,
  replaceTaskCardStatus,
  replaceTaskIndexStatus,
  taskBranchFor,
  validateActiveState,
  validateChangedPathsForTransition,
  verificationForTask,
} from './task-control-lib.mjs';
import { validateTaskEvidence } from './evidence-policy.mjs';

const root = process.cwd();
const statePath = path.join(root, 'docs/tasks/ACTIVE_TASK.json');
const mirrorPath = path.join(root, 'docs/tasks/ACTIVE_TASK.md');
const indexPath = path.join(root, 'docs/tasks/TASK_INDEX.md');

function normalizeText(value) {
  return value.replaceAll('\r\n', '\n');
}

async function load() {
  const [stateSource, indexSource, mirrorSource] = await Promise.all([
    readFile(statePath, 'utf8'),
    readFile(indexPath, 'utf8'),
    readFile(mirrorPath, 'utf8'),
  ]);
  return {
    state: JSON.parse(stateSource),
    taskIndex: parseTaskIndex(indexSource),
    mirrorSource,
  };
}

async function validate() {
  const { state, taskIndex, mirrorSource } = await load();
  const errors = validateActiveState(state, taskIndex);
  const expectedMirror = renderActiveTask(state);
  if (normalizeText(mirrorSource) !== normalizeText(expectedMirror)) {
    errors.push('ACTIVE_TASK.md is out of sync with ACTIVE_TASK.json; run pnpm task:sync');
  }
  const required = [state.activeTask.source, ...state.activeTask.requiredDocs];
  for (const file of required) {
    try {
      await access(path.join(root, file));
    } catch {
      errors.push(`Required file is missing: ${file}`);
    }
  }
  if (errors.length > 0) throw new Error(errors.join('\n'));
  return state;
}

function resolveDiffHead() {
  const branch = pullRequestBranch();
  const candidates = [
    process.env.TASK_HEAD_REF,
    branch ? `refs/remotes/origin/${branch}` : null,
    isPullRequestEvent() ? 'HEAD^2' : null,
    'HEAD',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return execFileSync('git', ['rev-parse', '--verify', candidate], {
        cwd: root,
        encoding: 'utf8',
      }).trim();
    } catch {
      // Try the next representation of the real pull-request head.
    }
  }
  throw new Error('Cannot resolve the pull request head for changed-path validation');
}

function changedFiles() {
  const base = process.env.TASK_BASE_REF ?? 'HEAD^';
  const head = resolveDiffHead();
  const output = execFileSync('git', ['diff', '--name-only', base, head], {
    cwd: root,
    encoding: 'utf8',
  });
  return output.split(/\r?\n/).filter(Boolean);
}

function pullRequestBranch() {
  return process.env.TASK_PR_HEAD_REF ?? process.env.GITHUB_HEAD_REF ?? '';
}

function isPullRequestEvent() {
  return (process.env.TASK_EVENT_NAME ?? process.env.GITHUB_EVENT_NAME) === 'pull_request';
}

function loadBaseState() {
  const base = process.env.TASK_BASE_REF;
  if (!base) return null;
  try {
    const source = execFileSync('git', ['show', `${base}:docs/tasks/ACTIVE_TASK.json`], {
      cwd: root,
      encoding: 'utf8',
    });
    return JSON.parse(source);
  } catch {
    return null;
  }
}

async function prPolicy() {
  const state = await validate();
  if (!isPullRequestEvent()) {
    console.log('PR branch policy skipped outside pull_request events.');
    return state;
  }
  if (state.authorization.mode !== 'implementation-pr') {
    throw new Error('Pull requests require authorization.mode=implementation-pr');
  }

  const headBranch = pullRequestBranch();
  if (!headBranch || headBranch === 'main') {
    throw new Error('Pull request head branch must be a named non-main branch');
  }
  const files = changedFiles();
  if (isGovernanceOnlyPullRequest(headBranch, files)) {
    console.log(`Governance-only pull request accepted from ${headBranch}.`);
    return state;
  }

  const baseState = loadBaseState();
  const allowedBranches = new Set(
    [state.activeTask?.branch, baseState?.activeTask?.branch].filter(Boolean),
  );
  if (!allowedBranches.has(headBranch)) {
    throw new Error(
      `Pull request head ${headBranch} does not match the active task branch: ${[
        ...allowedBranches,
      ].join(', ')}`,
    );
  }
  console.log(`Pull request branch matches the active task: ${headBranch}.`);
  return state;
}

async function preflight() {
  const state = await validate();
  const files = changedFiles();
  const headBranch = pullRequestBranch();
  if (isPullRequestEvent() && isGovernanceOnlyPullRequest(headBranch, files)) {
    console.log(`Governance-only preflight passed for ${headBranch}.`);
    return;
  }
  const violations = validateChangedPathsForTransition(files, state, loadBaseState());
  if (violations.length > 0) throw new Error(violations.join('\n'));
  console.log(`Preflight passed for ${state.activeTask.id}.`);
}

async function reopenDeferred(taskId) {
  const { state, taskIndex } = await load();
  if (!['implementation-mainline', 'implementation-pr'].includes(state.authorization.mode)) {
    throw new Error('reopen requires an implementation-first authorization mode');
  }
  const deferred = (state.deferredVerification ?? []).find((entry) => entry.id === taskId);
  const target = taskIndex.get(taskId);
  if (!target || !['Implemented', 'Verified'].includes(target.status)) {
    throw new Error(`${taskId} must be Implemented or Verified before reopening`);
  }
  if (target.status === 'Implemented' && !deferred) {
    throw new Error(`${taskId} is not in deferredVerification`);
  }
  const paused = taskIndex.get(state.activeTask.id);
  if (!paused || paused.status !== 'In Progress') {
    throw new Error('The current task must be In Progress before it can be paused');
  }

  const targetCardPath = path.join(root, target.source);
  const pausedCardPath = path.join(root, paused.source);
  const [targetCard, pausedCard, indexSource] = await Promise.all([
    readFile(targetCardPath, 'utf8'),
    readFile(pausedCardPath, 'utf8'),
    readFile(indexPath, 'utf8'),
  ]);
  const reopenedCard = replaceTaskCardStatus(targetCard, target.status, 'In Progress');
  const pausedCardNext = replaceTaskCardStatus(pausedCard, 'In Progress', 'Planned');
  if (reopenedCard === targetCard) throw new Error(`${taskId} card is not ${target.status}`);
  if (pausedCardNext === pausedCard) throw new Error(`${paused.id} card is not In Progress`);

  const allowedPaths = extractBacktickBullets(targetCard, '主要影响范围');
  const requiredDocs = extractBacktickBullets(targetCard, '必读文档');
  const controlPaths = [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'docs/tasks/ACTIVE_TASK.json',
    'docs/tasks/ACTIVE_TASK.md',
    'docs/tasks/TASK_INDEX.md',
    target.source,
    paused.source,
    'docs/product/V1.0_TRACEABILITY_MATRIX.md',
    `docs/test-evidence/${taskId}/`,
  ];
  state.activeTask = {
    id: taskId,
    status: 'IN_PROGRESS',
    source: target.source,
    branch: taskBranchFor(target),
    startedAt: new Date().toISOString().slice(0, 10),
    allowedPaths: [...new Set([...allowedPaths, ...controlPaths])],
    forbiddenPaths: [],
    requiredDocs,
    verification: verificationForTask(targetCard),
  };
  state.deferredVerification = (state.deferredVerification ?? []).filter(
    (entry) => entry.id !== taskId,
  );
  const reopenedIndex = replaceTaskIndexStatus(
    replaceTaskIndexStatus(indexSource, paused.id, 'Planned'),
    taskId,
    'In Progress',
  );
  await Promise.all([
    writeFile(targetCardPath, reopenedCard, 'utf8'),
    writeFile(pausedCardPath, pausedCardNext, 'utf8'),
  ]);
  await writeActiveState(state, reopenedIndex);
  console.log(`Reopened ${taskId}; paused ${paused.id}.`);
}

async function verify() {
  const state = await validate();
  if (['implementation-mainline', 'implementation-pr'].includes(state.authorization.mode)) {
    console.log(
      `Evidence verification is deferred for ${state.activeTask.id} in ${state.authorization.mode} mode.`,
    );
    return state;
  }
  const evidence = path.join(root, 'docs/test-evidence', state.activeTask.id);
  for (const file of ['summary.md', 'commands.txt', 'known-risks.md']) {
    await access(path.join(evidence, file));
  }
  console.log(`Evidence structure exists for ${state.activeTask.id}.`);
  return state;
}

async function verifyTask(taskId) {
  const ciStatus = process.argv.find((value) => value.startsWith('--ci='))?.slice(5);
  const commit = process.argv.find((value) => value.startsWith('--commit='))?.slice(9);
  if (ciStatus !== 'success') throw new Error('verify-task requires --ci=success');
  if (!commit || !/^[0-9a-f]{7,40}$/iu.test(commit)) {
    throw new Error('verify-task requires --commit=<sha>');
  }

  const { state, taskIndex } = await load();
  const target = taskIndex.get(taskId);
  if (!target || !['In Progress', 'Implemented'].includes(target.status)) {
    throw new Error(`${taskId} must be In Progress or Implemented before verification`);
  }
  const active = state.activeTask?.id === taskId;
  if (target.status === 'In Progress' && !active) {
    throw new Error(`${taskId} is In Progress but is not the active task`);
  }
  if (target.status === 'Implemented') {
    const deferred = (state.deferredVerification ?? []).some((entry) => entry.id === taskId);
    if (!deferred) throw new Error(`${taskId} is not in deferredVerification`);
  }

  await validateTaskEvidence(taskId, root, { final: true });
  const indexSource = await readFile(indexPath, 'utf8');
  const verifiedIndex = replaceTaskIndexStatus(indexSource, taskId, 'Verified');
  const cardPath = path.join(root, target.source);
  const card = await readFile(cardPath, 'utf8');
  const verifiedCard = replaceTaskCardStatus(card, target.status, 'Verified');
  if (verifiedCard === card) throw new Error(`${taskId} card is not ${target.status}`);
  await writeFile(cardPath, verifiedCard, 'utf8');

  state.deferredVerification = (state.deferredVerification ?? []).filter(
    (entry) => entry.id !== taskId,
  );
  state.lastVerifiedTask = {
    id: taskId,
    commit,
    verifiedAt: new Date().toISOString(),
  };

  if (!active) {
    await writeActiveState(state, verifiedIndex);
    console.log(`Verified deferred task ${taskId}; active task remains ${state.activeTask.id}.`);
    return;
  }

  const refreshedIndex = parseTaskIndex(verifiedIndex);
  const next = findNextReadyTask(refreshedIndex, { allowImplemented: true });
  if (!next) throw new Error('No implementation-ready Planned task remains');
  state.activeTask = null;
  await Promise.all([
    writeFile(indexPath, verifiedIndex, 'utf8'),
    writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8'),
  ]);
  await activate(next.id);
  console.log(`Verified active task ${taskId}; advanced to ${next.id}.`);
}

async function sync() {
  const { state } = await load();
  await writeFile(mirrorPath, renderActiveTask(state), 'utf8');
  console.log('ACTIVE_TASK.md synchronized from ACTIVE_TASK.json.');
}

async function writeActiveState(state, indexSource) {
  await Promise.all([
    writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8'),
    writeFile(indexPath, indexSource, 'utf8'),
    writeFile(mirrorPath, renderActiveTask(state), 'utf8'),
  ]);
}

async function activate(taskId, additionalAllowedPaths = []) {
  const { state, taskIndex } = await load();
  if (state.activeTask) {
    throw new Error(`Cannot activate ${taskId} while ${state.activeTask.id} is still active`);
  }
  const task = taskIndex.get(taskId);
  if (!task) throw new Error(`Unknown task: ${taskId}`);
  if (task.status !== 'Planned') throw new Error(`${taskId} must be Planned, found ${task.status}`);
  const allowImplemented = ['implementation-mainline', 'implementation-pr'].includes(
    state.authorization.mode,
  );
  if (!dependenciesSatisfied(task, taskIndex, { allowImplemented })) {
    throw new Error(
      `${taskId} dependencies are not ${allowImplemented ? 'Implemented or Verified' : 'Verified'}`,
    );
  }

  const card = await readFile(path.join(root, task.source), 'utf8');
  const allowedPaths = extractBacktickBullets(card, '主要影响范围');
  const requiredDocs = extractBacktickBullets(card, '必读文档');
  if (allowedPaths.length === 0 || requiredDocs.length === 0) {
    throw new Error(`${taskId} card lacks machine-readable paths or required documents`);
  }

  const controlPaths = [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'docs/tasks/ACTIVE_TASK.json',
    'docs/tasks/ACTIVE_TASK.md',
    'docs/tasks/TASK_INDEX.md',
    task.source,
    'docs/product/V1.0_TRACEABILITY_MATRIX.md',
    `docs/test-evidence/${taskId}/`,
  ];
  const taskBranch =
    state.authorization.mode === 'implementation-pr'
      ? taskBranchFor(task)
      : state.authorization.branch;
  state.activeTask = {
    id: taskId,
    status: 'IN_PROGRESS',
    source: task.source,
    branch: taskBranch,
    startedAt: new Date().toISOString().slice(0, 10),
    allowedPaths: [...new Set([...allowedPaths, ...controlPaths, ...additionalAllowedPaths])],
    forbiddenPaths: [],
    requiredDocs,
    verification: verificationForTask(card),
  };

  const indexSource = await readFile(indexPath, 'utf8');
  const updatedIndex = replaceTaskIndexStatus(indexSource, taskId, 'In Progress');
  const updatedCard = replaceTaskCardStatus(card, 'Planned', 'In Progress');
  if (updatedCard === card) throw new Error(`${taskId} card status is not Planned`);
  await writeFile(path.join(root, task.source), updatedCard, 'utf8');
  await writeActiveState(state, updatedIndex);
  console.log(`Activated ${taskId} on ${taskBranch}.`);
}

async function close() {
  const ciStatus = process.argv.find((value) => value.startsWith('--ci='))?.slice(5);
  const commit = process.argv.find((value) => value.startsWith('--commit='))?.slice(9);
  if (ciStatus !== 'success') throw new Error('close requires --ci=success');
  if (!commit || !/^[0-9a-f]{7,40}$/i.test(commit)) {
    throw new Error('close requires --commit=<sha>');
  }

  const state = await verify();
  if (state.authorization.mode !== 'continuous-mainline') {
    throw new Error('close is only available in continuous-mainline mode');
  }
  if (state.activeTask.status !== 'IMPLEMENTED') {
    throw new Error(`Only an IMPLEMENTED task can close, found ${state.activeTask.status}`);
  }

  const indexSource = await readFile(indexPath, 'utf8');
  const verifiedIndex = replaceTaskIndexStatus(indexSource, state.activeTask.id, 'Verified');
  const cardPath = path.join(root, state.activeTask.source);
  const card = await readFile(cardPath, 'utf8');
  const verifiedCard = replaceTaskCardStatus(card, 'Implemented', 'Verified');
  if (verifiedCard === card) throw new Error('Task card is not in Implemented state');
  await Promise.all([
    writeFile(indexPath, verifiedIndex, 'utf8'),
    writeFile(cardPath, verifiedCard, 'utf8'),
  ]);

  state.lastVerifiedTask = {
    id: state.activeTask.id,
    commit,
    verifiedAt: new Date().toISOString(),
  };
  const refreshedIndex = parseTaskIndex(verifiedIndex);
  const next = findNextReadyTask(refreshedIndex);
  if (!next) throw new Error('No dependency-ready Planned task remains');

  state.activeTask = null;
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await activate(next.id);
  console.log(`Closed ${state.lastVerifiedTask.id}; continuous mode advanced to ${next.id}.`);
}

async function advanceImplementation() {
  const ciStatus = process.argv.find((value) => value.startsWith('--ci='))?.slice(5);
  const commit = process.argv.find((value) => value.startsWith('--commit='))?.slice(9);
  if (ciStatus !== 'success') throw new Error('advance requires --ci=success');
  if (!commit || !/^[0-9a-f]{7,40}$/i.test(commit)) {
    throw new Error('advance requires --commit=<sha>');
  }

  const state = await validate();
  if (!['implementation-mainline', 'implementation-pr'].includes(state.authorization.mode)) {
    throw new Error('advance requires an implementation-first authorization mode');
  }
  if (state.activeTask.status !== 'IN_PROGRESS') {
    throw new Error(`Only an IN_PROGRESS task can advance, found ${state.activeTask.status}`);
  }

  const indexSource = await readFile(indexPath, 'utf8');
  const implementedIndex = replaceTaskIndexStatus(indexSource, state.activeTask.id, 'Implemented');
  const cardPath = path.join(root, state.activeTask.source);
  const card = await readFile(cardPath, 'utf8');
  const implementedCard = replaceTaskCardStatus(card, 'In Progress', 'Implemented');
  if (implementedCard === card) throw new Error('Task card is not in In Progress state');

  const refreshedIndex = parseTaskIndex(implementedIndex);
  const next = findNextReadyTask(refreshedIndex, { allowImplemented: true });
  if (!next) throw new Error('No implementation-ready Planned task remains');

  const implementedAt = new Date().toISOString();
  const previousTask = state.activeTask;
  const transitionAllowedPaths = [...new Set([...previousTask.allowedPaths, next.source])];
  state.lastImplementedTask = {
    id: previousTask.id,
    commit,
    implementedAt,
    source: previousTask.source,
    branch: previousTask.branch,
    nextTaskId: next.id,
    allowedPaths: transitionAllowedPaths,
    forbiddenPaths: [...(previousTask.forbiddenPaths ?? [])],
  };
  state.deferredVerification = [
    ...(state.deferredVerification ?? []),
    {
      id: state.activeTask.id,
      implementationCommit: commit,
      deferredAt: implementedAt,
      pending: [
        'standard evidence package and screenshots',
        'manual acceptance and exhaustive quality matrix',
        'final traceability verification status',
        'Verified closure',
      ],
    },
  ];

  await Promise.all([
    writeFile(indexPath, implementedIndex, 'utf8'),
    writeFile(cardPath, implementedCard, 'utf8'),
  ]);
  state.activeTask = null;
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await activate(next.id);
  console.log(
    `Recorded ${state.lastImplementedTask.id} as Implemented with a transition snapshot; advanced to ${next.id}.`,
  );
}

async function main() {
  const command = process.argv[2] ?? 'status';
  if (command === 'status') {
    const { state } = await load();
    console.log(JSON.stringify(state, null, 2));
    return;
  }
  if (command === 'validate') {
    const state = await validate();
    console.log(`Task control is valid: ${state.activeTask.id} ${state.activeTask.status}.`);
    return;
  }
  if (command === 'pr-policy') return prPolicy();
  if (command === 'preflight') return preflight();
  if (command === 'verify') return verify();
  if (command === 'sync') return sync();
  if (command === 'activate') {
    const taskId = process.argv[3];
    if (!taskId) throw new Error('activate requires a task id');
    return activate(taskId);
  }
  if (command === 'verify-task') {
    const taskId = process.argv[3];
    if (!taskId) throw new Error('verify-task requires a task id');
    return verifyTask(taskId);
  }
  if (command === 'reopen') {
    const taskId = process.argv[3];
    if (!taskId) throw new Error('reopen requires a task id');
    return reopenDeferred(taskId);
  }
  if (command === 'advance') return advanceImplementation();
  if (command === 'close') return close();
  throw new Error(`Unknown taskctl command: ${command}`);
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  await main();
}
