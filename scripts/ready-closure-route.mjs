/* global URL */
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evidenceImplementationCommit, isAllowedFinalClosurePath } from './evidence-policy.mjs';

const apiRoot = 'https://api.github.com';
const fullShaPattern = /^[0-9a-f]{40}$/iu;
const taskMarkerPattern = /<!--\s*worldforge-task:\s*(M\d+-\d{2})\s*-->/iu;
const root = process.cwd();

function git(argumentsList, repositoryRoot = root) {
  return execFileSync('git', argumentsList, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function taskIdFromPullBody(body) {
  return taskMarkerPattern.exec(body ?? '')?.[1]?.toUpperCase() ?? null;
}

function successfulJob(jobs, name) {
  return jobs.find(
    (job) => job?.name === name && job?.status === 'completed' && job?.conclusion === 'success',
  );
}

function successfulStep(job, name) {
  return job?.steps?.some(
    (step) => step?.name === name && step?.status === 'completed' && step?.conclusion === 'success',
  );
}

export function fullQualityRunPassed(run, jobs = []) {
  if (run?.status !== 'completed' || run?.conclusion !== 'success') return false;
  const requiredJobs = [
    'quality / quality',
    'quality-core / static-checks',
    'quality-core / product-tests',
    'quality-core / desktop-e2e',
  ];
  if (requiredJobs.some((name) => !successfulJob(jobs, name))) return false;

  const product = successfulJob(jobs, 'quality-core / product-tests');
  if (!successfulStep(product, 'Run product tests with coverage')) return false;
  const e2e = successfulJob(jobs, 'quality-core / desktop-e2e');
  return successfulStep(e2e, 'Run Electron E2E and capture diagnostics');
}

async function apiResponse(token, pathname) {
  const url = new URL(pathname, apiRoot);
  if (url.origin !== apiRoot) throw new Error(`Unexpected GitHub API origin: ${url.origin}`);
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

function nextPagePath(linkHeader) {
  if (!linkHeader) return null;
  for (const entry of linkHeader.split(',')) {
    const match = entry.match(/<([^>]+)>;\s*rel="([^"]+)"/u);
    if (!match || match[2] !== 'next') continue;
    const url = new URL(match[1]);
    if (url.origin !== apiRoot) throw new Error(`Unexpected pagination origin: ${url.origin}`);
    return `${url.pathname}${url.search}`;
  }
  return null;
}

async function pages(token, pathname, key) {
  const items = [];
  let next = pathname;
  while (next) {
    const response = await apiResponse(token, next);
    const payload = await response.json();
    const page = payload[key];
    if (!Array.isArray(page)) throw new Error(`GitHub payload is missing ${key}`);
    items.push(...page);
    next = nextPagePath(response.headers.get('link'));
  }
  return items;
}

function runOrder(run) {
  const timestamp = Date.parse(run?.created_at ?? run?.run_started_at ?? '');
  return {
    timestamp: Number.isFinite(timestamp) ? timestamp : 0,
    id: Number(run?.id ?? 0),
  };
}

async function reusableQualityRun(token, repository, implementationCommit) {
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) throw new Error('GITHUB_REPOSITORY is invalid');
  const workflow = encodeURIComponent('quality.yml');
  const runs = await pages(
    token,
    `/repos/${owner}/${repo}/actions/workflows/${workflow}/runs?event=pull_request&head_sha=${implementationCommit}&per_page=100`,
    'workflow_runs',
  );
  runs.sort((left, right) => {
    const a = runOrder(left);
    const b = runOrder(right);
    return b.timestamp - a.timestamp || b.id - a.id;
  });
  for (const run of runs) {
    if (run?.head_sha !== implementationCommit || run?.conclusion !== 'success') continue;
    const jobs = await pages(
      token,
      `/repos/${owner}/${repo}/actions/runs/${run.id}/jobs?per_page=100`,
      'jobs',
    );
    if (fullQualityRunPassed(run, jobs)) return run;
  }
  return null;
}

async function closureCandidate({ pullBody, headSha, repositoryRoot = root }) {
  const taskId = taskIdFromPullBody(pullBody);
  if (!taskId) return { reusable: false, reason: 'no task marker' };
  if (!fullShaPattern.test(headSha ?? '')) return { reusable: false, reason: 'invalid head SHA' };

  let runtime;
  let manifest;
  try {
    [runtime, manifest] = await Promise.all([
      readFile(path.join(repositoryRoot, 'docs', 'tasks', 'runtime', `${taskId}.json`), 'utf8').then(
        JSON.parse,
      ),
      readFile(
        path.join(repositoryRoot, 'docs', 'test-evidence', taskId, 'manifest.json'),
        'utf8',
      ).then(JSON.parse),
    ]);
  } catch {
    return { reusable: false, reason: 'runtime or evidence manifest is missing' };
  }

  const implementationCommit = evidenceImplementationCommit(manifest);
  if (
    runtime?.schemaVersion !== 2 ||
    runtime?.id !== taskId ||
    runtime?.status !== 'IMPLEMENTED' ||
    typeof runtime?.source !== 'string' ||
    manifest?.schemaVersion !== 2 ||
    manifest?.taskId !== taskId ||
    !fullShaPattern.test(implementationCommit ?? '')
  ) {
    return { reusable: false, reason: 'task closure metadata is incomplete' };
  }

  try {
    git(['cat-file', '-e', `${implementationCommit}^{commit}`], repositoryRoot);
    git(['merge-base', '--is-ancestor', implementationCommit, headSha], repositoryRoot);
  } catch {
    return { reusable: false, reason: 'implementation commit is not an ancestor of Head' };
  }

  const changed = git(['diff', '--name-only', implementationCommit, headSha], repositoryRoot)
    .split(/\r?\n/u)
    .filter(Boolean);
  const forbidden = changed.filter(
    (file) => !isAllowedFinalClosurePath(taskId, runtime.source, file),
  );
  if (forbidden.length > 0) {
    return {
      reusable: false,
      reason: `non-closure files follow implementation commit: ${forbidden.join(', ')}`,
    };
  }
  return { reusable: true, taskId, implementationCommit, changed };
}

export async function readyClosureRoute({
  pullBody,
  headSha,
  draft,
  token,
  repository,
  repositoryRoot = root,
}) {
  if (draft) return { reuseQuality: false, reason: 'pull request is Draft' };
  const candidate = await closureCandidate({ pullBody, headSha, repositoryRoot });
  if (!candidate.reusable) return { reuseQuality: false, reason: candidate.reason };
  if (!token || !repository)
    return { reuseQuality: false, reason: 'GitHub Actions context is missing' };
  const run = await reusableQualityRun(token, repository, candidate.implementationCommit);
  if (!run) {
    return {
      reuseQuality: false,
      reason: `no complete Quality run proves ${candidate.implementationCommit}`,
    };
  }
  return {
    reuseQuality: true,
    taskId: candidate.taskId,
    implementationCommit: candidate.implementationCommit,
    qualityRunId: run.id,
    changed: candidate.changed,
  };
}

async function main() {
  const result = await readyClosureRoute({
    pullBody: process.env.PR_BODY ?? '',
    headSha: process.env.PR_HEAD_SHA,
    draft: /^(?:1|true)$/iu.test(process.env.PR_DRAFT ?? ''),
    token: process.env.GITHUB_TOKEN,
    repository: process.env.GITHUB_REPOSITORY,
  });
  const output = process.env.GITHUB_OUTPUT;
  if (!output) throw new Error('GITHUB_OUTPUT is required');
  const { appendFile } = await import('node:fs/promises');
  await appendFile(output, `reuse_quality=${result.reuseQuality ? 'true' : 'false'}\n`);
  if (result.implementationCommit) {
    await appendFile(output, `implementation_commit=${result.implementationCommit}\n`);
  }
  if (result.qualityRunId) await appendFile(output, `quality_run_id=${result.qualityRunId}\n`);
  console.log(
    result.reuseQuality
      ? `Reusing complete Quality run ${result.qualityRunId} for frozen implementation ${result.implementationCommit}; current Head contains closure-only changes.`
      : `Frozen implementation Quality cannot be reused: ${result.reason}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
