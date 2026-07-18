import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const eventPath = process.env.GITHUB_EVENT_PATH;
const githubFetch = globalThis.fetch;

async function api(pathname, options = {}) {
  const response = await githubFetch(`https://api.github.com${pathname}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`GitHub API ${response.status}: ${pathname}\n${details}`);
  }
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

export function latestChecksByName(checkRuns = []) {
  const latest = new Map();
  for (const run of checkRuns) {
    const previous = latest.get(run.name);
    if (!previous || new Date(run.started_at) > new Date(previous.started_at)) {
      latest.set(run.name, run);
    }
  }
  return latest;
}

async function latestCheckRuns(owner, repo, sha) {
  const response = await api(`/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=100`);
  return latestChecksByName(response.check_runs ?? []);
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

export function mainVerificationDispatchBody(config, mergeSha, number, sourceHeadSha) {
  if (!/^[0-9a-f]{40}$/iu.test(mergeSha ?? '')) {
    throw new Error('Controlled merge did not return a full commit SHA');
  }
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error('Main verification requires a valid pull request number');
  }
  if (!/^[0-9a-f]{40}$/iu.test(sourceHeadSha ?? '')) {
    throw new Error('Main verification requires the checked pull request head SHA');
  }
  if (!config?.baseBranch || !config?.mainVerificationWorkflow) {
    throw new Error('Main verification workflow configuration is missing');
  }
  return {
    ref: config.baseBranch,
    inputs: {
      expected_sha: mergeSha,
      source_pr: String(number),
      source_head_sha: sourceHeadSha,
    },
  };
}

async function hasMainVerificationRun(owner, repo, workflow, sha) {
  const encodedWorkflow = encodeURIComponent(workflow);
  const response = await api(
    `/repos/${owner}/${repo}/actions/workflows/${encodedWorkflow}/runs?event=workflow_dispatch&head_sha=${sha}&per_page=20`,
  );
  return (response.workflow_runs ?? []).some((run) => run.head_sha === sha);
}

async function ensureMainVerification(owner, repo, config, mergeSha, number, sourceHeadSha) {
  const mainRef = await api(`/repos/${owner}/${repo}/git/ref/heads/${config.baseBranch}`);
  if (mainRef.object.sha !== mergeSha) {
    console.log(
      `Skipping obsolete main verification for ${mergeSha}; ${config.baseBranch} is ${mainRef.object.sha}.`,
    );
    return;
  }
  if (await hasMainVerificationRun(owner, repo, config.mainVerificationWorkflow, mergeSha)) {
    console.log(`Main verification already exists for ${mergeSha}.`);
    return;
  }
  const encodedWorkflow = encodeURIComponent(config.mainVerificationWorkflow);
  await api(`/repos/${owner}/${repo}/actions/workflows/${encodedWorkflow}/dispatches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mainVerificationDispatchBody(config, mergeSha, number, sourceHeadSha)),
  });
  console.log(`Scheduled ${config.mainVerificationWorkflow} for ${mergeSha}.`);
}

async function main() {
  if (!token || !repository || !eventPath) throw new Error('Missing GitHub Actions environment');
  if (typeof githubFetch !== 'function') throw new Error('Node fetch API is unavailable');
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
    if (pull.base.ref !== config.baseBranch || pull.head.sha !== sha) continue;
    if (pull.head.repo.full_name !== repository) continue;

    if (pull.merged) {
      await ensureMainVerification(owner, repo, config, pull.merge_commit_sha, number, sha);
      continue;
    }
    if (pull.state !== 'open') continue;
    if (config.blockDrafts && pull.draft) continue;

    const mainRef = await api(`/repos/${owner}/${repo}/git/ref/heads/${config.baseBranch}`);
    const mainSha = mainRef.object.sha;
    const comparison = await api(`/repos/${owner}/${repo}/compare/${mainSha}...${sha}`);
    if (comparison.behind_by > 0) continue;

    const checks = await latestCheckRuns(owner, repo, sha);
    if (
      !config.requiredChecks.every((name) => {
        const check = checks.get(name);
        return check?.status === 'completed' && check.conclusion === 'success';
      })
    ) {
      continue;
    }
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
    await ensureMainVerification(owner, repo, config, merged.sha, number, sha);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
