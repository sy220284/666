/* global console, process */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function api(pathname) {
  const response = await fetch(new URL(pathname, 'https://api.github.com'), {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${pathname}`);
  return response.json();
}

export function invalidBranches(names) {
  return names.filter((name) => !['main', 'work'].includes(name)).sort();
}

async function main() {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) {
    throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required');
  }
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  const branches = [];
  for (let page = 1; ; page += 1) {
    const batch = await api(`/repos/${owner}/${repo}/branches?per_page=100&page=${page}`);
    branches.push(...batch.map((branch) => branch.name));
    if (batch.length < 100) break;
  }
  const invalid = invalidBranches(branches);
  const output = process.env.BRANCH_INVENTORY_OUTPUT ?? 'artifacts/branch-hygiene';
  await mkdir(output, { recursive: true });
  await writeFile(
    path.join(output, 'branch-inventory.json'),
    `${JSON.stringify({ branches: branches.sort(), invalid }, null, 2)}\n`,
  );
  if (invalid.length > 0) throw new Error(`Unexpected repository branches: ${invalid.join(', ')}`);
  console.log('Branch inventory contains only main and work.');
}

function selfTest() {
  assert.deepEqual(invalidBranches(['work', 'main']), []);
  assert.deepEqual(invalidBranches(['main', 'work/task', 'policy/x']), ['policy/x', 'work/task']);
  console.log('Branch inventory self-test passed.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'self-test') selfTest();
  else await main();
}
