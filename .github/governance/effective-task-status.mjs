/* global process */

const fullShaPattern = /^[0-9a-f]{40}$/iu;

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

export async function loadCommitStatuses(commitSha) {
  if (!fullShaPattern.test(commitSha ?? '')) return [];
  const environment = githubEnvironment();
  if (!environment) return [];
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

export async function loadRuntimeVerificationStatuses(runtimes = []) {
  const environment = githubEnvironment();
  if (!environment) throw new Error('Historical task verification requires repository credentials');
  const entries = await Promise.all(
    runtimes.map(async (task) => {
      if (task?.status !== 'IMPLEMENTED') return [task?.id, []];
      const sourcePr = task?.verificationBinding?.sourcePr;
      if (!Number.isSafeInteger(sourcePr) || sourcePr < 1) {
        throw new Error(`${task?.id ?? 'unknown task'} is missing a valid source PR`);
      }
      const pull = await githubJson(
        `/repos/${environment.owner}/${environment.repo}/pulls/${sourcePr}`,
      );
      const mergeCommit = validateRuntimeSourcePull(task, pull);
      return [task.id, await loadCommitStatuses(mergeCommit)];
    }),
  );
  return new Map(entries.filter(([taskId]) => typeof taskId === 'string'));
}

export async function runtimeEffectivelyVerified(task, commitSha, statuses = null) {
  const resolvedStatuses = statuses ?? (await loadCommitStatuses(commitSha));
  return isRuntimeEffectivelyVerified(task, resolvedStatuses);
}
