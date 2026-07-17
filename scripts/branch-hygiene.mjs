import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const outputDirectory = path.resolve(
  process.env.BRANCH_HYGIENE_OUTPUT ?? 'artifacts/branch-hygiene',
);
const githubFetch = globalThis.fetch;

async function github(pathname) {
  if (typeof githubFetch !== 'function') throw new Error('Node fetch API is unavailable');
  const response = await githubFetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${pathname}`);
  return response.json();
}

async function paged(pathname) {
  const items = [];
  for (let page = 1; ; page += 1) {
    const separator = pathname.includes('?') ? '&' : '?';
    const batch = await github(`${pathname}${separator}per_page=100&page=${page}`);
    items.push(...batch);
    if (batch.length < 100) return items;
  }
}

async function main() {
  if (!token || !repository) throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required');
  const [owner, repo] = repository.split('/');
  const state = JSON.parse(await readFile(path.join(root, 'docs/tasks/ACTIVE_TASK.json'), 'utf8'));
  const activeBranch = state.activeTask?.branch;
  const [branches, openPulls] = await Promise.all([
    paged(`/repos/${owner}/${repo}/branches`),
    paged(`/repos/${owner}/${repo}/pulls?state=open`),
  ]);
  const pullByBranch = new Map(openPulls.map((pull) => [pull.head.ref, pull.number]));
  const report = [];
  for (const branch of branches) {
    if (branch.name === 'main') {
      report.push({ branch: branch.name, classification: 'default', action: 'keep' });
      continue;
    }
    if (branch.name === activeBranch) {
      report.push({ branch: branch.name, classification: 'active-task', action: 'keep' });
      continue;
    }
    const pullNumber = pullByBranch.get(branch.name);
    if (pullNumber) {
      report.push({ branch: branch.name, classification: 'open-pr', pullNumber, action: 'review' });
      continue;
    }
    const comparison = await github(
      `/repos/${owner}/${repo}/compare/main...${encodeURIComponent(branch.name)}`,
    );
    report.push({
      branch: branch.name,
      aheadBy: comparison.ahead_by,
      behindBy: comparison.behind_by,
      classification: comparison.ahead_by === 0 ? 'fully-merged-or-obsolete' : 'orphaned-work',
      action: comparison.ahead_by === 0 ? 'delete-candidate' : 'manual-review',
    });
  }

  const orphaned = report.filter((item) => item.classification === 'orphaned-work');
  const deleteCandidates = report.filter((item) => item.action === 'delete-candidate');
  const lines = [
    '# Branch Hygiene Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Active task branch: ${activeBranch ?? '<none>'}`,
    '',
    '| Branch | Classification | Ahead | Behind | Action |',
    '|---|---|---:|---:|---|',
    ...report.map(
      (item) =>
        `| ${item.branch} | ${item.classification} | ${item.aheadBy ?? '-'} | ${
          item.behindBy ?? '-'
        } | ${item.action}${item.pullNumber ? ` (#${item.pullNumber})` : ''} |`,
    ),
    '',
    `Delete candidates: ${deleteCandidates.length}`,
    `Orphaned branches requiring review: ${orphaned.length}`,
    '',
  ];

  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDirectory, 'report.md'), `${lines.join('\n')}\n`, 'utf8'),
    writeFile(
      path.join(outputDirectory, 'report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    ),
  ]);
  console.log(`Branch audit completed for ${report.length} branches.`);
  if (orphaned.length > 0) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
