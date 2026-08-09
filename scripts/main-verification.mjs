import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { nextPagePath, requiredCheckState } from './automerge.mjs';

const githubFetch = globalThis.fetch;
const taskMarkerPattern = /<!--\s*worldforge-task:\s*(M\d+-\d{2})\s*-->/iu;

function assertFullSha(value, label) {
  if (!/^[0-9a-f]{40}$/iu.test(value ?? '')) throw new Error(`${label} must be a full commit SHA`);
}

export function taskIdFromPullBody(body) {
  return taskMarkerPattern.exec(body ?? '')?.[1]?.toUpperCase() ?? null;
}

export function validateMainVerification({
  repository,
  baseBranch,
  expectedSha,
  sourcePr,
  sourceHeadSha,
  githubRef,
  githubSha,
  pull,
  requiredChecks,
  checkRuns,
}) {
  if (!/^[^/\s]+\/[^/\s]+$/u.test(repository ?? '')) {
    throw new Error('GITHUB_REPOSITORY is invalid');
  }
  if (!baseBranch) throw new Error('Base branch is missing');
  assertFullSha(expectedSha, 'EXPECTED_SHA');
  assertFullSha(sourceHeadSha, 'SOURCE_HEAD_SHA');
  if (!Number.isSafeInteger(sourcePr) || sourcePr <= 0) {
    throw new Error('SOURCE_PR must be a positive integer');
  }
  if (githubRef !== `refs/heads/${baseBranch}`) {
    throw new Error(`Main verification must run from refs/heads/${baseBranch}`);
  }
  if (githubSha !== expectedSha) {
    throw new Error(`Dispatched SHA ${githubSha} does not match expected main SHA ${expectedSha}`);
  }
  if (!pull?.merged || !pull.merged_at) throw new Error(`Pull request #${sourcePr} is not merged`);
  if (pull.base?.ref !== baseBranch) {
    throw new Error(`Pull request #${sourcePr} does not target ${baseBranch}`);
  }
  if (pull.head?.ref !== 'work') {
    throw new Error(`Pull request #${sourcePr} must originate from work`);
  }
  if (pull.head?.sha !== sourceHeadSha) {
    throw new Error(`Pull request #${sourcePr} head SHA changed after permanent checks`);
  }
  if (pull.merge_commit_sha !== expectedSha) {
    throw new Error(`Pull request #${sourcePr} did not produce ${expectedSha}`);
  }

  const state = requiredCheckState(checkRuns, requiredChecks);
  if (!state.ready) {
    const details = [...state.failed.map((name) => `${name}:failed`), ...state.pending.map((name) => `${name}:pending`)];
    throw new Error(`Source PR permanent checks are not successful: ${details.join(', ')}`);
  }
}

export async function waitForSourceReadyChecks({
  requiredChecks,
  loadCheckRuns,
  attempts = 90,
  initialDelayMs = 5_000,
  delayMs = 10_000,
  sleep = delay,
  log = console.log,
}) {
  if (!Array.isArray(requiredChecks) || requiredChecks.length === 0) {
    throw new Error('Required checks are missing');
  }
  if (typeof loadCheckRuns !== 'function') throw new Error('Source check loader is required');
  if (!Number.isSafeInteger(attempts) || attempts <= 0) {
    throw new Error('Source check attempts must be a positive integer');
  }
  if (initialDelayMs > 0) await sleep(initialDelayMs);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const signals = await loadCheckRuns();
    const state = requiredCheckState(signals, requiredChecks);
    if (state.failed.length > 0) {
      throw new Error(`Source PR permanent checks failed: ${state.failed.join(', ')}`);
    }
    if (state.ready) return signals;
    if (attempt === attempts) {
      throw new Error(`Timed out waiting for source PR permanent checks: ${state.pending.join(', ')}`);
    }
    if (attempt === 1 || attempt % 6 === 0) {
      log(`Waiting for source PR permanent checks: ${state.pending.join(', ')}`);
    }
    await sleep(delayMs);
  }
  throw new Error('Source PR permanent check polling ended unexpectedly');
}

export function mainVerificationStatusPayload(success, targetUrl) {
  return {
    state: success ? 'success' : 'failure',
    context: 'main-verification',
    description: success
      ? 'Final main SHA passed provenance and static verification'
      : 'Final main SHA failed provenance or quality verification',
    target_url: targetUrl,
  };
}

export function taskVerificationStatusPayload(taskId, success, targetUrl) {
  return {
    state: success ? 'success' : 'failure',
    context: `task-verification/${taskId}`,
    description: success
      ? `${taskId} merge completed and main verification passed`
      : `${taskId} main verification failed`,
    target_url: targetUrl,
  };
}

async function apiResponse(token, pathname, options = {}) {
  const url = new globalThis.URL(pathname, 'https://api.github.com');
  if (url.origin !== 'https://api.github.com') throw new Error(`Unexpected GitHub API origin: ${url.origin}`);
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

async function api(token, pathname, options = {}) {
  const response = await apiResponse(token, pathname, options);
  if (response.status === 204) return null;
  return response.json();
}

async function paginatedCollection(token, pathname, collectionKey = null) {
  const items = [];
  let next = pathname;
  while (next) {
    const response = await apiResponse(token, next);
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

async function loadSourceSignals(token, owner, repo, sha) {
  const [checks, statuses] = await Promise.all([
    paginatedCollection(token, `/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=100`, 'check_runs'),
    paginatedCollection(token, `/repos/${owner}/${repo}/commits/${sha}/statuses?per_page=100`),
  ]);
  return [...checks, ...statuses];
}

async function checkMain() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const expectedSha = process.env.EXPECTED_SHA;
  const sourceHeadSha = process.env.SOURCE_HEAD_SHA;
  const sourcePr = Number(process.env.SOURCE_PR);
  const githubRef = process.env.GITHUB_REF;
  const githubSha = process.env.GITHUB_SHA;
  if (!token || !repository) throw new Error('GitHub Actions environment is incomplete');

  const config = JSON.parse(await readFile('.github/governance/required-checks.json', 'utf8'));
  const [owner, repo] = repository.split('/');
  const signals = await waitForSourceReadyChecks({
    requiredChecks: config.requiredChecks,
    loadCheckRuns: () => loadSourceSignals(token, owner, repo, sourceHeadSha),
  });
  const pull = await api(token, `/repos/${owner}/${repo}/pulls/${sourcePr}`);

  validateMainVerification({
    repository,
    baseBranch: config.baseBranch,
    expectedSha,
    sourcePr,
    sourceHeadSha,
    githubRef,
    githubSha,
    pull,
    requiredChecks: config.requiredChecks,
    checkRuns: signals,
  });
  console.log(`Main verification provenance passed for ${expectedSha} from PR #${sourcePr} (${sourceHeadSha}).`);
}

async function publishCommitStatus(token, repository, sha, payload) {
  await api(token, `/repos/${repository}/statuses/${sha}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  console.log(`Published ${payload.context}=${payload.state} for ${sha}.`);
}

async function publishStatus() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const expectedSha = process.env.EXPECTED_SHA;
  const sourcePr = Number(process.env.SOURCE_PR);
  const sourceHeadSha = process.env.SOURCE_HEAD_SHA;
  const validateResult = process.env.VALIDATE_RESULT;
  const qualityResult = process.env.QUALITY_RESULT;
  const serverUrl = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
  const runId = process.env.GITHUB_RUN_ID;
  if (!token || !repository || !runId) throw new Error('GitHub Actions environment is incomplete');
  assertFullSha(expectedSha, 'EXPECTED_SHA');
  assertFullSha(sourceHeadSha, 'SOURCE_HEAD_SHA');
  if (!Number.isSafeInteger(sourcePr) || sourcePr <= 0) throw new Error('SOURCE_PR is invalid');

  const targetUrl = `${serverUrl}/${repository}/actions/runs/${runId}`;
  const [owner, repo] = repository.split('/');
  const pull = await api(token, `/repos/${owner}/${repo}/pulls/${sourcePr}`);
  const taskId = taskIdFromPullBody(pull.body ?? '');
  const success = validateResult === 'success' && qualityResult === 'success';

  await publishCommitStatus(token, repository, expectedSha, mainVerificationStatusPayload(success, targetUrl));
  if (taskId) {
    await publishCommitStatus(
      token,
      repository,
      expectedSha,
      taskVerificationStatusPayload(taskId, success, targetUrl),
    );
  }
  if (!success) {
    throw new Error(`Final main verification failed: validate=${validateResult}, quality=${qualityResult}`);
  }
}

async function main() {
  if (typeof githubFetch !== 'function') throw new Error('Node fetch API is unavailable');
  const command = process.argv[2] ?? 'check';
  if (command === 'check') await checkMain();
  else if (command === 'publish-status') await publishStatus();
  else throw new Error(`Unknown main-verification command: ${command}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
