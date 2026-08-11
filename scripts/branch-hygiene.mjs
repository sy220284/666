import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const apply = process.env.BRANCH_HYGIENE_APPLY === 'true';
const outputDirectory = path.resolve(
  process.env.BRANCH_HYGIENE_OUTPUT ?? 'artifacts/branch-hygiene',
);
const githubFetch = globalThis.fetch;
const fullShaPattern = /^[0-9a-f]{40}$/iu;

async function api(pathname, options = {}) {
  if (typeof githubFetch !== 'function') throw new Error('Node fetch API is unavailable');
  const url = new globalThis.URL(pathname, 'https://api.github.com');
  if (url.origin !== 'https://api.github.com') {
    throw new Error(`Unexpected GitHub API origin: ${url.origin}`);
  }
  const response = await githubFetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers ?? {}),
    },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${url.pathname}${url.search}\n${body}`);
  }
  return body ? JSON.parse(body) : null;
}

async function paged(pathname) {
  const items = [];
  for (let page = 1; ; page += 1) {
    const separator = pathname.includes('?') ? '&' : '?';
    const batch = await api(`${pathname}${separator}per_page=100&page=${page}`);
    if (!Array.isArray(batch)) {
      throw new Error(`GitHub API pagination returned a non-array: ${pathname}`);
    }
    items.push(...batch);
    if (batch.length < 100) return items;
  }
}

export function branchDeletionDecision({ branchSha, pull, comparison }) {
  if (!fullShaPattern.test(branchSha ?? '')) {
    return { safe: false, reason: 'missing-current-branch-head' };
  }
  if (!Number.isSafeInteger(comparison?.ahead_by) || comparison.ahead_by < 0) {
    return { safe: false, reason: 'invalid-main-comparison' };
  }
  if (comparison.ahead_by === 0) {
    return { safe: true, reason: 'current-head-is-fully-reachable-from-main' };
  }
  if (pull?.merged_at && pull.head?.sha === branchSha) {
    return { safe: true, reason: 'merged-pr-head-is-still-current' };
  }
  if (pull?.merged_at) {
    return { safe: false, reason: 'branch-advanced-after-merged-pr' };
  }
  return { safe: false, reason: 'branch-contains-unmerged-commits' };
}

export function isProtectedBranch(name, authorization) {
  return (
    name === authorization?.baseBranch ||
    name === authorization?.workBranch ||
    name === authorization?.governanceBranch
  );
}

function escapedRef(name) {
  return name
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function markdownCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

async function main() {
  if (!token || !repository) {
    throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required');
  }
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) throw new Error('GITHUB_REPOSITORY must use owner/repo format');
  const authorization = JSON.parse(await readFile('docs/tasks/TASK_AUTHORIZATION.json', 'utf8'));
  const workBranch = authorization.workBranch;
  const governanceBranch = authorization.governanceBranch;
  if (
    authorization.schemaVersion !== 2 ||
    authorization.baseBranch !== 'main' ||
    workBranch !== 'work' ||
    governanceBranch !== 'governance' ||
    authorization.allowAdditionalBranches !== false
  ) {
    throw new Error('TASK_AUTHORIZATION must define the strict main/work/governance Schema 2 model');
  }
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
    const branchSha = branch.commit?.sha;
    if (isProtectedBranch(name, authorization)) {
      report.push({ branch: name, branchSha, classification: 'protected', action: 'keep' });
      continue;
    }
    const pull = latestPullByBranch.get(name);
    if (pull?.state === 'open') {
      report.push({
        branch: name,
        branchSha,
        classification: 'open-pr',
        pullNumber: pull.number,
        action: 'keep',
      });
      continue;
    }
    const comparison = await api(
      `/repos/${owner}/${repo}/compare/${encodeURIComponent(authorization.baseBranch)}...${encodeURIComponent(name)}`,
    );
    const decision = branchDeletionDecision({ branchSha, pull, comparison });
    let action = decision.safe ? 'delete-candidate' : 'manual-review';
    if (decision.safe && apply) {
      const refPath = `/repos/${owner}/${repo}/git/ref/heads/${escapedRef(name)}`;
      const currentRef = await api(refPath);
      if (currentRef?.object?.sha !== branchSha) {
        action = 'changed-during-run';
      } else {
        await api(`/repos/${owner}/${repo}/git/refs/heads/${escapedRef(name)}`, {
          method: 'DELETE',
        });
        action = 'deleted';
      }
    }
    report.push({
      branch: name,
      branchSha,
      aheadBy: comparison.ahead_by,
      behindBy: comparison.behind_by,
      classification: decision.safe ? 'obsolete' : 'orphaned-work',
      reason: decision.reason,
      pullNumber: pull?.number ?? null,
      pullHeadSha: pull?.head?.sha ?? null,
      action,
    });
  }

  const lines = [
    '# Branch Hygiene Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Apply mode: ${apply}`,
    '',
    '| Branch | Classification | Ahead | Behind | Reason | Action |',
    '|---|---|---:|---:|---|---|',
    ...report.map(
      (item) =>
        `| ${markdownCell(item.branch)} | ${item.classification} | ${item.aheadBy ?? '-'} | ${item.behindBy ?? '-'} | ${markdownCell(item.reason ?? '-')} | ${item.action}${item.pullNumber ? ` (#${item.pullNumber})` : ''} |`,
    ),
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
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
