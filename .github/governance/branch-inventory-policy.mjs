/* global console, process */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const requiredBranches = Object.freeze(['main', 'work']);

async function api(pathname) {
  const response = await globalThis.fetch(
    new globalThis.URL(pathname, 'https://api.github.com'),
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${pathname}`);
  return response.json();
}

export function invalidBranches(names) {
  return names.filter((name) => !requiredBranches.includes(name)).sort();
}

export function missingBranches(names) {
  const actual = new Set(names);
  return requiredBranches.filter((name) => !actual.has(name));
}

export function branchInventoryErrors(names) {
  const errors = [];
  const invalid = invalidBranches(names);
  const missing = missingBranches(names);
  if (invalid.length > 0) errors.push(`Unexpected repository branches: ${invalid.join(', ')}`);
  if (missing.length > 0) errors.push(`Missing required repository branches: ${missing.join(', ')}`);
  return errors;
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
  const missing = missingBranches(branches);
  const errors = branchInventoryErrors(branches);
  const output = process.env.BRANCH_INVENTORY_OUTPUT ?? 'artifacts/branch-hygiene';
  await mkdir(output, { recursive: true });
  await writeFile(
    path.join(output, 'branch-inventory.json'),
    `${JSON.stringify({ branches: branches.sort(), invalid, missing }, null, 2)}\n`,
  );
  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log('Branch inventory contains exactly main and work.');
}

function selfTest() {
  assert.deepEqual(branchInventoryErrors(['work', 'main']), []);
  assert.deepEqual(missingBranches(['main']), ['work']);
  assert.deepEqual(invalidBranches(['main', 'work/task', 'policy/x']), ['policy/x', 'work/task']);
  console.log('Branch inventory self-test passed.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'self-test') selfTest();
  else await main();
}
