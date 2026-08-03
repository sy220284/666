/* global console, process */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const authorizationPath = 'docs/tasks/TASK_AUTHORIZATION.json';
const taskMarkerPattern = /<!--\s*worldforge-task:\s*(M\d+-\d{2})\s*-->/iu;
const governancePaths = [
  'AGENTS.md',
  'agent.md',
  '.github/',
  'scripts/',
  'tests/unit/',
  'tests/integration/',
  'docs/PROJECT_EXECUTION_ENTRY.md',
  'docs/process/',
  'docs/tasks/ACTIVE_TASK.json',
  'docs/tasks/ACTIVE_TASK.md',
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
  if (value?.mode !== 'single-work-pr') errors.push('TASK_AUTHORIZATION.mode must be single-work-pr');
  if (value?.baseBranch !== 'main') errors.push('baseBranch must be main');
  if (value?.workBranch !== 'work') errors.push('workBranch must be work');
  if (value?.allowDirectMainCommits !== false) errors.push('Direct main commits must remain disabled');
  if (value?.allowAdditionalBranches !== false) errors.push('Additional branches must remain disabled');
  if (value?.maxOpenWorkPullRequests !== 1) errors.push('Exactly one open work pull request is allowed');
  if (value?.mainWriteMode !== 'serialized') errors.push('mainWriteMode must remain serialized');
  if (value?.mergeMethod !== 'squash') errors.push('mergeMethod must remain squash');
  if (value?.verificationClosure !== 'main-status') errors.push('verificationClosure must be main-status');
  if (value?.workSynchronization !== 'verified-reset') errors.push('workSynchronization must be verified-reset');
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

function changedFiles() {
  const base = process.env.TASK_BASE_REF ?? 'HEAD^';
  return git(['diff', '--name-only', base, 'HEAD']).split(/\r?\n/u).filter(Boolean);
}

async function validateTaskBoundary(taskId, files) {
  if (!taskId) {
    return files
      .filter((file) => !governancePaths.some((allowed) => isInside(file, allowed)))
      .map((file) => `${file}: governance PR changed a non-governance path`);
  }
  const runtime = await loadJson(`docs/tasks/runtime/${taskId}.json`);
  const errors = [];
  if (runtime.id !== taskId) errors.push(`${taskId} runtime id mismatch`);
  if (!['IN_PROGRESS', 'IMPLEMENTED'].includes(runtime.status)) {
    errors.push(`${taskId} must be IN_PROGRESS or IMPLEMENTED for a task PR`);
  }
  const executionBranch = runtime.executionBranch ?? runtime.branch;
  if (executionBranch !== 'work') errors.push(`${taskId} execution branch must be work`);
  for (const file of files) {
    if (file === `docs/tasks/runtime/${taskId}.json`) continue;
    if ((runtime.forbiddenPaths ?? []).some((blocked) => isInside(file, blocked))) {
      errors.push(`${file}: forbidden by ${taskId}`);
      continue;
    }
    if (!(runtime.allowedPaths ?? []).some((allowed) => isInside(file, allowed))) {
      errors.push(`${file}: outside ${taskId} allowedPaths`);
    }
  }
  return errors;
}

async function validateOpenPullRequestCount(event, authorization) {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) return [];
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  const response = await fetch(
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
  assert.equal(taskIdFromBody('<!-- worldforge-task: M10-03 -->'), 'M10-03');
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
