/* global console, process */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const apiRoot = 'https://api.github.com';
const fullSha = /^[0-9a-f]{40}$/iu;
const integrationBranches = Object.freeze(['work', 'governance']);

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

function validComparison(comparison) {
  return (
    Number.isSafeInteger(comparison?.ahead_by) &&
    comparison.ahead_by >= 0 &&
    Number.isSafeInteger(comparison?.behind_by) &&
    comparison.behind_by >= 0
  );
}

export function synchronizationDecision({
  mainSha,
  branchSha,
  sourceHeadSha,
  openPulls,
  branchName = 'work',
  isSourceBranch = true,
  comparison = null,
}) {
  if (!fullSha.test(mainSha ?? '')) return { action: 'blocked', reason: 'invalid-main-sha' };
  if (!Number.isSafeInteger(openPulls) || openPulls < 0) {
    return { action: 'blocked', reason: `invalid-${branchName}-open-pull-count` };
  }
  if (openPulls > 0) {
    return isSourceBranch
      ? { action: 'blocked', reason: `new-${branchName}-pull-request-open` }
      : { action: 'blocked', reason: `active-${branchName}-requires-main-sync` };
  }
  if (branchSha === null) return { action: 'create', reason: `${branchName}-missing` };
  if (!fullSha.test(branchSha ?? '')) {
    return { action: 'blocked', reason: `invalid-${branchName}-sha` };
  }
  if (branchSha === mainSha) return { action: 'keep', reason: 'already-synchronized' };

  if (isSourceBranch) {
    if (!fullSha.test(sourceHeadSha ?? '')) {
      return { action: 'blocked', reason: 'invalid-source-head-sha' };
    }
    if (branchSha !== sourceHeadSha) {
      return { action: 'blocked', reason: `${branchName}-advanced-after-merge` };
    }
    return { action: 'reset', reason: 'verified-squash-complete' };
  }

  if (!validComparison(comparison)) {
    return { action: 'blocked', reason: `invalid-${branchName}-main-comparison` };
  }
  if (comparison.behind_by === 0 && comparison.ahead_by > 0) {
    return { action: 'fast-forward', reason: 'idle-branch-behind-verified-main' };
  }
  return { action: 'blocked', reason: `${branchName}-not-fast-forwardable-to-main` };
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

export function assertSynchronizedIntegrationRef(branchRef, mainSha, branchName = 'work') {
  const finalBranchSha = branchRef?.object?.sha;
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

export async function waitForSynchronizedIntegrationRef(
  readBranchRef,
  mainSha,
  { attempts = 20, intervalMs = 500, branchName = 'work' } = {},
) {
  if (!Number.isSafeInteger(attempts) || attempts < 1) throw new Error('attempts must be positive');
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 0) {
    throw new Error('intervalMs must be a non-negative integer');
  }
  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = await readBranchRef();
    if (last?.object?.sha === mainSha) {
      return assertSynchronizedIntegrationRef(last, mainSha, branchName);
    }
    if (attempt < attempts) await delay(intervalMs);
  }
  return assertSynchronizedIntegrationRef(last, mainSha, branchName);
}

// Compatibility export for older tests/tools; new code should use the integration-branch name.
export const assertSynchronizedWorkRef = assertSynchronizedIntegrationRef;

function hasSuccessfulMainVerification(status) {
  return status?.statuses?.some(
    (entry) => entry.context === 'main-verification' && entry.state === 'success',
  );
}

async function writeReport(output, name, payload) {
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, name), `${JSON.stringify(payload, null, 2)}\n`);
}

async function branchComparison(owner, repo, branchSha, mainSha) {
  if (!fullSha.test(branchSha ?? '') || branchSha === mainSha) return null;
  return api(
    `/repos/${owner}/${repo}/compare/${encodeURIComponent(branchSha)}...${encodeURIComponent(mainSha)}`,
  );
}

async function synchronizeBranch({
  owner,
  repo,
  branchName,
  mainSha,
  sourceBranch,
  sourceHeadSha,
}) {
  const isSourceBranch = branchName === sourceBranch;
  const branchRef = await api(`/repos/${owner}/${repo}/git/ref/heads/${branchName}`, {}, [404]);
  const branchSha = branchRef?.object?.sha ?? null;
  const openPulls = await api(
    `/repos/${owner}/${repo}/pulls?state=open&base=main&head=${owner}:${branchName}&per_page=100`,
  );
  const comparison = isSourceBranch
    ? null
    : await branchComparison(owner, repo, branchSha, mainSha);
  const decision = synchronizationDecision({
    mainSha,
    branchSha,
    sourceHeadSha,
    openPulls: openPulls.length,
    branchName,
    isSourceBranch,
    comparison,
  });

  if (decision.action === 'blocked') {
    throw new Error(`Branch synchronization blocked for ${branchName}: ${decision.reason}`);
  }
  if (decision.action === 'skip') {
    return {
      branchName,
      isSourceBranch,
      initialBranchSha: branchSha,
      finalBranchSha: branchSha,
      decision,
    };
  }
  if (decision.action === 'create') {
    await api(`/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: mainSha }),
    });
  } else if (decision.action === 'reset') {
    await api(`/repos/${owner}/${repo}/git/refs/heads/${branchName}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: mainSha, force: true }),
    });
  } else if (decision.action === 'fast-forward') {
    await api(`/repos/${owner}/${repo}/git/refs/heads/${branchName}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: mainSha, force: false }),
    });
  }

  const finalBranchSha = await waitForSynchronizedIntegrationRef(
    () => api(`/repos/${owner}/${repo}/git/ref/heads/${branchName}`),
    mainSha,
    { branchName },
  );
  return {
    branchName,
    isSourceBranch,
    initialBranchSha: branchSha,
    finalBranchSha,
    decision,
  };
}

async function main() {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY || !process.env.GITHUB_EVENT_PATH) {
    throw new Error('Missing GitHub Actions environment');
  }
  const output =
    process.env.INTEGRATION_SYNCHRONIZATION_OUTPUT ??
    process.env.WORK_SYNCHRONIZATION_OUTPUT ??
    'artifacts/integration-synchronization';
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
      integrationBranches.includes(pull.head?.ref) &&
      (request.sourcePr === null || pull.number === request.sourcePr) &&
      (request.sourceHeadSha === null || pull.head?.sha === request.sourceHeadSha),
  );
  if (!source || !fullSha.test(source.head?.sha ?? '')) {
    throw new Error('Cannot resolve the merged work/governance pull request for the verified main commit');
  }

  const sourceBranch = source.head.ref;
  const branchResults = [];
  try {
    for (const branchName of integrationBranches) {
      branchResults.push(
        await synchronizeBranch({
          owner,
          repo,
          branchName,
          mainSha,
          sourceBranch,
          sourceHeadSha: source.head.sha,
        }),
      );
    }
  } catch (error) {
    await writeReport(output, 'failure.json', {
      mode: request.mode,
      mainSha,
      sourcePr: source.number,
      sourceHeadSha: source.head.sha,
      sourceBranch,
      branchResults,
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
    branchResults,
  });
  for (const result of branchResults) {
    console.log(
      `${result.branchName} synchronization ${result.decision.action}: ${result.decision.reason}.`,
    );
  }
}

function selfTest() {
  const a = 'a'.repeat(40);
  const b = 'b'.repeat(40);
  assert.deepEqual(
    synchronizationDecision({
      mainSha: a,
      branchSha: b,
      sourceHeadSha: b,
      openPulls: 0,
      isSourceBranch: true,
    }),
    { action: 'reset', reason: 'verified-squash-complete' },
  );
  assert.deepEqual(
    synchronizationDecision({
      mainSha: a,
      branchSha: b,
      sourceHeadSha: 'c'.repeat(40),
      openPulls: 0,
      branchName: 'work',
      isSourceBranch: false,
      comparison: { ahead_by: 1, behind_by: 0 },
    }),
    { action: 'fast-forward', reason: 'idle-branch-behind-verified-main' },
  );
  assert.deepEqual(
    synchronizationDecision({
      mainSha: a,
      branchSha: b,
      sourceHeadSha: 'c'.repeat(40),
      openPulls: 1,
      branchName: 'work',
      isSourceBranch: false,
      comparison: { ahead_by: 1, behind_by: 0 },
    }),
    { action: 'blocked', reason: 'active-work-requires-main-sync' },
  );
  assert.equal(
    synchronizationDecision({
      mainSha: a,
      branchSha: b,
      sourceHeadSha: 'c'.repeat(40),
      openPulls: 0,
      branchName: 'work',
      isSourceBranch: false,
      comparison: { ahead_by: 1, behind_by: 1 },
    }).action,
    'blocked',
  );
  assert.deepEqual(
    synchronizationDecision({
      mainSha: a,
      branchSha: null,
      sourceHeadSha: b,
      openPulls: 0,
      branchName: 'governance',
      isSourceBranch: false,
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
  assert.equal(assertSynchronizedIntegrationRef({ object: { sha: a } }, a), a);
  assert.equal(assertSynchronizedIntegrationRef({ object: { sha: a } }, a, 'governance'), a);
  assert.throws(
    () => assertSynchronizedIntegrationRef({ object: { sha: b } }, a),
    /postcondition failed/u,
  );
  console.log('Integration branch synchronization self-test passed.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'self-test') selfTest();
  else await main();
}
