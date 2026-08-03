/* global console, process */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = 'https://api.github.com';
const fullSha = /^[0-9a-f]{40}$/iu;

async function api(pathname, options = {}, accepted = []) {
  const response = await fetch(new URL(pathname, apiRoot), {
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

export function synchronizationDecision({ mainSha, workSha, sourceHeadSha, openPulls }) {
  if (!fullSha.test(mainSha ?? '')) return { action: 'blocked', reason: 'invalid-main-sha' };
  if (openPulls > 0) return { action: 'blocked', reason: 'new-work-pull-request-open' };
  if (workSha === null) return { action: 'create', reason: 'work-missing' };
  if (!fullSha.test(workSha ?? '')) return { action: 'blocked', reason: 'invalid-work-sha' };
  if (workSha === mainSha) return { action: 'keep', reason: 'already-synchronized' };
  if (workSha !== sourceHeadSha) return { action: 'blocked', reason: 'work-advanced-after-merge' };
  return { action: 'reset', reason: 'verified-squash-complete' };
}

async function main() {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY || !process.env.GITHUB_EVENT_PATH) {
    throw new Error('Missing GitHub Actions environment');
  }
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const run = event.workflow_run;
  if (run?.name !== 'Main Verification' || run?.conclusion !== 'success') {
    throw new Error('Work synchronization requires a successful Main Verification workflow_run');
  }
  const mainSha = run.head_sha;
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  const mainRef = await api(`/repos/${owner}/${repo}/git/ref/heads/main`);
  if (mainRef?.object?.sha !== mainSha) {
    throw new Error(`Verified main ${mainSha} is no longer current`);
  }
  const pulls = await api(`/repos/${owner}/${repo}/commits/${mainSha}/pulls?per_page=100`);
  const source = pulls.find(
    (pull) => pull.merged_at && pull.base?.ref === 'main' && pull.head?.ref === 'work',
  );
  if (!source || !fullSha.test(source.head?.sha ?? '')) {
    throw new Error('Cannot resolve the merged work pull request for the verified main commit');
  }
  const workRef = await api(`/repos/${owner}/${repo}/git/ref/heads/work`, {}, [404]);
  const openPulls = await api(`/repos/${owner}/${repo}/pulls?state=open&base=main&head=${owner}:work&per_page=100`);
  const decision = synchronizationDecision({
    mainSha,
    workSha: workRef?.object?.sha ?? null,
    sourceHeadSha: source.head.sha,
    openPulls: openPulls.length,
  });
  if (decision.action === 'blocked') throw new Error(`Work synchronization blocked: ${decision.reason}`);
  if (decision.action === 'create') {
    await api(`/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'refs/heads/work', sha: mainSha }),
    });
  } else if (decision.action === 'reset') {
    await api(`/repos/${owner}/${repo}/git/refs/heads/work`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: mainSha, force: true }),
    });
  }
  const output = process.env.WORK_SYNCHRONIZATION_OUTPUT ?? 'artifacts/work-synchronization';
  await mkdir(output, { recursive: true });
  await writeFile(
    path.join(output, 'result.json'),
    `${JSON.stringify({ mainSha, sourcePr: source.number, sourceHeadSha: source.head.sha, decision }, null, 2)}\n`,
  );
  console.log(`Work synchronization ${decision.action}: ${decision.reason}`);
}

function selfTest() {
  const a = 'a'.repeat(40);
  const b = 'b'.repeat(40);
  assert.deepEqual(synchronizationDecision({ mainSha: a, workSha: b, sourceHeadSha: b, openPulls: 0 }), {
    action: 'reset',
    reason: 'verified-squash-complete',
  });
  assert.equal(
    synchronizationDecision({ mainSha: a, workSha: 'c'.repeat(40), sourceHeadSha: b, openPulls: 0 }).action,
    'blocked',
  );
  assert.equal(synchronizationDecision({ mainSha: a, workSha: b, sourceHeadSha: b, openPulls: 1 }).action, 'blocked');
  console.log('Work synchronization self-test passed.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'self-test') selfTest();
  else await main();
}
