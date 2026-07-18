import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
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

function checkRunOrder(run) {
  const timestamp = Date.parse(run.created_at ?? run.started_at ?? run.completed_at ?? '');
  return {
    timestamp: Number.isFinite(timestamp) ? timestamp : 0,
    id: Number(run.id ?? 0),
  };
}

export function latestChecksByName(checkRuns = []) {
  const latest = new Map();
  for (const run of checkRuns) {
    const previous = latest.get(run.name);
    if (!previous) {
      latest.set(run.name, run);
      continue;
    }
    const currentOrder = checkRunOrder(run);
    const previousOrder = checkRunOrder(previous);
    if (
      currentOrder.timestamp > previousOrder.timestamp ||
      (currentOrder.timestamp === previousOrder.timestamp && currentOrder.id > previousOrder.id)
    ) {
      latest.set(run.name, run);
    }
  }
  return latest;
}

export function requiredCheckState(checkRuns, requiredChecks) {
  const latest = latestChecksByName(checkRuns);
  const pending = [];
  const failed = [];
  for (const name of requiredChecks) {
    const check = latest.get(name);
    if (!check || check.status !== 'completed') {
      pending.push(name);
      continue;
    }
    if (check.conclusion === 'success') continue;
    failed.push(name);
  }
  return {
    ready: pending.length === 0 && failed.length === 0,
    pending,
    failed,
  };
}

async function waitForRequiredChecks(owner, repo, sha, requiredChecks) {
  const attempts = 90;
  const delayMs = 10_000;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await api(`/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=100`);
    const state = requiredCheckState(response.check_runs ?? [], requiredChecks);
    if (state.failed.length > 0) return state;
    if (state.ready) return state;
    if (attempt === attempts) {
      throw new Error(`Timed out waiting for permanent checks: ${state.pending.join(', ')}`);
    }
    if (attempt === 1 || attempt % 6 === 0) {
      console.log(`Waiting for permanent checks on ${sha}: ${state.pending.join(', ')}`);
    }
    await delay(delayMs);
  }
  throw new Error('Permanent check polling ended unexpectedly');
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
  if (event.workflow_run?.name !== 'Quality') {
    throw new Error('Auto Merge must be triggered only by the Quality workflow');
  }
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
    if (config.blockDrafts && pull.draft) {
      console.log(`Skipping draft pull request #${number}.`);
      continue;
    }

    const mainRef = await api(`/repos/${owner}/${repo}/git/ref/heads/${config.baseBranch}`);
    const mainSha = mainRef.object.sha;
    const comparison = await api(`/repos/${owner}/${repo}/compare/${mainSha}...${sha}`);
    if (comparison.behind_by > 0) {
      console.log(`Skipping #${number}; its head is behind ${config.baseBranch}.`);
      continue;
    }

    const checkState = await waitForRequiredChecks(owner, repo, sha, config.requiredChecks);
    if (!checkState.ready) {
      console.log(`Skipping #${number}; failed permanent checks: ${checkState.failed.join(', ')}`);
      continue;
    }
    if (pull.head.sha !== sha) continue;
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
