import { readFile, writeFile } from 'node:fs/promises';

async function ensurePullRequestEvents(path) {
  const source = await readFile(path, 'utf8');
  const before = '  pull_request:\n    branches: [main]\n';
  const after =
    '  pull_request:\n    branches: [main]\n    types: [opened, synchronize, reopened, ready_for_review]\n';
  await writeFile(path, source.includes(after) ? source : source.replace(before, after), 'utf8');
}

for (const path of [
  '.github/workflows/task-governance.yml',
  '.github/workflows/pr-policy.yml',
  '.github/workflows/evidence.yml',
]) {
  await ensurePullRequestEvents(path);
}

const automergePath = '.github/workflows/automerge.yml';
const automerge = await readFile(automergePath, 'utf8');
await writeFile(automergePath, automerge.replace(/^name: Auto Merge$/mu, 'name: Controlled Merge'), 'utf8');

await writeFile(
  '.github/workflows/post-merge-verification.yml',
  `name: Post Merge Verification Dispatcher

on:
  pull_request:
    branches: [main]
    types: [closed]

permissions:
  actions: write
  contents: read
  pull-requests: read

concurrency:
  group: post-merge-verification-\${{ github.event.pull_request.merge_commit_sha || github.run_id }}
  cancel-in-progress: false

jobs:
  dispatch:
    if: \${{ github.event.pull_request.merged == true }}
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v6
        with:
          ref: main
          persist-credentials: false
      - uses: actions/setup-node@v6
        with:
          node-version: 24
      - name: Idempotently schedule Main Verification
        env:
          GITHUB_TOKEN: \${{ github.token }}
        run: node .github/governance/post-merge-verification.mjs
`,
  'utf8',
);
