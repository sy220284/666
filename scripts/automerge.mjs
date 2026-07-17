import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const eventPath = process.env.GITHUB_EVENT_PATH;
const githubFetch = globalThis.fetch;

async function api(pathname, options = {}) {
  if (typeof githubFetch !== 'function') throw new Error('Node fetch API is unavailable');
  const response = await githubFetch(`https://api.github.com${pathname}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${pathname}`);
  if (response.status === 204) return null;
  return response.json();
}

async function graphql(query, variables) {
  const result = await api('/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (result.errors?.length) throw new Error(JSON.stringify(result.errors));
  return result.data;
}

async function latestCheckRuns(owner, repo, sha) {
  const response = await api(`/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=100`);
  const latest = new Map();
  for (const run of response.check_runs ?? []) {
    const previous = latest.get(run.name);
    if (!previous || new Date(run.started_at) > new Date(previous.started_at)) {
      latest.set(run.name, run);
    }
  }
  return latest;
}

async function hasUnresolvedThreads(owner, repo, number) {
  const data = await graphql(
    `
      query ($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $number) {
            reviewThreads(first: 100) {
              nodes {
                isResolved
              }
            }
          }
        }
      }
    `,
    { owner, repo, number },
  );
  return data.repository.pullRequest.reviewThreads.nodes.some((thread) => !thread.isResolved);
}

async function hasChangesRequested(owner, repo, number) {
  const reviews = await api(`/repos/${owner}/${repo}/pulls/${number}/reviews?per_page=100`);
  const latest = new Map();
  for (const review of reviews) latest.set(review.user.login, review.state);
  return [...latest.values()].includes('CHANGES_REQUESTED');
}

async function main() {
  if (!token || !repository || !eventPath) throw new Error('Missing GitHub Actions environment');
  const [owner, repo] = repository.split('/');
  const event = JSON.parse(await readFile(eventPath, 'utf8'));
  const sha = event.workflow_run?.head_sha;
  if (!sha) throw new Error('workflow_run head SHA is missing');
  const config = JSON.parse(await readFile('.github/governance/required-checks.json', 'utf8'));
  let pulls = event.workflow_run.pull_requests ?? [];
  if (pulls.length === 0) {
    pulls = await api(`/repos/${owner}/${repo}/commits/${sha}/pulls?per_page=20`);
  }

  for (const item of pulls) {
    const number = item.number;
    const pull = await api(`/repos/${owner}/${repo}/pulls/${number}`);
    if (pull.state !== 'open' || pull.base.ref !== config.baseBranch || pull.head.sha !== sha) {
      continue;
    }
    if (config.blockDrafts && pull.draft) continue;
    if (pull.head.repo.full_name !== repository) continue;

    const checks = await latestCheckRuns(owner, repo, sha);
    const eligible = config.requiredChecks.every((name) => {
      const check = checks.get(name);
      return check?.status === 'completed' && check.conclusion === 'success';
    });
    if (!eligible) continue;
    if (config.blockChangesRequested && (await hasChangesRequested(owner, repo, number))) continue;
    if (config.blockUnresolvedThreads && (await hasUnresolvedThreads(owner, repo, number))) {
      continue;
    }

    const merged = await api(`/repos/${owner}/${repo}/pulls/${number}/merge`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sha,
        merge_method: config.mergeMethod,
        commit_title: `${pull.title} (#${number})`,
      }),
    });
    if (!merged.merged) throw new Error(`GitHub refused to merge #${number}: ${merged.message}`);
    if (config.deleteHeadBranchAfterMerge) {
      await api(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(pull.head.ref)}`, {
        method: 'DELETE',
      });
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
