import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const apply = process.env.BRANCH_HYGIENE_APPLY === 'true';
const outputDirectory = path.resolve(
  process.env.BRANCH_HYGIENE_OUTPUT ?? 'artifacts/branch-hygiene',
);

async function api(pathname, options = {}) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers ?? {}),
    },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${pathname}\n${body}`);
  return body ? JSON.parse(body) : null;
}

async function paged(pathname) {
  const items = [];
  for (let page = 1; ; page += 1) {
    const separator = pathname.includes('?') ? '&' : '?';
    const batch = await api(`${pathname}${separator}per_page=100&page=${page}`);
    items.push(...batch);
    if (batch.length < 100) return items;
  }
}

async function main() {
  if (!token || !repository) throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required');
  const [owner, repo] = repository.split('/');
  const state = JSON.parse(await readFile('docs/tasks/ACTIVE_TASK.json', 'utf8'));
  const activeBranch = state.activeTask?.branch;
  const [branches, pulls] = await Promise.all([
    paged(`/repos/${owner}/${repo}/branches`),
    paged(`/repos/${owner}/${repo}/pulls?state=all`),
  ]);
  const latestPullByBranch = new Map();
  for (const pull of pulls) {
    if (pull.head.repo?.full_name !== repository) continue;
    const existing = latestPullByBranch.get(pull.head.ref);
    if (!existing || pull.number > existing.number) latestPullByBranch.set(pull.head.ref, pull);
  }

  const report = [];
  for (const branch of branches) {
    const name = branch.name;
    if (name === 'main' || name === activeBranch || name.startsWith('release/')) {
      report.push({ branch: name, classification: 'protected', action: 'keep' });
      continue;
    }
    const pull = latestPullByBranch.get(name);
    if (pull?.state === 'open') {
      report.push({ branch: name, classification: 'open-pr', pullNumber: pull.number, action: 'keep' });
      continue;
    }
    const comparison = await api(`/repos/${owner}/${repo}/compare/main...${encodeURIComponent(name)}`);
    const safeDelete = Boolean(pull?.merged_at || pull?.state === 'closed' || comparison.ahead_by === 0);
    let action = safeDelete ? 'delete-candidate' : 'manual-review';
    if (safeDelete && apply) {
      await api(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
      action = 'deleted';
    }
    report.push({
      branch: name,
      aheadBy: comparison.ahead_by,
      behindBy: comparison.behind_by,
      classification: safeDelete ? 'obsolete' : 'orphaned-work',
      pullNumber: pull?.number ?? null,
      action,
    });
  }

  const lines = [
    '# Branch Hygiene Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Apply mode: ${apply}`,
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
  ];
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDirectory, 'report.md'), `${lines.join('\n')}\n`, 'utf8'),
    writeFile(path.join(outputDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
  ]);
  console.log(`Branch hygiene completed for ${report.length} branches.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
