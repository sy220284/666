import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import {
  modeAwareChecksState,
  nextPagePath,
  requiredCheckState,
} from './automerge.mjs';

const apiRoot = 'https://api.github.com';
const fullSha = /^[0-9a-f]{40}$/iu;
const taskMarkerPattern = /<!--\s*worldforge-task:\s*(M\d+-\d{2})\s*-->/iu;

export function taskIdFromPullBody(body) {
  return taskMarkerPattern.exec(body ?? '')?.[1]?.toUpperCase() ?? null;
}

export function validateTaskVerificationBinding(runtime, { taskId, sourcePr }) {
  const errors = [];
  if (runtime?.schemaVersion !== 2) errors.push(`${taskId} runtime must use Schema 2`);
  if (runtime?.id !== taskId) errors.push(`${taskId} runtime id mismatch`);
  if (runtime?.status !== 'IMPLEMENTED') errors.push(`${taskId} runtime must be IMPLEMENTED`);
  if ((runtime?.executionBranch ?? runtime?.branch) !== 'work')
    errors.push(`${taskId} execution branch must be work`);
  if (runtime?.verificationBinding?.sourcePr !== sourcePr)
    errors.push(`${taskId} sourcePr binding mismatch`);
  if (runtime?.verificationBinding?.mainContext !== 'main-verification')
    errors.push(`${taskId} mainContext must be main-verification`);
  if (runtime?.verificationBinding?.taskContext !== `task-verification/${taskId}`)
    errors.push(`${taskId} taskContext mismatch`);
  return errors;
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
  if (!/^[^/\s]+\/[^/\s]+$/u.test(repository ?? ''))
    throw new Error('GITHUB_REPOSITORY is invalid');
  if (!fullSha.test(expectedSha ?? '') || !fullSha.test(sourceHeadSha ?? ''))
    throw new Error('Main verification requires full commit SHAs');
  if (!Number.isSafeInteger(sourcePr) || sourcePr <= 0)
    throw new Error('SOURCE_PR must be a positive integer');
  if (githubRef !== `refs/heads/${baseBranch}` || githubSha !== expectedSha)
    throw new Error('Main verification checkout does not match expected main SHA');
  if (!pull?.merged || !pull.merged_at || pull.base?.ref !== baseBranch)
    throw new Error(`Pull request #${sourcePr} provenance is invalid`);
  if (pull.head?.ref !== 'work')
    throw new Error(`Pull request #${sourcePr} must originate from work`);
  if (pull.head?.sha !== sourceHeadSha || pull.merge_commit_sha !== expectedSha)
    throw new Error(`Pull request #${sourcePr} SHA provenance is invalid`);
  const state = requiredCheckState(checkRuns, requiredChecks);
  if (!state.ready)
    throw new Error(
      `Source PR permanent checks are not successful: ${[
        ...state.failed.map((name) => `${name}:failed`),
        ...state.pending.map((name) => `${name}:pending`),
      ].join(', ')}`,
    );
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
  if (!Array.isArray(requiredChecks) || requiredChecks.length === 0)
    throw new Error('Required checks are missing');
  if (initialDelayMs > 0) await sleep(initialDelayMs);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const checks = await loadCheckRuns();
    const state = requiredCheckState(checks, requiredChecks);
    if (state.failed.length > 0)
      throw new Error(`Source PR permanent checks failed: ${state.failed.join(', ')}`);
    if (state.ready) return checks;
    if (attempt === attempts)
      throw new Error(
        `Timed out waiting for source PR permanent checks: ${state.pending.join(', ')}`,
      );
    if (attempt === 1 || attempt % 6 === 0)
      log(`Waiting for source PR permanent checks: ${state.pending.join(', ')}`);
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
      : 'Final main SHA failed provenance, task binding or quality verification',
    target_url: targetUrl,
  };
}

export function taskVerificationStatusPayload(taskId, success, targetUrl) {
  return {
    state: success ? 'success' : 'failure',
    context: `task-verification/${taskId}`,
    description: success
      ? `${taskId} source binding and main verification passed`
      : `${taskId} source binding or main verification failed`,
    target_url: targetUrl,
  };
}

async function apiResponse(token, pathname, options = {}) {
  const url = new globalThis.URL(pathname, apiRoot);
  const response = await globalThis.fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok)
    throw new Error(
      `GitHub API ${response.status}: ${url.pathname}${url.search}\n${await response.text()}`,
    );
  return response;
}

async function api(token, pathname, options = {}) {
  const response = await apiResponse(token, pathname, options);
  return response.status === 204 ? null : response.json();
}

async function paginatedCollection(token, pathname, collectionKey = null) {
  const items = [];
  let next = pathname;
  while (next) {
    const response = await apiResponse(token, next);
    const payload = await response.json();
    const page = collectionKey === null ? payload : payload[collectionKey];
    if (!Array.isArray(page))
      throw new Error(`GitHub pagination payload is missing ${collectionKey ?? 'array'}`);
    items.push(...page);
    next = nextPagePath(response.headers.get('link'));
  }
  return items;
}

function env() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !repository) throw new Error('GitHub Actions environment is incomplete');
  const [owner, repo] = repository.split('/');
  return { token, repository, owner, repo };
}

async function loadSignals(e, sha) {
  const [checks, statuses] = await Promise.all([
    paginatedCollection(
      e.token,
      `/repos/${e.owner}/${e.repo}/commits/${sha}/check-runs?per_page=100`,
      'check_runs',
    ),
    paginatedCollection(e.token, `/repos/${e.owner}/${e.repo}/commits/${sha}/statuses?per_page=100`),
  ]);
  return [...checks, ...statuses];
}

async function checkMain() {
  const e = env();
  const expectedSha = process.env.EXPECTED_SHA;
  const sourceHeadSha = process.env.SOURCE_HEAD_SHA;
  const sourcePr = Number(process.env.SOURCE_PR);
  const config = JSON.parse(await readFile('.github/governance/required-checks.json', 'utf8'));
  const checkRuns = await waitForSourceReadyChecks({
    requiredChecks: config.requiredChecks,
    loadCheckRuns: () => loadSignals(e, sourceHeadSha),
  });
  const modeState = await modeAwareChecksState(e.token, e.owner, e.repo, sourceHeadSha);
  if (!modeState.ready)
    throw new Error(
      `Source PR latest validation runs are not successful: ${[
        ...modeState.failed.map((name) => `${name}:failed`),
        ...modeState.pending.map((name) => `${name}:pending`),
      ].join(', ')}`,
    );
  const pull = await api(e.token, `/repos/${e.owner}/${e.repo}/pulls/${sourcePr}`);
  validateMainVerification({
    repository: e.repository,
    baseBranch: config.baseBranch,
    expectedSha,
    sourcePr,
    sourceHeadSha,
    githubRef: process.env.GITHUB_REF,
    githubSha: process.env.GITHUB_SHA,
    pull,
    requiredChecks: config.requiredChecks,
    checkRuns,
  });
  console.log(`Main verification provenance passed for ${expectedSha} from PR #${sourcePr}.`);
}

async function publishCommitStatus(e, sha, payload) {
  await api(e.token, `/repos/${e.repository}/statuses/${sha}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  console.log(`Published ${payload.context}=${payload.state} for ${sha}.`);
}

async function publishStatus() {
  const e = env();
  const sha = process.env.EXPECTED_SHA;
  const sourcePr = Number(process.env.SOURCE_PR);
  if (!fullSha.test(sha ?? '')) throw new Error('EXPECTED_SHA is invalid');
  if (!Number.isSafeInteger(sourcePr) || sourcePr <= 0) throw new Error('SOURCE_PR is invalid');

  const targetUrl = `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${e.repository}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  const pull = await api(e.token, `/repos/${e.owner}/${e.repo}/pulls/${sourcePr}`);
  const taskId = taskIdFromPullBody(pull.body ?? '');
  let taskBindingErrors = [];
  if (taskId) {
    try {
      const runtime = JSON.parse(await readFile(`docs/tasks/runtime/${taskId}.json`, 'utf8'));
      taskBindingErrors = validateTaskVerificationBinding(runtime, { taskId, sourcePr });
    } catch (error) {
      taskBindingErrors = [`${taskId} runtime unavailable: ${error.message}`];
    }
  }

  const success =
    process.env.VALIDATE_RESULT === 'success' &&
    process.env.QUALITY_RESULT === 'success' &&
    taskBindingErrors.length === 0;
  await publishCommitStatus(e, sha, mainVerificationStatusPayload(success, targetUrl));
  if (taskId)
    await publishCommitStatus(e, sha, taskVerificationStatusPayload(taskId, success, targetUrl));
  if (!success)
    throw new Error(
      `Final main verification failed: validate=${process.env.VALIDATE_RESULT}, quality=${process.env.QUALITY_RESULT}, task=${taskBindingErrors.join('; ') || 'none'}`,
    );
}

async function main() {
  const command = process.argv[2] ?? 'check';
  if (command === 'check') await checkMain();
  else if (command === 'publish-status') await publishStatus();
  else throw new Error(`Unknown main-verification command: ${command}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
