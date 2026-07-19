import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { latestChecksByName, modeAwareChecksState, nextPagePath } from './automerge.mjs';

const githubFetch = globalThis.fetch;

export { latestChecksByName };

function assertFullSha(value, label) {
  if (!/^[0-9a-f]{40}$/iu.test(value ?? '')) {
    throw new Error(`${label} must be a full commit SHA`);
  }
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
  if (!pull?.merged || !pull.merged_at) {
    throw new Error(`Pull request #${sourcePr} is not merged`);
  }
  if (pull.base?.ref !== baseBranch) {
    throw new Error(`Pull request #${sourcePr} does not target ${baseBranch}`);
  }
  if (pull.head?.sha !== sourceHeadSha) {
    throw new Error(`Pull request #${sourcePr} head SHA changed after permanent checks`);
  }
  if (pull.merge_commit_sha !== expectedSha) {
    throw new Error(`Pull request #${sourcePr} did not produce ${expectedSha}`);
  }

  const latest = latestChecksByName(checkRuns);
  const missing = [];
  for (const name of requiredChecks) {
    const check = latest.get(name);
    if (check?.status !== 'completed' || check.conclusion !== 'success') {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Source PR permanent checks are not successful: ${missing.join(', ')}`);
  }
}

export function mainVerificationStatusPayload(validateResult, qualityResult, targetUrl) {
  const success = validateResult === 'success' && qualityResult === 'success';
  return {
    state: success ? 'success' : 'failure',
    context: 'main-verification',
    description: success
      ? 'Final main SHA passed full Linux verification'
      : 'Final main SHA failed provenance or quality verification',
    target_url: targetUrl,
  };
}

async function apiResponse(token, pathname, options = {}) {
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

async function api(token, pathname, options = {}) {
  const response = await apiResponse(token, pathname, options);
  if (response.status === 204) return null;
  return response.json();
}

async function paginatedCollection(token, pathname, collectionKey) {
  const items = [];
  let next = pathname;
  while (next) {
    const response = await apiResponse(token, next);
    const payload = await response.json();
    const page = payload[collectionKey];
    if (!Array.isArray(page)) {
      throw new Error(`GitHub API pagination payload is missing ${collectionKey}`);
    }
    items.push(...page);
    next = nextPagePath(response.headers.get('link'));
  }
  return items;
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
  const [pull, checkRuns, modeState] = await Promise.all([
    api(token, `/repos/${owner}/${repo}/pulls/${sourcePr}`),
    paginatedCollection(
      token,
      `/repos/${owner}/${repo}/commits/${sourceHeadSha}/check-runs?per_page=100`,
      'check_runs',
    ),
    modeAwareChecksState(owner, repo, sourceHeadSha),
  ]);

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
    checkRuns,
  });
  if (!modeState.ready) {
    throw new Error(
      `Source PR Ready-mode checks are incomplete: pending=${modeState.pending.join(', ')} failed=${modeState.failed.join(', ')}`,
    );
  }
  console.log(
    `Main verification provenance passed for ${expectedSha} from PR #${sourcePr} (${sourceHeadSha}).`,
  );
}

async function publishStatus() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const expectedSha = process.env.EXPECTED_SHA;
  const validateResult = process.env.VALIDATE_RESULT;
  const qualityResult = process.env.QUALITY_RESULT;
  const serverUrl = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
  const runId = process.env.GITHUB_RUN_ID;
  if (!token || !repository || !runId) throw new Error('GitHub Actions environment is incomplete');
  assertFullSha(expectedSha, 'EXPECTED_SHA');

  const payload = mainVerificationStatusPayload(
    validateResult,
    qualityResult,
    `${serverUrl}/${repository}/actions/runs/${runId}`,
  );
  await api(token, `/repos/${repository}/statuses/${expectedSha}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  console.log(`Published ${payload.context}=${payload.state} for ${expectedSha}.`);
  if (payload.state !== 'success') {
    throw new Error(
      `Final main verification failed: validate=${validateResult}, quality=${qualityResult}`,
    );
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
