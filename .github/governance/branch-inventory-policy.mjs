/* global console, process */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const requiredBranches = Object.freeze(['main', 'work', 'governance']);
const integrationBranches = Object.freeze(['work', 'governance']);
const apiRoot = 'https://api.github.com';

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

async function listBranches(owner, repo) {
  const branches = [];
  for (let page = 1; ; page += 1) {
    const batch = await api(`/repos/${owner}/${repo}/branches?per_page=100&page=${page}`);
    branches.push(...batch.map((branch) => branch.name));
    if (batch.length < 100) break;
  }
  return branches.sort();
}

async function repairBranches(owner, repo, names) {
  const invalid = invalidBranches(names);
  for (const name of invalid) {
    const encoded = name.split('/').map(encodeURIComponent).join('/');
    await api(`/repos/${owner}/${repo}/git/refs/heads/${encoded}`, { method: 'DELETE' });
    console.log(`Deleted unexpected branch ${name}.`);
  }

  const main = await api(`/repos/${owner}/${repo}/git/ref/heads/main`);
  for (const branch of integrationBranches) {
    if (names.includes(branch)) continue;
    await api(`/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: main.object.sha }),
    });
    console.log(`Recreated missing ${branch} branch from main.`);
  }
}

async function main() {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) {
    throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required');
  }
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  let branches = await listBranches(owner, repo);
  const repair = process.argv.includes('--repair');
  if (repair && branchInventoryErrors(branches).length > 0) {
    await repairBranches(owner, repo, branches);
    branches = await listBranches(owner, repo);
  }

  const invalid = invalidBranches(branches);
  const missing = missingBranches(branches);
  const errors = branchInventoryErrors(branches);
  const output = process.env.BRANCH_INVENTORY_OUTPUT ?? 'artifacts/branch-hygiene';
  await mkdir(output, { recursive: true });
  await writeFile(
    path.join(output, 'branch-inventory.json'),
    `${JSON.stringify({ branches, invalid, missing, repaired: repair }, null, 2)}\n`,
  );
  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log('Branch inventory contains exactly main, work and governance.');
}

function selfTest() {
  assert.deepEqual(branchInventoryErrors(['work', 'governance', 'main']), []);
  assert.deepEqual(missingBranches(['main']), ['work', 'governance']);
  assert.deepEqual(invalidBranches(['main', 'work', 'governance', 'work/task', 'policy/x']), [
    'policy/x',
    'work/task',
  ]);
  console.log('Branch inventory self-test passed.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'self-test') selfTest();
  else await main();
}
