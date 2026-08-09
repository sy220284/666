import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const eventPath = process.env.GITHUB_EVENT_PATH;
const githubFetch = globalThis.fetch;

const supportedTriggers = new Set([
  'PR Policy',
  'Task Governance',
  'Quality',
  'Security',
  'Performance',
  'Evidence',
]);

const modeAwareWorkflows = [
  {
    checkName: 'quality / quality',
    workflow: 'quality.yml',
    kind: 'quality',
  },
  {
    checkName: 'security',
    workflow: 'security.yml',
    kind: 'security',
  },
  {
    checkName: 'performance',
    workflow: 'performance.yml',
    kind: 'performance',
  },
];

async function apiResponse(pathname, options = {}) {
  const url = new globalThis.URL(pathname, 'https://api.github.com');
  if (url.origin !== 'https://api.github.com') {
    throw new Error(`Unexpected GitHub API origin: ${url.origin}`);
  }
  const response = await githubFetch(url, {
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
    throw new Error(`GitHub API ${response.status}: ${url.pathname}${url.search}\n${details}`);
  }
  return response;
}

async function api(pathname, options = {}) {
  const response = await apiResponse(pathname, options);
  if (response.status === 204) return null;
  return response.json();
}

export function nextPagePath(linkHeader) {
  if (!linkHeader) return null;
  for (const entry of linkHeader.split(',')) {
    const match = entry.match(/<([^>]+)>;\s*rel="([^"]+)"/u);
    if (!match || match[2] !== 'next') continue;
    const url = new globalThis.URL(match[1]);
    if (url.origin !== 'https://api.github.com') {
      throw new Error(`Unexpected pagination origin: ${url.origin}`);
    }
    return `${url.pathname}${url.search}`;
  }
  return null;
}

async function paginatedCollection(pathname, collectionKey = null, options = {}) {
  const items = [];
  let next = pathname;
  while (next) {
    const response = await apiResponse(next, options);
    const payload = await response.json();
    const page = collectionKey === null ? payload : payload[collectionKey];
    if (!Array.isArray(page)) {
      throw new Error(`GitHub API pagination payload is missing ${collectionKey ?? 'array data'}`);
    }
    items.push(...page);
    next = nextPagePath(response.headers.get('link'));
  }
  return items;
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

function runOrder(run) {
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
    const currentOrder = runOrder(run);
    const previousOrder = runOrder(previous);
    if (
      currentOrder.timestamp > previousOrder.timestamp ||
      (currentOrder.timestamp === previousOrder.timestamp && currentOrder.id > previousOrder.id)
    ) {
      latest.set(run.name, run);
    }
  }
  return latest;
}

export function latestWorkflowRun(workflowRuns = []) {
  let latest = null;
  for (const run of workflowRuns) {
    if (!latest) {
      latest = run;
      continue;
    }
    const currentOrder = runOrder(run);
    const previousOrder = runOrder(latest);
    if (
      currentOrder.timestamp > previousOrder.timestamp ||
      (currentOrder.timestamp === previousOrder.timestamp && currentOrder.id > previousOrder.id)
    ) {
      latest = run;
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

function jobState(job) {
  if (!job || job.status !== 'completed') return 'pending';
  if (job.conclusion === 'success') return 'ready';
  if (job.conclusion === 'failure' || job.conclusion === 'timed_out') return 'failed';
  return 'pending';
}

function requiredJobsState(jobs, names) {
  const jobsByName = new Map(jobs.map((job) => [job.name, job]));
  const pending = [];
  const failed = [];
  for (const name of names) {
    const state = jobState(jobsByName.get(name));
    if (state === 'pending') pending.push(name);
    if (state === 'failed') failed.push(name);
  }
  return { pending, failed };
}

export function modeAwareRunState(kind, workflowRun, jobs = []) {
  if (!workflowRun || workflowRun.status !== 'completed') {
    return { ready: false, pending: [kind], failed: [] };
  }
  if (workflowRun.conclusion === 'failure' || workflowRun.conclusion === 'timed_out') {
    return { ready: false, pending: [], failed: [kind] };
  }
  if (workflowRun.conclusion !== 'success') {
    return { ready: false, pending: [kind], failed: [] };
  }

  if (kind === 'quality') {
    const state = requiredJobsState(jobs, [
      'quality / static-checks',
      'quality / tests-unit',
      'quality / tests-integration',
      'quality / tests-migration',
      'quality / desktop-e2e',
      'quality / build',
      'quality / package-smoke',
      'quality / quality',
    ]);
    return {
      ready: state.pending.length === 0 && state.failed.length === 0,
      pending: state.pending.length > 0 ? [kind] : [],
      failed: state.failed.length > 0 ? [kind] : [],
    };
  }

  if (kind === 'security') {
    const state = requiredJobsState(jobs, [
      'dependency-audit',
      'secret-scan',
      'application-security',
      'security',
    ]);
    return {
      ready: state.pending.length === 0 && state.failed.length === 0,
      pending: state.pending.length > 0 ? [kind] : [],
      failed: state.failed.length > 0 ? [kind] : [],
    };
  }

  if (kind === 'performance') {
    const job = jobs.find((candidate) => candidate.name === 'performance');
    const state = jobState(job);
    if (state === 'failed') return { ready: false, pending: [], failed: [kind] };
    if (state !== 'ready') return { ready: false, pending: [kind], failed: [] };
    const step = job.steps?.find((candidate) => candidate.name === 'Run performance budgets');
    if (!step || step.status !== 'completed' || step.conclusion !== 'success') {
      return { ready: false, pending: [kind], failed: [] };
    }
    return { ready: true, pending: [], failed: [] };
  }

  throw new Error(`Unknown mode-aware workflow kind: ${kind}`);
}

export async function modeAwareChecksState(owner, repo, sha) {
  const pending = [];
  const failed = [];
  for (const specification of modeAwareWorkflows) {
    const workflow = encodeURIComponent(specification.workflow);
    const runs = await paginatedCollection(
      `/repos/${owner}/${repo}/actions/workflows/${workflow}/runs?event=pull_request&head_sha=${sha}&per_page=100`,
      'workflow_runs',
    );
    const latest = latestWorkflowRun(runs);
    const jobs = latest
      ? await paginatedCollection(
          `/repos/${owner}/${repo}/actions/runs/${latest.id}/jobs?per_page=100`,
          'jobs',
        )
      : [];
    const state = modeAwareRunState(specification.kind, latest, jobs);
    pending.push(...state.pending.map(() => specification.checkName));
    failed.push(...state.failed.map(() => specification.checkName));
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
  await delay(5_000);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const checkRuns = await paginatedCollection(
      `/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=100`,
      'check_runs',
    );
    const checkState = requiredCheckState(checkRuns, requiredChecks);
    if (checkState.failed.length > 0) return checkState;

    const modeState = await modeAwareChecksState(owner, repo, sha);
    if (modeState.failed.length > 0) return modeState;
    if (checkState.ready && modeState.ready) {
      return { ready: true, pending: [], failed: [] };
    }

    const pending = [...new Set([...checkState.pending, ...modeState.pending])];
    if (attempt === attempts) {
      throw new Error(`Timed out waiting for permanent checks: ${pending.join(', ')}`);
    }
    if (attempt === 1 || attempt % 6 === 0) {
      console.log(`Waiting for permanent checks on ${sha}: ${pending.join(', ')}`);
    }
    await delay(delayMs);
  }
  throw new Error('Permanent check polling ended unexpectedly');
}

async function hasUnresolvedThreads(owner, repo, number) {
  let after = null;
  do {
    const data = await graphql(
      `
        query ($owner: String!, $repo: String!, $number: Int!, $after: String) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $number) {
              reviewThreads(first: 100, after: $after) {
                nodes {
                  isResolved
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        }
      `,
      { owner, repo, number, after },
    );
    const threads = data.repository.pullRequest.reviewThreads;
    if (threads.nodes.some((thread) => !thread.isResolved)) return true;
    after = threads.pageInfo.hasNextPage ? threads.pageInfo.endCursor : null;
  } while (after);
  return false;
}

export function latestReviewStates(reviews = []) {
  const latest = new Map();
  for (const review of reviews) latest.set(review.user.login, review.state);
  return latest;
}

async function hasChangesRequested(owner, repo, number) {
  const reviews = await paginatedCollection(
    `/repos/${owner}/${repo}/pulls/${number}/reviews?per_page=100`,
  );
  return [...latestReviewStates(reviews).values()].includes('CHANGES_REQUESTED');
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
  const runs = await paginatedCollection(
    `/repos/${owner}/${repo}/actions/workflows/${encodedWorkflow}/runs?event=workflow_dispatch&head_sha=${sha}&per_page=100`,
    'workflow_runs',
  );
  return runs.some((run) => run.head_sha === sha);
}

export async function ensureMainVerification(owner, repo, config, mergeSha, number, sourceHeadSha) {
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
  const triggerName = event.workflow_run?.name;
  if (!supportedTriggers.has(triggerName)) {
    throw new Error(`Unsupported Auto Merge trigger: ${triggerName ?? 'missing'}`);
  }
  const sha = event.workflow_run?.head_sha;
  if (!sha) throw new Error('workflow_run head SHA is missing');
  const config = JSON.parse(await readFile('.github/governance/required-checks.json', 'utf8'));
  let pulls = event.workflow_run.pull_requests ?? [];
  if (pulls.length === 0) {
    pulls = await paginatedCollection(`/repos/${owner}/${repo}/commits/${sha}/pulls?per_page=100`);
  }

  for (const item of pulls) {
    const number = item.number;
    let pull = await api(`/repos/${owner}/${repo}/pulls/${number}`);
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

    pull = await api(`/repos/${owner}/${repo}/pulls/${number}`);
    if (
      pull.state !== 'open' ||
      pull.draft ||
      pull.base.ref !== config.baseBranch ||
      pull.head.sha !== sha ||
      pull.head.repo.full_name !== repository
    ) {
      continue;
    }
    const refreshedMainRef = await api(
      `/repos/${owner}/${repo}/git/ref/heads/${config.baseBranch}`,
    );
    const refreshedComparison = await api(
      `/repos/${owner}/${repo}/compare/${refreshedMainRef.object.sha}...${sha}`,
    );
    if (refreshedComparison.behind_by > 0) {
      console.log(`Skipping #${number}; ${config.baseBranch} advanced during aggregation.`);
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
