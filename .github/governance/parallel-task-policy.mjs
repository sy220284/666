/* global console, process */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isPathInside, parseTaskIndex } from '../../scripts/task-control-lib.mjs';

const root = process.cwd();
const markerPattern = /<!--\s*worldforge-task:\s*(M\d+-\d{2})\s*-->/iu;
const approvedBranch = /^(?:work|feat|fix|refactor|test|docs|chore|policy)\/[a-z0-9._/-]+$/u;
const governanceBranch = /^(?:policy\/|chore\/governance-|fix\/governance-)/u;
const activeStatuses = new Set(['IN_PROGRESS', 'IMPLEMENTED']);
const transitions = new Set([
  'PLANNED:PLANNED',
  'PLANNED:IN_PROGRESS',
  'IN_PROGRESS:IN_PROGRESS',
  'IN_PROGRESS:IMPLEMENTED',
  'IMPLEMENTED:IMPLEMENTED',
  'IMPLEMENTED:VERIFIED',
  'VERIFIED:VERIFIED',
]);

function git(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function eventBody() {
  if (process.env.TASK_PR_BODY) return process.env.TASK_PR_BODY;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return '';
  try {
    const event = JSON.parse(await readFile(eventPath, 'utf8'));
    return event.pull_request?.body ?? '';
  } catch {
    return '';
  }
}

export function taskIdFromBody(body) {
  return markerPattern.exec(body ?? '')?.[1]?.toUpperCase() ?? null;
}

function runtimePath(taskId) {
  return `docs/tasks/runtime/${taskId}.json`;
}

async function loadJson(file) {
  return JSON.parse(await readFile(path.join(root, file), 'utf8'));
}

function validateAuthorization(value) {
  const errors = [];
  if (value?.schemaVersion !== 1) errors.push('TASK_AUTHORIZATION must use schemaVersion 1');
  if (value?.mode !== 'parallel-pr') errors.push('TASK_AUTHORIZATION.mode must be parallel-pr');
  if (value?.baseBranch !== 'main') errors.push('TASK_AUTHORIZATION.baseBranch must be main');
  if (value?.allowDirectMainCommits !== false) errors.push('Direct main commits must remain disabled');
  if (value?.mainWriteMode !== 'serialized') errors.push('mainWriteMode must remain serialized');
  return errors;
}

export function validateRuntime(task, expectedId) {
  const errors = [];
  if (task?.schemaVersion !== 1) errors.push(`${expectedId} runtime must use schemaVersion 1`);
  if (task?.id !== expectedId) errors.push(`${expectedId} runtime id mismatch`);
  if (!['PLANNED', 'IN_PROGRESS', 'IMPLEMENTED', 'VERIFIED'].includes(task?.status)) {
    errors.push(`${expectedId} runtime has unsupported status`);
  }
  if (!Array.isArray(task?.allowedPaths) || task.allowedPaths.length === 0) {
    errors.push(`${expectedId} runtime must declare allowedPaths`);
  }
  if (!Array.isArray(task?.forbiddenPaths)) errors.push(`${expectedId} runtime must declare forbiddenPaths`);
  if (!Array.isArray(task?.dependencies)) errors.push(`${expectedId} runtime must declare dependencies`);
  if (!Array.isArray(task?.verification) || task.verification.length === 0) {
    errors.push(`${expectedId} runtime must declare verification commands`);
  }
  return errors;
}

function changedFiles() {
  const base = process.env.TASK_BASE_REF ?? 'HEAD^';
  const output = git(['diff', '--name-only', base, 'HEAD']);
  return output.split(/\r?\n/u).filter(Boolean);
}

function changedPathErrors(files, task, branch) {
  const errors = [];
  const ownRuntime = runtimePath(task.id);
  const mayChangeGlobalTaskState = governanceBranch.test(branch);
  for (const file of files) {
    if (file === ownRuntime) continue;
    if (file === 'docs/tasks/TASK_AUTHORIZATION.json') {
      if (!mayChangeGlobalTaskState) {
        errors.push(`${file}: global task authorization may only change in a governance PR`);
      }
      continue;
    }
    if (/^docs\/tasks\/runtime\/[^/]+\.json$/u.test(file)) {
      if (!mayChangeGlobalTaskState) {
        errors.push(`${file}: task PR may only modify its own runtime file`);
      }
      continue;
    }
    if (task.forbiddenPaths.some((blocked) => isPathInside(file, blocked))) {
      errors.push(`${file}: forbidden by ${task.id}`);
      continue;
    }
    if (!task.allowedPaths.some((allowed) => isPathInside(file, allowed))) {
      errors.push(`${file}: outside ${task.id} allowedPaths`);
    }
  }
  return errors;
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
  const indexSource = await readFile(path.join(root, 'docs/tasks/TASK_INDEX.md'), 'utf8');
  const index = parseTaskIndex(indexSource);
  for (const dependency of task.dependencies) {
    let status;
    try {
      status = (await loadJson(runtimePath(dependency))).status;
    } catch {
      status = index.get(dependency)?.status === 'Verified' ? 'VERIFIED' : null;
    }
    if (status !== 'VERIFIED') errors.push(`${task.id} dependency ${dependency} is not Verified`);
  }
  return errors;
}

async function resolveTask() {
  const body = await eventBody();
  const taskId = taskIdFromBody(body);
  if (!taskId) throw new Error('Missing <!-- worldforge-task: Mx-yy --> marker');
  const [authorization, task] = await Promise.all([
    loadJson('docs/tasks/TASK_AUTHORIZATION.json'),
    loadJson(runtimePath(taskId)),
  ]);
  const errors = [...validateAuthorization(authorization), ...validateRuntime(task, taskId)];
  if (errors.length > 0) throw new Error(errors.join('\n'));
  return { taskId, task };
}

async function validatePrPolicy() {
  const { taskId, task } = await resolveTask();
  const branch = process.env.TASK_PR_HEAD_REF ?? process.env.GITHUB_HEAD_REF ?? '';
  if (!branch || branch === 'main' || !approvedBranch.test(branch)) {
    throw new Error(`Parallel task PR requires an approved non-main branch, found ${branch || '<none>'}`);
  }
  if (!activeStatuses.has(task.status)) {
    throw new Error(`${taskId} must be IN_PROGRESS or IMPLEMENTED for a task PR, found ${task.status}`);
  }
  const errors = await dependencyErrors(task);
  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log(`Parallel task PR accepted for ${taskId} from ${branch}.`);
}

async function validateTaskPr() {
  const { taskId, task } = await resolveTask();
  const branch = process.env.TASK_PR_HEAD_REF ?? process.env.GITHUB_HEAD_REF ?? '';
  const errors = [
    ...(await dependencyErrors(task)),
    ...changedPathErrors(changedFiles(), task, branch),
  ];
  const previous = baseRuntime(taskId);
  if (previous && !transitions.has(`${previous.status}:${task.status}`)) {
    errors.push(`Invalid ${taskId} runtime transition: ${previous.status} -> ${task.status}`);
  }
  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log(`Parallel task governance passed for ${taskId}.`);
}

export function selfTest() {
  assert.equal(taskIdFromBody('<!-- worldforge-task: M8-07 -->'), 'M8-07');
  assert.equal(taskIdFromBody('none'), null);
  assert.deepEqual(
    validateRuntime(
      {
        schemaVersion: 1,
        id: 'M8-07',
        status: 'IN_PROGRESS',
        allowedPaths: ['apps/'],
        forbiddenPaths: [],
        dependencies: [],
        verification: ['pnpm test'],
      },
      'M8-07',
    ),
    [],
  );
  assert.deepEqual(
    changedPathErrors(
      ['docs/tasks/TASK_AUTHORIZATION.json'],
      {
        id: 'M8-07',
        allowedPaths: ['docs/tasks/'],
        forbiddenPaths: [],
      },
      'work/m8-07',
    ),
    ['docs/tasks/TASK_AUTHORIZATION.json: global task authorization may only change in a governance PR'],
  );
  assert.deepEqual(
    changedPathErrors(
      ['docs/tasks/TASK_AUTHORIZATION.json'],
      {
        id: 'M8-07',
        allowedPaths: ['docs/tasks/'],
        forbiddenPaths: [],
      },
      'policy/parallel-task',
    ),
    [],
  );
  assert.equal(transitions.has('IN_PROGRESS:IMPLEMENTED'), true);
  assert.equal(transitions.has('IN_PROGRESS:VERIFIED'), false);
  console.log('Parallel task policy self-test passed.');
}

async function main() {
  const command = process.argv[2] ?? 'validate';
  if (command === 'has-marker') {
    process.exitCode = taskIdFromBody(await eventBody()) ? 0 : 1;
    return;
  }
  if (command === 'pr-policy') return validatePrPolicy();
  if (command === 'validate') return validateTaskPr();
  if (command === 'self-test') return selfTest();
  throw new Error(`Unknown parallel-task-policy command: ${command}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
