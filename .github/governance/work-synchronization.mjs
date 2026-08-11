/* global console, process */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const apiRoot = 'https://api.github.com';
const fullSha = /^[0-9a-f]{40}$/iu;
const integrationBranches = new Set(['work', 'governance']);

async function api(pathname, options = {}, accepted = []) {
  const response = await globalThis.fetch(new globalThis.URL(pathname, apiRoot), {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers ?? {}),
    },
  });
  const body = await response.text();
  if (!response.ok && !accepted.includes(response.status)) {
    throw new Error(`GitHub API ${response.status}: ${pathname}\n${body}`);
  }
  return response.ok && body ? JSON.parse(body) : null;
}

export function synchronizationDecision({
  mainSha,
  workSha,
  sourceHeadSha,
  openPulls,
  branchName = 'work',
}) {
  if (!fullSha.test(mainSha ?? '')) return { action: 'blocked', reason: 'invalid-main-sha' };
  if (openPulls > 0) return { action: 'blocked', reason: `new-${branchName}-pull-request-open` };
  if (workSha === null) return { action: 'create', reason: `${branchName}-missing` };
  if (!fullSha.test(workSha ?? '')) return { action: 'blocked', reason: `invalid-${branchName}-sha` };
  if (workSha === mainSha) return { action: 'keep', reason: 'already-synchronized' };
  if (workSha !== sourceHeadSha) {
    return { action: 'blocked', reason: `${branchName}-advanced-after-merge` };
  }
  return { action: 'reset', reason: 'verified-squash-complete' };
}

export function synchronizationRequest(event) {
  const run = event?.workflow_run;
  if (run) {
    if (run.name !== 'Main Verification' || run.conclusion !== 'success') {
      throw new Error('Branch synchronization requires a successful Main Verification workflow_run');
    }
    if (!fullSha.test(run.head_sha ?? '')) {
      throw new Error('Main Verification workflow_run must provide a full head SHA');
    }
    return {
      mode: 'workflow-run',
      mainSha: run.head_sha,
      sourcePr: null,
      sourceHeadSha: null,
    };
  }

  const mainSha = event?.inputs?.expected_sha;
  const sourcePr = Number.parseInt(event?.inputs?.source_pr ?? '', 10);
  const sourceHeadSha = event?.inputs?.source_head_sha;
  if (!fullSha.test(mainSha ?? '')) {
    throw new Error('Manual branch synchronization requires expected_sha');
  }
  if (!Number.isSafeInteger(sourcePr) || sourcePr < 1) {
    throw new Error('Manual branch synchronization requires source_pr');
  }
  if (!fullSha.test(sourceHeadSha ?? '')) {
    throw new Error('Manual branch synchronization requires source_head_sha');
  }
  return {
    mode: 'workflow-dispatch',
    mainSha,
    sourcePr,
    sourceHeadSha,
  };
}

export function assertSynchronizedWorkRef(workRef, mainSha, branchName = 'work') {
  const finalBranchSha = workRef?.object?.sha;
  if (!fullSha.test(finalBranchSha ?? '')) {
    throw new Error(`Branch synchronization postcondition could not read the final ${branchName} SHA`);
  }
  if (finalBranchSha !== mainSha) {
    throw new Error(
      `Branch synchronization postcondition failed: ${branchName}=${finalBranchSha}, main=${mainSha}`,
    );
  }
  return finalBranchSha;
}

export async function waitForSynchronizedWorkRef(
  readWorkRef,
  mainSha,
  { attempts = 20, intervalMs = 500, branchName = 'work' } = {},
) {
  if (!Number.isSafeInteger(attempts) || attempts < 1) throw new Error('attempts must be positive');
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 0) {
    throw new Error('intervalMs must be a non-negative integer');
  }
  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = await readWorkRef();
    if (last?.object?.sha === mainSha) return assertSynchronizedWorkRef(last, mainSha, branchName);
    if (attempt < attempts) await delay(intervalMs);
  }
  return assertSynchronizedWorkRef(last, mainSha, branchName);
}

function hasSuccessfulMainVerification(status) {
  return status?.statuses?.some(
    (entry) => entry.context === 'main-verification' && entry.state === 'success',
  );
}

async function writeReport(output, name, payload) {
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, name), `${JSON.stringify(payload, null, 2)}\n`);
}

async function main() {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY || !process.env.GITHUB_EVENT_PATH) {
    throw new Error('Missing GitHub Actions environment');
  }
  const output = process.env.WORK_SYNCHRONIZATION_OUTPUT ?? 'artifacts/work-synchronization';
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const request = synchronizationRequest(event);
  const mainSha = request.mainSha;
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  const mainRef = await api(`/repos/${owner}/${repo}/git/ref/heads/main`);
  if (mainRef?.object?.sha !== mainSha) {
    throw new Error(`Verified main ${mainSha} is no longer current`);
  }
  const status = await api(`/repos/${owner}/${repo}/commits/${mainSha}/status`);
  if (!hasSuccessfulMainVerification(status)) {
    throw new Error(`main-verification status is not successful for ${mainSha}`);
  }
  const pulls = await api(`/repos/${owner}/${repo}/commits/${mainSha}/pulls?per_page=100`);
  const source = pulls.find(
    (pull) =>
      pull.merged_at &&
      pull.base?.ref === 'main' &&
      integrationBranches.has(pull.head?.ref) &&
      (request.sourcePr === null || pull.number === request.sourcePr) &&
      (request.sourceHeadSha === null || pull.head?.sha === request.sourceHeadSha),
  );
  if (!source || !fullSha.test(source.head?.sha ?? '')) {
    throw new Error('Cannot resolve the merged work/governance pull request for the verified main commit');
  }

  const sourceBranch = source.head.ref;
  const sourceRef = await api(`/repos/${owner}/${repo}/git/ref/heads/${sourceBranch}`, {}, [404]);
  const openPulls = await api(
    `/repos/${owner}/${repo}/pulls?state=open&base=main&head=${owner}:${sourceBranch}&per_page=100`,
  );
  const decision = synchronizationDecision({
    mainSha,
    workSha: sourceRef?.object?.sha ?? null,
    sourceHeadSha: source.head.sha,
    openPulls: openPulls.length,
    branchName: sourceBranch,
  });
  if (decision.action === 'blocked') {
    throw new Error(`Branch synchronization blocked: ${decision.reason}`);
  }
  if (decision.action === 'create') {
    await api(`/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: `refs/heads/${sourceBranch}`, sha: mainSha }),
    });
  } else if (decision.action === 'reset') {
    await api(`/repos/${owner}/${repo}/git/refs/heads/${sourceBranch}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: mainSha, force: true }),
    });
  }

  let finalBranchSha;
  try {
    finalBranchSha = await waitForSynchronizedWorkRef(
      () => api(`/repos/${owner}/${repo}/git/ref/heads/${sourceBranch}`),
      mainSha,
      { branchName: sourceBranch },
    );
  } catch (error) {
    await writeReport(output, 'failure.json', {
      mode: request.mode,
      mainSha,
      sourcePr: source.number,
      sourceHeadSha: source.head.sha,
      sourceBranch,
      decision,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  await writeReport(output, 'result.json', {
    mode: request.mode,
    mainSha,
    sourcePr: source.number,
    sourceHeadSha: source.head.sha,
    sourceBranch,
    finalBranchSha,
    decision,
  });
  console.log(
    `${sourceBranch} synchronization ${decision.action}: ${decision.reason}; postcondition passed.`,
  );
}

function selfTest() {
  const a = 'a'.repeat(40);
  const b = 'b'.repeat(40);
  assert.deepEqual(
    synchronizationDecision({ mainSha: a, workSha: b, sourceHeadSha: b, openPulls: 0 }),
    {
      action: 'reset',
      reason: 'verified-squash-complete',
    },
  );
  assert.equal(
    synchronizationDecision({
      mainSha: a,
      workSha: 'c'.repeat(40),
      sourceHeadSha: b,
      openPulls: 0,
    }).action,
    'blocked',
  );
  assert.equal(
    synchronizationDecision({ mainSha: a, workSha: b, sourceHeadSha: b, openPulls: 1 }).action,
    'blocked',
  );
  assert.deepEqual(
    synchronizationDecision({
      mainSha: a,
      workSha: null,
      sourceHeadSha: b,
      openPulls: 0,
      branchName: 'governance',
    }),
    { action: 'create', reason: 'governance-missing' },
  );
  assert.deepEqual(
    synchronizationRequest({
      workflow_run: { name: 'Main Verification', conclusion: 'success', head_sha: a },
    }),
    { mode: 'workflow-run', mainSha: a, sourcePr: null, sourceHeadSha: null },
  );
  assert.deepEqual(
    synchronizationRequest({
      inputs: { expected_sha: a, source_pr: '301', source_head_sha: b },
    }),
    { mode: 'workflow-dispatch', mainSha: a, sourcePr: 301, sourceHeadSha: b },
  );
  assert.equal(assertSynchronizedWorkRef({ object: { sha: a } }, a), a);
  assert.equal(assertSynchronizedWorkRef({ object: { sha: a } }, a, 'governance'), a);
  assert.throws(
    () => assertSynchronizedWorkRef({ object: { sha: b } }, a),
    /postcondition failed/u,
  );
  console.log('Integration branch synchronization self-test passed.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'self-test') selfTest();
  else await main();
}
