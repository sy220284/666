/* global console, process */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseTaskIndex } from '../../scripts/task-control-lib.mjs';
import { isRuntimeEffectivelyVerified, loadCommitStatuses } from './effective-task-status.mjs';

const root = process.cwd();
const authorizationPath = 'docs/tasks/TASK_AUTHORIZATION.json';
const taskMarkerPattern = /<!--\s*worldforge-task:\s*(M\d+-\d{2})\s*-->/iu;
const taskAuthorizationMarkerPattern =
  /<!--\s*worldforge-task-authorization:\s*(M\d+-\d{2})\s*-->/iu;
const activeStatuses = new Set(['IN_PROGRESS', 'IMPLEMENTED']);
const plannedStatuses = new Set(['PLANNED']);
const runtimeTransitions = new Set([
  'PLANNED:IN_PROGRESS',
  'PLANNED:IMPLEMENTED',
  'IN_PROGRESS:IN_PROGRESS',
  'IN_PROGRESS:IMPLEMENTED',
  'IMPLEMENTED:IMPLEMENTED',
]);
const immutableRuntimeFields = [
  'id',
  'executionBranch',
  'source',
  'priority',
  'dependencies',
  'baseline',
  'allowedPaths',
  'forbiddenPaths',
  'verification',
];
const governancePaths = [
  'AGENTS.md',
  'agent.md',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.github/',
  'scripts/',
  'tests/unit/',
  'tests/integration/',
  'docs/PROJECT_EXECUTION_ENTRY.md',
  'docs/process/',
  'docs/tasks/TASK_AUTHORIZATION.json',
  'docs/tasks/TASK_TEMPLATE.md',
];

function git(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function isInside(file, allowed) {
  const normalizedFile = file.replaceAll('\\', '/').replace(/^\.\//u, '');
  const normalizedAllowed = allowed.replaceAll('\\', '/').replace(/^\.\//u, '');
  return normalizedAllowed.endsWith('/')
    ? normalizedFile.startsWith(normalizedAllowed)
    : normalizedFile === normalizedAllowed;
}

function runtimePath(taskId) {
  return `docs/tasks/runtime/${taskId}.json`;
}

async function loadJson(file) {
  return JSON.parse(await readFile(path.join(root, file), 'utf8'));
}

async function eventPayload() {
  if (!process.env.GITHUB_EVENT_PATH) return {};
  return JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
}

export function validateAuthorization(value) {
  const errors = [];
  if (value?.schemaVersion !== 2) errors.push('TASK_AUTHORIZATION must use schemaVersion 2');
  if (value?.mode !== 'single-work-pr') {
    errors.push('TASK_AUTHORIZATION.mode must be single-work-pr');
  }
  if (value?.baseBranch !== 'main') errors.push('baseBranch must be main');
  if (value?.workBranch !== 'work') errors.push('workBranch must be work');
  if (value?.allowDirectMainCommits !== false) {
    errors.push('Direct main commits must remain disabled');
  }
  if (value?.allowAdditionalBranches !== false) {
    errors.push('Additional branches must remain disabled');
  }
  if (value?.maxOpenWorkPullRequests !== 1) {
    errors.push('Exactly one open work pull request is allowed');
  }
  if (value?.mainWriteMode !== 'serialized') errors.push('mainWriteMode must remain serialized');
  if (value?.mergeMethod !== 'squash') errors.push('mergeMethod must remain squash');
  if (value?.verificationClosure !== 'main-status') {
    errors.push('verificationClosure must be main-status');
  }
  if (value?.workSynchronization !== 'verified-reset') {
    errors.push('workSynchronization must be verified-reset');
  }
  return errors;
}

export function validatePullRequestShape({ head, base, sameRepository = true }) {
  const errors = [];
  if (head !== 'work') errors.push(`Pull request head must be work, found ${head || '<missing>'}`);
  if (base !== 'main') errors.push(`Pull request base must be main, found ${base || '<missing>'}`);
  if (!sameRepository) errors.push('Pull request head must belong to this repository');
  return errors;
}

export function taskIdFromBody(body) {
  return taskMarkerPattern.exec(body ?? '')?.[1]?.toUpperCase() ?? null;
}

export function taskAuthorizationIdFromBody(body) {
  return taskAuthorizationMarkerPattern.exec(body ?? '')?.[1]?.toUpperCase() ?? null;
}

export function validateRuntime(task, expectedId) {
  const errors = [];
  if (task?.schemaVersion !== 2) {
    errors.push(`${expectedId} active runtime must use schemaVersion 2`);
  }
  if (task?.id !== expectedId) errors.push(`${expectedId} runtime id mismatch`);
  if (!activeStatuses.has(task?.status)) {
    errors.push(`${expectedId} must be IN_PROGRESS or IMPLEMENTED for a task PR`);
  }
  if (!Array.isArray(task?.allowedPaths) || task.allowedPaths.length === 0) {
    errors.push(`${expectedId} runtime must declare allowedPaths`);
  }
  if (!Array.isArray(task?.forbiddenPaths)) {
    errors.push(`${expectedId} runtime must declare forbiddenPaths`);
  }
  if (!Array.isArray(task?.dependencies)) {
    errors.push(`${expectedId} runtime must declare dependencies`);
  }
  if (!Array.isArray(task?.verification) || task.verification.length === 0) {
    errors.push(`${expectedId} runtime must declare verification commands`);
  }
  if (typeof task?.source !== 'string' || !task.source.startsWith('docs/tasks/')) {
    errors.push(`${expectedId} runtime must declare a task-card source`);
  }
  if (task?.executionBranch !== 'work') errors.push(`${expectedId} execution branch must be work`);
  return errors;
}

export function validatePlannedRuntime(task, expectedId, baseSha) {
  const errors = validateRuntime({ ...task, status: 'IN_PROGRESS' }, expectedId);
  if (!plannedStatuses.has(task?.status)) {
    errors.push(`${expectedId} authorization runtime must be PLANNED`);
  }
  if (task?.baseline?.main !== baseSha || task?.baseline?.work !== baseSha) {
    errors.push(`${expectedId} authorization baseline must equal the pull request base SHA`);
  }
  if (task?.verificationBinding !== undefined) {
    errors.push(`${expectedId} PLANNED runtime cannot declare verificationBinding`);
  }
  const sourcePattern = new RegExp(`^docs/tasks/M\\d+/${expectedId}(?:_[A-Z0-9_]+)?\\.md$`, 'u');
  if (!sourcePattern.test(task?.source ?? '')) {
    errors.push(`${expectedId} authorization source must be its own task card`);
  }
  return errors;
}

export function runtimeAuthorizationErrors(previous, current) {
  const errors = [];
  if (!previous) return ['Task implementation requires a Runtime already authorized on main'];
  for (const field of immutableRuntimeFields) {
    if (JSON.stringify(previous?.[field]) !== JSON.stringify(current?.[field])) {
      errors.push(
        `${current?.id ?? previous?.id ?? 'Task'} runtime authorization changed: ${field}`,
      );
    }
  }
  return errors;
}

export function runtimeTransitionErrors(previous, current) {
  if (!previous) return [];
  const transition = `${previous.status}:${current?.status}`;
  return runtimeTransitions.has(transition)
    ? []
    : [
        `Invalid ${current?.id ?? previous.id} runtime transition: ${previous.status} -> ${current?.status}`,
      ];
}

export function implementationBindingErrors(task, taskId, pullNumber) {
  if (task?.status !== 'IMPLEMENTED') return [];
  const binding = task.verificationBinding;
  const errors = [];
  if (!Number.isSafeInteger(pullNumber) || pullNumber < 1) {
    return [`${taskId} implementation PR number is unavailable`];
  }
  if (binding?.implementationPr !== pullNumber) {
    errors.push(`${taskId} implementationPr must equal the current pull request`);
  }
  if (binding?.closurePr !== pullNumber) {
    errors.push(`${taskId} closurePr must equal the current pull request`);
  }
  if (binding?.sourcePr !== undefined) {
    errors.push(`${taskId} new Runtime cannot use legacy sourcePr binding`);
  }
  if (binding?.mainContext !== 'main-verification') {
    errors.push(`${taskId} mainContext must be main-verification`);
  }
  if (binding?.taskContext !== `task-verification/${taskId}`) {
    errors.push(`${taskId} taskContext mismatch`);
  }
  return errors;
}

function changedFiles() {
  const base = process.env.TASK_BASE_REF ?? 'HEAD^';
  return git(['diff', '--name-only', base, 'HEAD']).split(/\r?\n/u).filter(Boolean);
}

function baseRuntime(taskId) {
  const base = process.env.TASK_BASE_REF;
  if (!base) return null;
  try {
    return JSON.parse(git(['show', `${base}:${runtimePath(taskId)}`]));
  } catch {
    return null;
  }
}

async function dependencyErrors(task) {
  const errors = [];
  const index = parseTaskIndex(await readFile(path.join(root, 'docs/tasks/TASK_INDEX.md'), 'utf8'));
  const baseCommit = process.env.TASK_BASE_REF ?? git(['rev-parse', 'origin/main']);
  const statuses = await loadCommitStatuses(baseCommit);

  for (const dependency of task.dependencies ?? []) {
    const dependencyRuntime = await loadJson(runtimePath(dependency)).catch(() => null);
    const verified = dependencyRuntime
      ? isRuntimeEffectivelyVerified(dependencyRuntime, statuses)
      : index.get(dependency)?.status === 'Verified';
    if (!verified) errors.push(`${task.id} dependency ${dependency} is not effectively Verified`);
  }
  return errors;
}

export function taskChangedPathErrors(files, task) {
  const errors = [];
  const ownRuntime = runtimePath(task.id);
  for (const file of files) {
    if (file === ownRuntime) continue;
    if (file === authorizationPath) {
      errors.push(`${file}: task PR cannot modify global task authorization`);
      continue;
    }
    if (/^docs\/tasks\/runtime\/[^/]+\.json$/u.test(file)) {
      errors.push(`${file}: task PR may only modify its own runtime`);
      continue;
    }
    if ((task.forbiddenPaths ?? []).some((blocked) => isInside(file, blocked))) {
      errors.push(`${file}: forbidden by ${task.id}`);
      continue;
    }
    if (!(task.allowedPaths ?? []).some((allowed) => isInside(file, allowed))) {
      errors.push(`${file}: outside ${task.id} allowedPaths`);
    }
  }
  return errors;
}

export function taskAuthorizationPathErrors(files, task) {
  const required = [runtimePath(task.id), task.source, 'docs/tasks/TASK_INDEX.md'];
  const allowed = new Set(required);
  const errors = files
    .filter((file) => !allowed.has(file))
    .map(
      (file) => `${file}: task authorization PR may only change its task card, Runtime and index`,
    );
  for (const file of required) {
    if (!files.includes(file)) errors.push(`${file}: task authorization PR must update this file`);
  }
  return errors;
}

async function validateTaskBoundary(taskId, files, pullNumber = null) {
  if (!taskId) {
    return files
      .filter((file) => !governancePaths.some((allowed) => isInside(file, allowed)))
      .map((file) => `${file}: governance PR changed a non-governance path`);
  }
  const task = await loadJson(runtimePath(taskId));
  const previous = baseRuntime(taskId);
  const authority = previous ?? task;
  const errors = [
    ...validateRuntime(task, taskId),
    ...implementationBindingErrors(task, taskId, pullNumber),
    ...runtimeAuthorizationErrors(previous, task),
    ...(await dependencyErrors(authority)),
    ...taskChangedPathErrors(files, authority),
  ];
  errors.push(...runtimeTransitionErrors(previous, task));
  return errors;
}

async function validateTaskAuthorizationBoundary(taskId, files) {
  const task = await loadJson(runtimePath(taskId));
  const previous = baseRuntime(taskId);
  const baseSha = process.env.TASK_BASE_REF ?? git(['rev-parse', 'origin/main']);
  const errors = [
    ...validatePlannedRuntime(task, taskId, baseSha),
    ...(await dependencyErrors(task)),
    ...taskAuthorizationPathErrors(files, task),
  ];
  if (previous && previous.status !== 'PLANNED') {
    errors.push(`${taskId} authorization cannot replace a ${previous.status} Runtime`);
  }
  return errors;
}

async function validateOpenPullRequestCount(event, authorization) {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) return [];
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  const response = await globalThis.fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&base=${authorization.baseBranch}&head=${owner}:${authorization.workBranch}&per_page=100`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );
  if (!response.ok) return [`Unable to inspect open work pull requests: ${response.status}`];
  const pulls = await response.json();
  const current = event.pull_request?.number;
  const distinct = pulls.filter((pull) => pull.number !== current);
  return distinct.length > 0 ? ['Another work to main pull request is already open'] : [];
}

async function validate() {
  const [authorization, event] = await Promise.all([loadJson(authorizationPath), eventPayload()]);
  const pull = event.pull_request ?? {};
  const body = pull.body ?? '';
  const taskId = taskIdFromBody(body);
  const authorizationTaskId = taskAuthorizationIdFromBody(body);
  if (taskId && authorizationTaskId) {
    throw new Error('Pull request cannot combine task implementation and authorization markers');
  }
  const files = changedFiles();
  const errors = [
    ...validateAuthorization(authorization),
    ...validatePullRequestShape({
      head: pull.head?.ref ?? process.env.TASK_PR_HEAD_REF ?? process.env.GITHUB_HEAD_REF,
      base: pull.base?.ref ?? process.env.TASK_BASE_BRANCH,
      sameRepository:
        !pull.head?.repo?.full_name || pull.head.repo.full_name === process.env.GITHUB_REPOSITORY,
    }),
    ...(await validateOpenPullRequestCount(event, authorization)),
    ...(authorizationTaskId
      ? await validateTaskAuthorizationBoundary(authorizationTaskId, files)
      : await validateTaskBoundary(taskId, files, pull.number)),
  ];
  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log('Single work pull request policy passed.');
}

function selfTest() {
  assert.deepEqual(
    validateAuthorization({
      schemaVersion: 2,
      mode: 'single-work-pr',
      baseBranch: 'main',
      workBranch: 'work',
      allowDirectMainCommits: false,
      allowAdditionalBranches: false,
      maxOpenWorkPullRequests: 1,
      mainWriteMode: 'serialized',
      mergeMethod: 'squash',
      verificationClosure: 'main-status',
      workSynchronization: 'verified-reset',
    }),
    [],
  );
  assert.deepEqual(validatePullRequestShape({ head: 'work', base: 'main' }), []);
  assert.ok(validatePullRequestShape({ head: 'work/task', base: 'main' }).length > 0);
  assert.equal(taskIdFromBody('<!-- worldforge-task: M10-04 -->'), 'M10-04');
  assert.equal(
    taskAuthorizationIdFromBody('<!-- worldforge-task-authorization: M10-22 -->'),
    'M10-22',
  );
  assert.deepEqual(
    validateRuntime(
      {
        schemaVersion: 2,
        id: 'M10-04',
        status: 'IN_PROGRESS',
        executionBranch: 'work',
        allowedPaths: ['apps/'],
        forbiddenPaths: [],
        dependencies: [],
        verification: ['pnpm test'],
        source: 'docs/tasks/M10/M10-04.md',
      },
      'M10-04',
    ),
    [],
  );
  assert.ok(
    validateRuntime(
      {
        schemaVersion: 1,
        id: 'M10-04',
        status: 'IN_PROGRESS',
        branch: 'work',
        allowedPaths: ['apps/'],
        forbiddenPaths: [],
        dependencies: [],
        verification: ['pnpm test'],
        source: 'docs/tasks/M10/M10-04.md',
      },
      'M10-04',
    ).length > 0,
  );
  assert.equal(runtimeTransitions.has('IN_PROGRESS:IMPLEMENTED'), true);
  assert.equal(runtimeTransitions.has('IN_PROGRESS:VERIFIED'), false);
  assert.deepEqual(
    runtimeAuthorizationErrors(
      { id: 'M10-22', allowedPaths: ['apps/'] },
      { id: 'M10-22', allowedPaths: ['packages/'] },
    ),
    ['M10-22 runtime authorization changed: allowedPaths'],
  );
  console.log('Single work policy self-test passed.');
}

const command = process.argv[2] ?? 'validate';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (command === 'has-marker') {
    const event = await eventPayload();
    process.exitCode = taskIdFromBody(event.pull_request?.body ?? '') ? 0 : 1;
  } else if (command === 'self-test') {
    selfTest();
  } else {
    await validate();
  }
}
