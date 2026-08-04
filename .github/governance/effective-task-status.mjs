/* global process */

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

export async function loadCommitStatuses(commitSha) {
  if (!/^[0-9a-f]{40}$/iu.test(commitSha ?? '')) return [];
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) return [];
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  const response = await globalThis.fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits/${commitSha}/status`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );
  if (!response.ok) return [];
  const payload = await response.json();
  return Array.isArray(payload.statuses) ? payload.statuses : [];
}

export async function runtimeEffectivelyVerified(task, commitSha, statuses = null) {
  const resolvedStatuses = statuses ?? (await loadCommitStatuses(commitSha));
  return isRuntimeEffectivelyVerified(task, resolvedStatuses);
}
