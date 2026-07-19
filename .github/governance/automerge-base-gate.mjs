import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const githubFetch = globalThis.fetch;

function statusOrder(status) {
  const timestamp = Date.parse(status.created_at ?? status.updated_at ?? '');
  return {
    timestamp: Number.isFinite(timestamp) ? timestamp : 0,
    id: Number(status.id ?? 0),
  };
}

export function baseVerificationDecision(statuses = [], options = {}) {
  const matching = statuses.filter((status) => status.context === 'main-verification');
  matching.sort((left, right) => {
    const a = statusOrder(left);
    const b = statusOrder(right);
    return a.timestamp - b.timestamp || a.id - b.id;
  });
  const latest = matching.at(-1);
  if (!latest) return options.allowMissing === true ? 'bootstrap' : 'pending';
  if (latest.state === 'success') return 'ready';
  if (latest.state === 'failure' || latest.state === 'error') return 'failed';
  return 'pending';
}

async function api(token, pathname) {
  const url = new URL(pathname, 'https://api.github.com');
  const response = await githubFetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${url.pathname}${url.search}`);
  }
  return response.json();
}

async function waitForVerifiedBase() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!token || !repository || !eventPath || typeof githubFetch !== 'function') {
    throw new Error('GitHub Actions environment is incomplete');
  }

  const [owner, repo] = repository.split('/');
  const event = JSON.parse(await readFile(eventPath, 'utf8'));
  const headSha = event.workflow_run?.head_sha;
  if (!headSha) throw new Error('workflow_run head SHA is missing');

  const config = JSON.parse(
    await readFile('.github/governance/required-checks.json', 'utf8'),
  );
  const pulls = await api(
    token,
    `/repos/${owner}/${repo}/commits/${headSha}/pulls?per_page=100`,
  );
  const mainRef = await api(
    token,
    `/repos/${owner}/${repo}/git/ref/heads/${config.baseBranch}`,
  );

  for (const pull of pulls) {
    if (pull.state !== 'open' || pull.base?.ref !== config.baseBranch) continue;
    if (pull.head?.sha !== headSha) continue;
    if (pull.base.sha !== mainRef.object.sha) {
      console.log(
        `Skipping base verification wait for #${pull.number}; its base is not current ${config.baseBranch}.`,
      );
      continue;
    }

    const allowMissing = pull.base.sha === config.mainVerificationBaselineSha;
    for (let attempt = 1; attempt <= 90; attempt += 1) {
      const combined = await api(
        token,
        `/repos/${owner}/${repo}/commits/${pull.base.sha}/status`,
      );
      const decision = baseVerificationDecision(combined.statuses ?? [], { allowMissing });
      if (decision === 'ready' || decision === 'bootstrap') {
        console.log(
          `Base main verification is ${decision} for #${pull.number} at ${pull.base.sha}.`,
        );
        break;
      }
      if (decision === 'failed') {
        throw new Error(`Base main verification failed for ${pull.base.sha}`);
      }
      if (attempt === 90) {
        throw new Error(`Timed out waiting for base main verification: ${pull.base.sha}`);
      }
      if (attempt === 1 || attempt % 6 === 0) {
        console.log(
          `Waiting for main-verification on ${pull.base.sha} (attempt ${attempt}/90).`,
        );
      }
      await delay(10_000);
    }
  }
}

function selfTest() {
  assert.equal(baseVerificationDecision([], { allowMissing: true }), 'bootstrap');
  assert.equal(baseVerificationDecision([], { allowMissing: false }), 'pending');
  assert.equal(
    baseVerificationDecision([
      { context: 'main-verification', state: 'success', id: 1 },
    ]),
    'ready',
  );
  assert.equal(
    baseVerificationDecision([
      { context: 'main-verification', state: 'failure', id: 2 },
    ]),
    'failed',
  );
  assert.equal(
    baseVerificationDecision([
      { context: 'main-verification', state: 'success', id: 1, created_at: '2026-01-01' },
      { context: 'main-verification', state: 'pending', id: 2, created_at: '2026-01-02' },
    ]),
    'pending',
  );
  console.log('automerge base gate self-test passed');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'self-test') selfTest();
  else await waitForVerifiedBase();
}
