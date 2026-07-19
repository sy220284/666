/* global console, process */
import { readFile } from 'node:fs/promises';

import { ensureMainVerification } from '../../scripts/automerge.mjs';

const eventPath = process.env.GITHUB_EVENT_PATH;
const repository = process.env.GITHUB_REPOSITORY;
if (!eventPath || !repository) throw new Error('Missing GitHub Actions environment');

const event = JSON.parse(await readFile(eventPath, 'utf8'));
const pull = event.pull_request;
if (!pull?.merged) {
  console.log('Pull request was not merged; no main verification is required.');
} else {
  const [owner, repo] = repository.split('/');
  const config = JSON.parse(await readFile('.github/governance/required-checks.json', 'utf8'));
  await ensureMainVerification(
    owner,
    repo,
    config,
    pull.merge_commit_sha,
    pull.number,
    pull.head.sha,
  );
}
