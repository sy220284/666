/* global process */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const fullShaPattern = /^[0-9a-f]{40}$/iu;
const root = process.cwd();

export function hasSuccessfulCommitStatus(statuses = [], context) {
  return (
    typeof context === 'string' &&
    context.length > 0 &&
    statuses.some((status) => status?.context === context && status?.state === 'success')
  );
}

function normalizedIndexStatus(indexStatus) {
  const value = typeof indexStatus === 'string' ? indexStatus.trim().toUpperCase() : '';
  if (value === 'VERIFIED') return 'VERIFIED';
  if (value === 'IMPLEMENTED') return 'IMPLEMENTED';
  if (value === 'IN PROGRESS' || value === 'IN_PROGRESS') return 'IN_PROGRESS';
  if (value === 'PLANNED') return 'PLANNED';
  return null;
}

export function effectiveTaskStatus(task, statuses = [], indexStatus = null) {
  const declared = task?.status ?? normalizedIndexStatus(indexStatus);
  if (declared === 'VERIFIED' || normalizedIndexStatus(indexStatus) === 'VERIFIED') {
    return 'VERIFIED';
  }
  const context = task?.verificationBinding?.taskContext;
  if (declared === 'IMPLEMENTED' && hasSuccessfulCommitStatus(statuses, context)) {
    return 'VERIFIED';
  }
  return declared ?? 'UNKNOWN';
}

export function isRuntimeEffectivelyVerified(task, statuses = [], indexStatus = null) {
  return effectiveTaskStatus(task, statuses, indexStatus) === 'VERIFIED';
}

export function isMainEffectivelyVerified(statuses = []) {
  return hasSuccessfulCommitStatus(statuses, 'main-verification');
}

function githubEnvironment() {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) return null;
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  return owner && repo ? { owner, repo } : null;
}

async function githubJson(pathname) {
  const environment = githubEnvironment();
  if (!environment) throw new Error('GitHub status resolution requires repository credentials');
  const response = await globalThis.fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) throw new Error(`GitHub status resolution failed with HTTP ${response.status}`);
  return response.json();
}

async function commitStatuses(commitSha, environment) {
  const payload = await githubJson(
    `/repos/${environment.owner}/${environment.repo}/commits/${commitSha}/status`,
  );
  return Array.isArray(payload.statuses) ? payload.statuses : [];
}

export function validateRuntimeSourcePull(task, pull) {
  const sourcePr = task?.verificationBinding?.sourcePr;
  if (!Number.isSafeInteger(sourcePr) || sourcePr < 1) {
    throw new Error(`${task?.id ?? 'unknown task'} is missing a valid source PR`);
  }
  if (
    pull?.number !== sourcePr ||
    !pull?.merged_at ||
    pull?.base?.ref !== 'main' ||
    pull?.head?.ref !== 'work' ||
    !fullShaPattern.test(pull?.merge_commit_sha ?? '')
  ) {
    throw new Error(`${task?.id ?? 'unknown task'} source PR is not a verified work-to-main merge`);
  }
  return pull.merge_commit_sha;
}

export function mergeCurrentAndHistoricalTaskStatuses(current = [], historical = []) {
  const merged = new Map();
  for (const status of current) {
    if (typeof status?.context === 'string') merged.set(status.context, status);
  }
  for (const status of historical) {
    if (
      typeof status?.context === 'string' &&
      status.context.startsWith('task-verification/') &&
      !merged.has(status.context)
    ) {
      merged.set(status.context, status);
    }
  }
  return [...merged.values()];
}

async function loadImplementedRuntimes() {
  const authorization = JSON.parse(
    await readFile(path.join(root, 'docs', 'tasks', 'TASK_AUTHORIZATION.json'), 'utf8'),
  );
  const runtimeDirectory = path.join(root, authorization.taskRuntimeDirectory);
  const files = (await readdir(runtimeDirectory)).filter((file) => file.endsWith('.json')).sort();
  const runtimes = await Promise.all(
    files.map((file) => readFile(path.join(runtimeDirectory, file), 'utf8').then(JSON.parse)),
  );
  return runtimes.filter((runtime) => runtime?.status === 'IMPLEMENTED');
}

async function loadHistoricalTaskStatuses(environment) {
  const runtimes = await loadImplementedRuntimes();
  const resolved = await Promise.all(
    runtimes.map(async (task) => {
      const sourcePr = task?.verificationBinding?.sourcePr;
      if (!Number.isSafeInteger(sourcePr) || sourcePr < 1) {
        throw new Error(`${task?.id ?? 'unknown task'} is missing a valid source PR`);
      }
      const pull = await githubJson(
        `/repos/${environment.owner}/${environment.repo}/pulls/${sourcePr}`,
      );
      const mergeCommit = validateRuntimeSourcePull(task, pull);
      const statuses = await commitStatuses(mergeCommit, environment);
      const taskContext = task.verificationBinding.taskContext;
      const status = statuses.find((entry) => entry?.context === taskContext);
      if (!status) throw new Error(`${task.id} source merge is missing ${taskContext}`);
      return status;
    }),
  );
  return resolved;
}

export async function loadCommitStatuses(commitSha) {
  if (!fullShaPattern.test(commitSha ?? '')) return [];
  const environment = githubEnvironment();
  if (!environment) return [];
  const [current, historical] = await Promise.all([
    commitStatuses(commitSha, environment),
    loadHistoricalTaskStatuses(environment),
  ]);
  return mergeCurrentAndHistoricalTaskStatuses(current, historical);
}

export async function runtimeEffectivelyVerified(task, commitSha, statuses = null) {
  const resolvedStatuses = statuses ?? (await loadCommitStatuses(commitSha));
  return isRuntimeEffectivelyVerified(task, resolvedStatuses);
}
