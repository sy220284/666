import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import {
  latestChecksByName,
  modeAwareChecksState,
  nextPagePath,
  requiredCheckState,
} from './automerge.mjs';
import {
  loadTaskProvenanceCorrections,
  taskVerificationProvenance,
} from '../.github/governance/effective-task-status.mjs';

const githubFetch = globalThis.fetch;
const taskMarkerPattern = /<!--\s*worldforge-task:\s*(M\d+-\d{2})\s*-->/iu;

export { latestChecksByName };

function assertFullSha(value, label) {
  if (!/^[0-9a-f]{40}$/iu.test(value ?? '')) {
    throw new Error(`${label} must be a full commit SHA`);
  }
}

export function taskIdFromPullBody(body) {
  return taskMarkerPattern.exec(body ?? '')?.[1]?.toUpperCase() ?? null;
}

export function validateCapturedTaskId(expectedTaskId, currentTaskId) {
  if (currentTaskId !== expectedTaskId) {
    throw new Error(
      `Pull request task marker changed after controlled merge: expected ${expectedTaskId ?? '<none>'}, found ${currentTaskId ?? '<none>'}`,
    );
  }
}

export function validateTaskVerificationBinding(runtime, { taskId, sourcePr }, correction = null) {
  const errors = [];
  if (runtime?.id !== taskId) errors.push(`${taskId} runtime id mismatch`);
  if (!['IMPLEMENTED', 'VERIFIED'].includes(runtime?.status)) {
    errors.push(`${taskId} runtime must be IMPLEMENTED before main verification`);
  }
  const branch = runtime?.executionBranch ?? runtime?.branch;
  if (branch !== 'work') errors.push(`${taskId} execution branch must be work`);
  const binding = runtime?.verificationBinding;
  const provenance = taskVerificationProvenance(runtime, correction);
  if (provenance.closurePr !== sourcePr) errors.push(`${taskId} closurePr binding mismatch`);
  if (!Number.isSafeInteger(provenance.implementationPr) || provenance.implementationPr < 1) {
    errors.push(`${taskId} implementationPr binding is missing`);
  }
  if (binding?.mainContext !== 'main-verification') {
    errors.push(`${taskId} mainContext must be main-verification`);
  }
  if (binding?.taskContext !== `task-verification/${taskId}`) {
    errors.push(`${taskId} taskContext mismatch`);
  }
  return errors;
}

export function implementationRequiresFullQuality(files = []) {
  return files.some((file) => !(file.endsWith('.md') || file.startsWith('docs/')));
}

export function validateSplitTaskProvenance({
  taskId,
  provenance,
  implementationPull,
  closurePull,
  implementationAncestor = true,
  closureFiles = [],
  runtimeSource,
}) {
  const errors = [];
  if (!provenance || provenance.implementationPr === provenance.closurePr) return errors;
  if (implementationPull?.number !== provenance.implementationPr) {
    errors.push(`${taskId} implementation PR mismatch`);
  }
  if (!implementationPull?.merged || !implementationPull?.merged_at) {
    errors.push(`${taskId} implementation PR is not merged`);
  }
  if (implementationPull?.head?.sha !== provenance.implementationHeadSha) {
    errors.push(`${taskId} implementation Head SHA mismatch`);
  }
  if (implementationPull?.merge_commit_sha !== provenance.implementationMergeSha) {
    errors.push(`${taskId} implementation merge SHA mismatch`);
  }
  if (closurePull?.number !== provenance.closurePr) errors.push(`${taskId} closure PR mismatch`);
  if (closurePull?.head?.sha !== provenance.closureHeadSha) {
    errors.push(`${taskId} closure Head SHA mismatch`);
  }
  if (closurePull?.merge_commit_sha !== provenance.closureMergeSha) {
    errors.push(`${taskId} closure merge SHA mismatch`);
  }
  if (!implementationAncestor) errors.push(`${taskId} implementation merge is not an ancestor`);
  const allowed = new Set([
    `docs/tasks/runtime/${taskId}.json`,
    runtimeSource,
    'docs/tasks/TASK_INDEX.md',
  ]);
  for (const file of closureFiles) {
    if (!allowed.has(file) && !file.startsWith(`docs/test-evidence/${taskId}/`)) {
      errors.push(`${taskId} closure changed non-closure path: ${file}`);
    }
  }
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
  implementationPull = pull,
  taskId = null,
  taskProvenance = null,
  implementationAncestor = true,
  closureFiles = [],
  runtimeSource = null,
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
  if (pull.head?.ref !== 'work') {
    throw new Error(`Pull request #${sourcePr} must originate from work`);
  }
  if (pull.head?.sha !== sourceHeadSha) {
    throw new Error(`Pull request #${sourcePr} head SHA changed after permanent checks`);
  }
  if (pull.merge_commit_sha !== expectedSha) {
    throw new Error(`Pull request #${sourcePr} did not produce ${expectedSha}`);
  }
  if (taskId && taskProvenance) {
    const provenanceErrors = validateSplitTaskProvenance({
      taskId,
      provenance: taskProvenance,
      implementationPull,
      closurePull: pull,
      implementationAncestor,
      closureFiles,
      runtimeSource,
    });
    if (provenanceErrors.length > 0) throw new Error(provenanceErrors.join('\n'));
  }

  const latest = latestChecksByName(checkRuns);
  const missing = [];
  for (const name of requiredChecks) {
    const check = latest.get(name);
    if (check?.status !== 'completed' || check.conclusion !== 'success') missing.push(name);
  }
  if (missing.length > 0) {
    throw new Error(`Source PR permanent checks are not successful: ${missing.join(', ')}`);
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
    const checkRuns = await loadCheckRuns();
    const checkState = requiredCheckState(checkRuns, requiredChecks);
    if (checkState.failed.length > 0) {
      throw new Error(`Source PR permanent checks failed: ${checkState.failed.join(', ')}`);
    }
    if (checkState.ready) return checkRuns;
    if (attempt === attempts) {
      throw new Error(
        `Timed out waiting for source PR permanent checks: ${checkState.pending.join(', ')}`,
      );
    }
    if (attempt === 1 || attempt % 6 === 0) {
      log(`Waiting for source PR permanent checks: ${checkState.pending.join(', ')}`);
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
    const page = collectionKey === null ? payload : payload[collectionKey];
    if (!Array.isArray(page)) {
      throw new Error(`GitHub API pagination payload is missing ${collectionKey ?? 'array data'}`);
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
  const expectedTaskId = process.env.EXPECTED_TASK_ID || null;
  const githubRef = process.env.GITHUB_REF;
  const githubSha = process.env.GITHUB_SHA;
  if (!token || !repository) throw new Error('GitHub Actions environment is incomplete');

  const config = JSON.parse(await readFile('.github/governance/required-checks.json', 'utf8'));
  const [owner, repo] = repository.split('/');
  const pull = await api(token, `/repos/${owner}/${repo}/pulls/${sourcePr}`);
  const taskId = taskIdFromPullBody(pull.body ?? '');
  validateCapturedTaskId(expectedTaskId, taskId);
  let runtime = null;
  let provenance = null;
  if (taskId) {
    runtime = JSON.parse(await readFile(`docs/tasks/runtime/${taskId}.json`, 'utf8'));
    const corrections = await loadTaskProvenanceCorrections();
    provenance = taskVerificationProvenance(runtime, corrections[taskId] ?? null);
  }
  const implementationPr = provenance?.implementationPr ?? sourcePr;
  const implementationPull =
    implementationPr === sourcePr
      ? pull
      : await api(token, `/repos/${owner}/${repo}/pulls/${implementationPr}`);
  const implementationHeadSha = implementationPull.head?.sha;
  assertFullSha(implementationHeadSha, 'IMPLEMENTATION_HEAD_SHA');
  const checkRuns = await waitForSourceReadyChecks({
    requiredChecks: config.requiredChecks,
    loadCheckRuns: () =>
      paginatedCollection(
        token,
        `/repos/${owner}/${repo}/commits/${implementationHeadSha}/check-runs?per_page=100`,
        'check_runs',
      ),
  });
  const implementationFiles = await paginatedCollection(
    token,
    `/repos/${owner}/${repo}/pulls/${implementationPr}/files?per_page=100`,
    null,
  );
  if (implementationRequiresFullQuality(implementationFiles.map((entry) => entry.filename))) {
    const modeState = await modeAwareChecksState(owner, repo, implementationHeadSha);
    if (!modeState.ready) {
      throw new Error(
        `Implementation PR full quality matrix is incomplete: ${[
          ...modeState.pending,
          ...modeState.failed,
        ].join(', ')}`,
      );
    }
  }
  const split = provenance && provenance.implementationPr !== provenance.closurePr;
  const comparison = split
    ? await api(
        token,
        `/repos/${owner}/${repo}/compare/${provenance.implementationMergeSha}...${expectedSha}`,
      )
    : null;

  validateMainVerification({
    repository,
    baseBranch: config.baseBranch,
    expectedSha,
    sourcePr,
    sourceHeadSha,
    githubRef,
    githubSha,
    pull,
    implementationPull,
    taskId,
    taskProvenance: provenance,
    implementationAncestor: comparison
      ? comparison.merge_base_commit?.sha === provenance.implementationMergeSha
      : true,
    closureFiles: comparison?.files?.map((entry) => entry.filename) ?? [],
    runtimeSource: runtime?.source ?? null,
    requiredChecks: config.requiredChecks,
    checkRuns,
  });
  console.log(
    `Main verification provenance passed for ${expectedSha} from closure PR #${sourcePr}; implementation PR #${implementationPr} (${implementationHeadSha}).`,
  );
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
  const expectedTaskId = process.env.EXPECTED_TASK_ID || null;
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
  validateCapturedTaskId(expectedTaskId, taskId);
  let taskBindingErrors = [];
  if (taskId) {
    try {
      const runtime = JSON.parse(await readFile(`docs/tasks/runtime/${taskId}.json`, 'utf8'));
      const corrections = await loadTaskProvenanceCorrections();
      taskBindingErrors = validateTaskVerificationBinding(
        runtime,
        {
          taskId,
          sourcePr,
        },
        corrections[taskId] ?? null,
      );
    } catch (error) {
      taskBindingErrors = [`${taskId} runtime unavailable: ${error.message}`];
    }
  }

  const success =
    validateResult === 'success' && qualityResult === 'success' && taskBindingErrors.length === 0;
  await publishCommitStatus(
    token,
    repository,
    expectedSha,
    mainVerificationStatusPayload(success, targetUrl),
  );
  if (taskId) {
    await publishCommitStatus(
      token,
      repository,
      expectedSha,
      taskVerificationStatusPayload(taskId, success, targetUrl),
    );
  }
  if (!success) {
    throw new Error(
      `Final main verification failed: validate=${validateResult}, quality=${qualityResult}, task=${taskBindingErrors.join('; ') || 'none'}`,
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
