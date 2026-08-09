/* global console, process */
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseTaskIndex } from '../../scripts/task-control-lib.mjs';
import { isRuntimeEffectivelyVerified, loadCommitStatuses } from './effective-task-status.mjs';
import {
  implementationBindingErrors,
  runtimeAuthorizationErrors,
  runtimeTransitionErrors,
  taskAuthorizationIdFromBody,
  taskAuthorizationPathErrors,
  taskChangedPathErrors,
  taskIdFromBody,
  validateAuthorization,
  validatePlannedRuntime,
  validatePullRequestShape,
  validateRuntime,
} from './single-work-policy.mjs';

const repositoryRoot = process.cwd();
const trustedGovernancePaths = Object.freeze([
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
]);

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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function readLocalJson(relativePath) {
  return JSON.parse(await readFile(path.join(repositoryRoot, relativePath), 'utf8'));
}

async function localRuntime(taskId) {
  try {
    return await readLocalJson(runtimePath(taskId));
  } catch {
    return null;
  }
}

export function trustedGovernancePathErrors(files) {
  return files
    .filter((file) => !trustedGovernancePaths.some((allowed) => isInside(file, allowed)))
    .map((file) => `${file}: governance PR changed a non-governance path`);
}

export function validateTrustedBoundary({
  body,
  files,
  headRuntime = null,
  baseRuntime = null,
  baseSha,
  pullNumber = null,
}) {
  const taskId = taskIdFromBody(body);
  const authorizationTaskId = taskAuthorizationIdFromBody(body);
  if (taskId && authorizationTaskId) {
    return ['Pull request cannot combine task implementation and authorization markers'];
  }
  if (authorizationTaskId) {
    if (!headRuntime) return [`${authorizationTaskId} Head Runtime is missing`];
    const errors = [
      ...validatePlannedRuntime(headRuntime, authorizationTaskId, baseSha),
      ...taskAuthorizationPathErrors(files, headRuntime),
    ];
    if (baseRuntime && baseRuntime.status !== 'PLANNED') {
      errors.push(
        `${authorizationTaskId} authorization cannot replace a ${baseRuntime.status} Runtime`,
      );
    }
    return errors;
  }
  if (!taskId) return trustedGovernancePathErrors(files);
  if (!headRuntime) return [`${taskId} Head Runtime is missing`];
  return [
    ...validateRuntime(headRuntime, taskId),
    ...implementationBindingErrors(headRuntime, taskId, pullNumber),
    ...runtimeAuthorizationErrors(baseRuntime, headRuntime),
    ...runtimeTransitionErrors(baseRuntime, headRuntime),
    ...(baseRuntime ? taskChangedPathErrors(files, baseRuntime) : []),
  ];
}

export function validateTaskAuthorizationDocuments(task, indexSource, taskCardSource) {
  const errors = [];
  const entry = parseTaskIndex(indexSource);
  const indexed = entry.get(task?.id);
  if (!indexed) errors.push(`${task?.id ?? 'Task'} is missing from TASK_INDEX`);
  else {
    if (indexed.source !== task.source) errors.push(`${task.id} task-card source mismatches index`);
    if (indexed.status.trim().toUpperCase() !== 'PLANNED') {
      errors.push(`${task.id} authorization index status must be Planned`);
    }
  }
  if (!/^> 状态：Planned\s*$/mu.test(taskCardSource)) {
    errors.push(`${task?.id ?? 'Task'} task card must declare Planned`);
  }
  return errors;
}

async function apiResponse(token, pathname) {
  const url = new globalThis.URL(pathname, 'https://api.github.com');
  if (url.origin !== 'https://api.github.com') {
    throw new Error(`Unexpected GitHub API origin: ${url.origin}`);
  }
  const response = await globalThis.fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${url.pathname}${url.search}`);
  }
  return response;
}

async function api(token, pathname) {
  return (await apiResponse(token, pathname)).json();
}

async function paginatedArray(token, pathname) {
  const output = [];
  let next = pathname;
  while (next) {
    const response = await apiResponse(token, next);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error('GitHub pagination did not return an array');
    output.push(...page);
    const link = response.headers.get('link') ?? '';
    const match = /<([^>]+)>;\s*rel="next"/u.exec(link);
    if (!match?.[1]) {
      next = null;
      continue;
    }
    const url = new globalThis.URL(match[1]);
    if (url.origin !== 'https://api.github.com') throw new Error('Unexpected pagination origin');
    next = `${url.pathname}${url.search}`;
  }
  return output;
}

async function repositoryFile(token, owner, repo, relativePath, ref) {
  const encodedPath = relativePath.split('/').map(encodeURIComponent).join('/');
  const payload = await api(
    token,
    `/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
  );
  if (
    payload?.type !== 'file' ||
    payload.encoding !== 'base64' ||
    typeof payload.content !== 'string'
  ) {
    throw new Error(`${relativePath} at ${ref} is not a regular base64 file`);
  }
  return Buffer.from(payload.content.replaceAll('\n', ''), 'base64').toString('utf8');
}

async function headRuntime(token, owner, repo, taskId, headSha) {
  if (!taskId) return null;
  try {
    return JSON.parse(await repositoryFile(token, owner, repo, runtimePath(taskId), headSha));
  } catch (error) {
    throw new Error(`${taskId} Head Runtime is unavailable: ${errorMessage(error)}`, {
      cause: error,
    });
  }
}

async function dependencyErrors(task, baseSha) {
  if (!task) return [];
  const [indexSource, statuses] = await Promise.all([
    readFile(path.join(repositoryRoot, 'docs/tasks/TASK_INDEX.md'), 'utf8'),
    loadCommitStatuses(baseSha),
  ]);
  const index = parseTaskIndex(indexSource);
  const errors = [];
  for (const dependency of task.dependencies ?? []) {
    const runtime = await localRuntime(dependency);
    const verified = runtime
      ? isRuntimeEffectivelyVerified(runtime, statuses, index.get(dependency)?.status)
      : index.get(dependency)?.status === 'Verified';
    if (!verified) errors.push(`${task.id} dependency ${dependency} is not effectively Verified`);
  }
  return errors;
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!token || !repository || !eventPath)
    throw new Error('GitHub Actions environment is incomplete');
  const event = JSON.parse(await readFile(eventPath, 'utf8'));
  const pull = event.pull_request;
  if (!pull) throw new Error('Trusted policy requires a pull_request_target event');
  const [owner, repo] = repository.split('/');
  const localHead = process.env.GITHUB_SHA;
  if (localHead !== pull.base.sha) {
    throw new Error(`Trusted checkout must equal PR base SHA ${pull.base.sha}, found ${localHead}`);
  }

  const authorization = await readLocalJson('docs/tasks/TASK_AUTHORIZATION.json');
  const filesPayload = await paginatedArray(
    token,
    `/repos/${owner}/${repo}/pulls/${pull.number}/files?per_page=100`,
  );
  const files = filesPayload.map((entry) => entry.filename);
  const body = pull.body ?? '';
  const taskId = taskIdFromBody(body);
  const authorizationTaskId = taskAuthorizationIdFromBody(body);
  const selectedTaskId = authorizationTaskId ?? taskId;
  const [head, base] = await Promise.all([
    headRuntime(token, owner, repo, selectedTaskId, pull.head.sha),
    selectedTaskId ? localRuntime(selectedTaskId) : null,
  ]);
  const authorizationDocumentErrors = [];
  if (authorizationTaskId && head) {
    const [headIndex, headCard] = await Promise.all([
      repositoryFile(token, owner, repo, 'docs/tasks/TASK_INDEX.md', pull.head.sha),
      repositoryFile(token, owner, repo, head.source, pull.head.sha),
    ]);
    authorizationDocumentErrors.push(
      ...validateTaskAuthorizationDocuments(head, headIndex, headCard),
    );
  }
  const openPulls = await paginatedArray(
    token,
    `/repos/${owner}/${repo}/pulls?state=open&base=${encodeURIComponent(
      authorization.baseBranch,
    )}&head=${encodeURIComponent(`${owner}:${authorization.workBranch}`)}&per_page=100`,
  );

  const errors = [
    ...validateAuthorization(authorization),
    ...validatePullRequestShape({
      head: pull.head?.ref,
      base: pull.base?.ref,
      sameRepository: pull.head?.repo?.full_name === repository,
    }),
    ...validateTrustedBoundary({
      body,
      files,
      headRuntime: head,
      baseRuntime: base,
      baseSha: pull.base.sha,
      pullNumber: pull.number,
    }),
    ...authorizationDocumentErrors,
    ...(await dependencyErrors(authorizationTaskId ? head : base, pull.base.sha)),
  ];
  if (openPulls.some((candidate) => candidate.number !== pull.number)) {
    errors.push('Another work to main pull request is already open');
  }
  if (files.length === 0) errors.push('Pull request has no changed files');
  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log(`Trusted base policy passed for pull request #${pull.number}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
