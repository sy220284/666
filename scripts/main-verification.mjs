import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { requiredCheckState } from './automerge.mjs';

const apiRoot = 'https://api.github.com';
const fullSha = /^[0-9a-f]{40}$/iu;

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
  if (
    !pull?.merged ||
    !pull.merged_at ||
    pull.base?.ref !== baseBranch ||
    pull.head?.ref !== 'work'
  )
    throw new Error(`Pull request #${sourcePr} provenance is invalid`);
  if (pull.head?.sha !== sourceHeadSha || pull.merge_commit_sha !== expectedSha)
    throw new Error(`Pull request #${sourcePr} SHA provenance is invalid`);
  const state = requiredCheckState(checkRuns, requiredChecks);
  if (!state.ready)
    throw new Error(
      `Source PR permanent checks are not successful: ${[...state.failed.map((x) => `${x}:failed`), ...state.pending.map((x) => `${x}:pending`)].join(', ')}`,
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
      : 'Final main SHA failed provenance or quality verification',
    target_url: targetUrl,
  };
}

async function api(token, pathname, options = {}) {
  const url = new URL(pathname, apiRoot);
  const response = await fetch(url, {
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
  return response.status === 204 ? null : response.json();
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
    api(e.token, `/repos/${e.owner}/${e.repo}/commits/${sha}/check-runs?per_page=100`),
    api(e.token, `/repos/${e.owner}/${e.repo}/commits/${sha}/statuses?per_page=100`),
  ]);
  return [...(checks.check_runs ?? []), ...(statuses ?? [])];
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

async function publishStatus() {
  const e = env();
  const sha = process.env.EXPECTED_SHA;
  if (!fullSha.test(sha ?? '')) throw new Error('EXPECTED_SHA is invalid');
  const success =
    process.env.VALIDATE_RESULT === 'success' && process.env.QUALITY_RESULT === 'success';
  const payload = mainVerificationStatusPayload(
    success,
    `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${e.repository}/actions/runs/${process.env.GITHUB_RUN_ID}`,
  );
  await api(e.token, `/repos/${e.repository}/statuses/${sha}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!success)
    throw new Error(
      `Final main verification failed: validate=${process.env.VALIDATE_RESULT}, quality=${process.env.QUALITY_RESULT}`,
    );
}

async function main() {
  const command = process.argv[2] ?? 'check';
  if (command === 'check') await checkMain();
  else if (command === 'publish-status') await publishStatus();
  else throw new Error(`Unknown main-verification command: ${command}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
