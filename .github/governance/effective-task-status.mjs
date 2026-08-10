/* global process */
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const fullShaPattern = /^[0-9a-f]{40}$/iu;
const root = process.cwd();

function git(argumentsList, repositoryRoot = root) {
  return execFileSync('git', argumentsList, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

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
  const indexed = normalizedIndexStatus(indexStatus);
  if (!task) return indexed ?? 'UNKNOWN';

  const declared = task.status ?? indexed;
  if (task.schemaVersion === 1) return declared ?? 'UNKNOWN';
  if (task.schemaVersion !== 2) return declared === 'VERIFIED' ? 'UNKNOWN' : (declared ?? 'UNKNOWN');

  if (declared === 'PLANNED' || declared === 'IN_PROGRESS') return declared;
  if (declared === 'IMPLEMENTED' || declared === 'VERIFIED') {
    const context = task.verificationBinding?.taskContext;
    return hasSuccessfulCommitStatus(statuses, context) ? 'VERIFIED' : 'VERIFICATION_PENDING';
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

async function commitStatuses(commitSha, environment) {
  const response = await globalThis.fetch(
    `https://api.github.com/repos/${environment.owner}/${environment.repo}/commits/${commitSha}/status`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );
  if (!response.ok) throw new Error(`GitHub status resolution failed with HTTP ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload.statuses) ? payload.statuses : [];
}

export function resolveRuntimeMergeCommit(task, headSha, repositoryRoot = root) {
  const sourcePr = task?.verificationBinding?.sourcePr;
  if (!Number.isSafeInteger(sourcePr) || sourcePr < 1) {
    throw new Error(`${task?.id ?? 'unknown task'} is missing a valid source PR`);
  }
  if (!fullShaPattern.test(headSha ?? '')) {
    throw new Error('Historical task verification requires a full head SHA');
  }
  const output = git(['log', headSha, '--format=%H%x09%s'], repositoryRoot);
  const entries = output
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf('\t');
      return { sha: line.slice(0, separator), subject: line.slice(separator + 1) };
    })
    .filter((entry) => fullShaPattern.test(entry.sha));
  const controlledSuffix = ` (#${sourcePr})`;
  const controlledMatches = entries.filter((entry) => entry.subject.endsWith(controlledSuffix));
  if (controlledMatches.length === 1) return controlledMatches[0].sha;
  if (controlledMatches.length > 1) {
    throw new Error(`${task.id} source PR must resolve to exactly one controlled main commit`);
  }

  const standardMergePrefix = `Merge pull request #${sourcePr} from `;
  const standardMergeMatches = entries.filter((entry) =>
    entry.subject.startsWith(standardMergePrefix),
  );
  if (standardMergeMatches.length !== 1) {
    throw new Error(`${task.id} source PR must resolve to exactly one controlled main commit`);
  }
  return standardMergeMatches[0].sha;
}

export function isCurrentPullRequestRuntime(task, baseSha, repositoryRoot = root) {
  if (!fullShaPattern.test(baseSha ?? '') || typeof task?.id !== 'string') return false;
  const runtimePath = `docs/tasks/runtime/${task.id}.json`;
  const changed = git(['diff', '--name-only', baseSha, 'HEAD', '--', runtimePath], repositoryRoot);
  return changed.split(/\r?\n/u).includes(runtimePath);
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

async function loadHistoricalTaskStatuses(headSha, environment) {
  const runtimes = await loadImplementedRuntimes();
  const pullRequestBase = process.env.TASK_BASE_REF ?? process.env.EVIDENCE_BASE_SHA;
  const resolved = await Promise.all(
    runtimes.map(async (task) => {
      try {
        const mergeCommit = resolveRuntimeMergeCommit(task, headSha);
        const statuses = await commitStatuses(mergeCommit, environment);
        const taskContext = task.verificationBinding.taskContext;
        const status = statuses.find((entry) => entry?.context === taskContext);
        if (!status) throw new Error(`${task.id} source merge is missing ${taskContext}`);
        return status;
      } catch (error) {
        if (isCurrentPullRequestRuntime(task, pullRequestBase)) return null;
        throw error;
      }
    }),
  );
  return resolved.filter(Boolean);
}

export async function loadCommitStatuses(commitSha) {
  if (!fullShaPattern.test(commitSha ?? '')) return [];
  const environment = githubEnvironment();
  if (!environment) return [];
  const [current, historical] = await Promise.all([
    commitStatuses(commitSha, environment),
    loadHistoricalTaskStatuses(commitSha, environment),
  ]);
  return mergeCurrentAndHistoricalTaskStatuses(current, historical);
}

export async function runtimeEffectivelyVerified(task, commitSha, statuses = null) {
  const resolvedStatuses = statuses ?? (await loadCommitStatuses(commitSha));
  return isRuntimeEffectivelyVerified(task, resolvedStatuses);
}
