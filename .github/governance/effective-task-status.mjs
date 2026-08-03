/* global process */

export function isRuntimeEffectivelyVerified(task, statuses = []) {
  if (task?.status === 'VERIFIED') return true;
  const context = task?.verificationBinding?.taskContext;
  if (task?.status !== 'IMPLEMENTED' || typeof context !== 'string' || context.length === 0) {
    return false;
  }
  return statuses.some((status) => status?.context === context && status?.state === 'success');
}

export async function loadCommitStatuses(commitSha) {
  if (!/^[0-9a-f]{40}$/iu.test(commitSha ?? '')) return [];
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) return [];
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  const response = await fetch(
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
