/* global console, process */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

async function eventPayload() {
  if (!process.env.GITHUB_EVENT_PATH) return {};
  return JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
}

export function validatePullRequestShape({ head, base, sameRepository = true }) {
  const errors = [];
  if (head !== 'work') errors.push(`Pull request head must be work, found ${head || '<missing>'}`);
  if (base !== 'main') errors.push(`Pull request base must be main, found ${base || '<missing>'}`);
  if (!sameRepository) errors.push('Pull request head must belong to this repository');
  return errors;
}

async function validateOpenPullRequestCount(event) {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) return [];
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  const response = await globalThis.fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&base=main&head=${owner}:work&per_page=100`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );
  if (!response.ok) return [`Unable to inspect open work pull requests: ${response.status}`];
  const pulls = await response.json();
  const current = event.pull_request?.number;
  const distinct = pulls.filter((pull) => pull.number !== current);
  return distinct.length > 0 ? ['Another work to main pull request is already open'] : [];
}

async function validate() {
  const event = await eventPayload();
  const pull = event.pull_request ?? {};
  const errors = [
    ...validatePullRequestShape({
      head: pull.head?.ref ?? process.env.TASK_PR_HEAD_REF ?? process.env.GITHUB_HEAD_REF,
      base: pull.base?.ref ?? process.env.TASK_BASE_BRANCH,
      sameRepository:
        !pull.head?.repo?.full_name || pull.head.repo.full_name === process.env.GITHUB_REPOSITORY,
    }),
    ...(await validateOpenPullRequestCount(event)),
  ];
  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log('Single work pull request policy passed without task authorization gating.');
}

function selfTest() {
  assert.deepEqual(validatePullRequestShape({ head: 'work', base: 'main' }), []);
  assert.ok(validatePullRequestShape({ head: 'work/task', base: 'main' }).length > 0);
  assert.ok(validatePullRequestShape({ head: 'work', base: 'release' }).length > 0);
  assert.ok(
    validatePullRequestShape({ head: 'work', base: 'main', sameRepository: false }).length > 0,
  );
  console.log('Single work policy self-test passed.');
}

const command = process.argv[2] ?? 'validate';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (command === 'self-test') selfTest();
  else if (command === 'validate') await validate();
  else throw new Error(`Unknown single-work-policy command: ${command}`);
}
