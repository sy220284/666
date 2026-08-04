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
const activeStatuses = new Set(['IN_PROGRESS', 'IMPLEMENTED']);
const runtimeTransitions = new Set([
  'PLANNED:IN_PROGRESS',
  'IN_PROGRESS:IN_PROGRESS',
  'IN_PROGRESS:IMPLEMENTED',
  'IMPLEMENTED:IMPLEMENTED',
]);
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
  if (task?.executionBranch !== 'work') errors.push(`${expectedId} execution branch must be work`);
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

function taskChangedPathErrors(files, task) {
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

async function validateTaskBoundary(taskId, files) {
  if (!taskId) {
    return files
      .filter((file) => !governancePaths.some((allowed) => isInside(file, allowed)))
      .map((file) => `${file}: governance PR changed a non-governance path`);
  }
  const task = await loadJson(runtimePath(taskId));
  const previous = baseRuntime(taskId);
  const errors = [
    ...validateRuntime(task, taskId),
    ...(await dependencyErrors(task)),
    ...taskChangedPathErrors(files, task),
  ];
  if (previous && !runtimeTransitions.has(`${previous.status}:${task.status}`)) {
    errors.push(`Invalid ${taskId} runtime transition: ${previous.status} -> ${task.status}`);
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
  const errors = [
    ...validateAuthorization(authorization),
    ...validatePullRequestShape({
      head: pull.head?.ref ?? process.env.TASK_PR_HEAD_REF ?? process.env.GITHUB_HEAD_REF,
      base: pull.base?.ref ?? process.env.TASK_BASE_BRANCH,
      sameRepository:
        !pull.head?.repo?.full_name || pull.head.repo.full_name === process.env.GITHUB_REPOSITORY,
    }),
    ...(await validateOpenPullRequestCount(event, authorization)),
    ...(await validateTaskBoundary(taskIdFromBody(pull.body ?? ''), changedFiles())),
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
      },
      'M10-04',
    ).length > 0,
  );
  assert.equal(runtimeTransitions.has('IN_PROGRESS:IMPLEMENTED'), true);
  assert.equal(runtimeTransitions.has('IN_PROGRESS:VERIFIED'), false);
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
