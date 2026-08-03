import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const apply = process.env.WORK_BRANCH_POLICY_APPLY === 'true';
const outputDirectory = path.resolve(
  process.env.WORK_BRANCH_POLICY_OUTPUT ?? 'artifacts/branch-hygiene',
);
const githubFetch = globalThis.fetch;
const fullShaPattern = /^[0-9a-f]{40}$/iu;

async function api(pathname, options = {}, acceptedStatuses = []) {
  if (typeof githubFetch !== 'function') {
    throw new Error('Node fetch API is unavailable');
  }
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
  if (!response.ok && !acceptedStatuses.includes(response.status)) {
    throw new Error(`GitHub API ${response.status}: ${url.pathname}${url.search}\n${body}`);
  }
  if (!response.ok) return null;
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

function escapedRef(name) {
  return name
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function markdownCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function isLegacyWorkBranch(name) {
  return /^work\/.+/u.test(name ?? '');
}

export function archiveTagFor(branchName, branchSha) {
  if (!isLegacyWorkBranch(branchName)) {
    throw new Error('Archive source must be a legacy work branch');
  }
  if (!fullShaPattern.test(branchSha ?? '')) {
    throw new Error('Archive source must use a full SHA');
  }
  const suffix = branchName
    .slice('work/'.length)
    .replace(/[^a-zA-Z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  if (!suffix) {
    throw new Error('Legacy work branch archive suffix is empty');
  }
  return `archive/legacy-work/${suffix}-${branchSha.slice(0, 12)}`;
}

export function canonicalWorkDecision(branchNames) {
  const names = new Set(branchNames);
  if (names.has('work')) return { action: 'keep', blockers: [] };
  const blockers = [...names].filter(isLegacyWorkBranch).sort();
  if (blockers.length > 0) return { action: 'blocked', blockers };
  return { action: 'create', blockers: [] };
}

async function ensureArchiveTag(owner, repo, branchName, branchSha) {
  const tag = archiveTagFor(branchName, branchSha);
  const tagPath = `/repos/${owner}/${repo}/git/ref/tags/${escapedRef(tag)}`;
  const existing = await api(tagPath, {}, [404]);
  if (existing) {
    if (existing.object?.sha !== branchSha) {
      throw new Error(`Archive tag ${tag} points to an unexpected commit`);
    }
    return tag;
  }
  await api(`/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: `refs/tags/${tag}`, sha: branchSha }),
  });
  return tag;
}

async function main() {
  if (!token || !repository) {
    throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required');
  }
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) {
    throw new Error('GITHUB_REPOSITORY must use owner/repo format');
  }

  const [branches, pulls] = await Promise.all([
    paged(`/repos/${owner}/${repo}/branches`),
    paged(`/repos/${owner}/${repo}/pulls?state=open`),
  ]);
  const main = branches.find((branch) => branch.name === 'main');
  const mainSha = main?.commit?.sha;
  if (!fullShaPattern.test(mainSha ?? '')) {
    throw new Error('Cannot resolve the current main SHA');
  }

  const openBranches = new Set(
    pulls
      .filter((pull) => pull.head?.repo?.full_name === repository)
      .map((pull) => pull.head?.ref)
      .filter(Boolean),
  );
  const remainingBranches = new Set(branches.map((branch) => branch.name));
  const report = [];

  for (const branch of branches.filter((candidate) => isLegacyWorkBranch(candidate.name))) {
    const branchName = branch.name;
    const branchSha = branch.commit?.sha;
    if (!fullShaPattern.test(branchSha ?? '')) {
      report.push({
        branch: branchName,
        action: 'blocked',
        reason: 'missing-current-branch-head',
      });
      continue;
    }
    if (openBranches.has(branchName)) {
      report.push({
        branch: branchName,
        branchSha,
        action: 'keep',
        reason: 'open-pull-request',
      });
      continue;
    }
    if (!apply) {
      report.push({
        branch: branchName,
        branchSha,
        archiveTag: archiveTagFor(branchName, branchSha),
        action: 'migration-candidate',
        reason: 'legacy-work-branch',
      });
      continue;
    }

    const refPath = `/repos/${owner}/${repo}/git/ref/heads/${escapedRef(branchName)}`;
    const currentRef = await api(refPath);
    if (currentRef?.object?.sha !== branchSha) {
      report.push({
        branch: branchName,
        branchSha,
        action: 'blocked',
        reason: 'changed-during-run',
      });
      continue;
    }
    const archiveTag = await ensureArchiveTag(owner, repo, branchName, branchSha);
    await api(`/repos/${owner}/${repo}/git/refs/heads/${escapedRef(branchName)}`, {
      method: 'DELETE',
    });
    remainingBranches.delete(branchName);
    report.push({
      branch: branchName,
      branchSha,
      archiveTag,
      action: 'archived-and-deleted',
      reason: 'legacy-work-branch',
    });
  }

  const decision = canonicalWorkDecision(remainingBranches);
  if (decision.action === 'create' && apply) {
    await api(`/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'refs/heads/work', sha: mainSha }),
    });
    remainingBranches.add('work');
    report.push({
      branch: 'work',
      branchSha: mainSha,
      action: 'created',
      reason: 'canonical-work',
    });
  } else if (decision.action === 'create') {
    report.push({
      branch: 'work',
      branchSha: mainSha,
      action: 'create-candidate',
      reason: 'canonical-work',
    });
  } else if (decision.action === 'keep') {
    report.push({ branch: 'work', action: 'keep', reason: 'canonical-work-exists' });
  } else {
    report.push({
      branch: 'work',
      action: 'blocked',
      reason: `legacy-work-branches-remain: ${decision.blockers.join(', ')}`,
    });
  }

  const lines = [
    '# Canonical Work Branch Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Apply mode: ${apply}`,
    `Main SHA: ${mainSha}`,
    '',
    '| Branch | SHA | Archive tag | Reason | Action |',
    '|---|---|---|---|---|',
    ...report.map(
      (item) =>
        `| ${markdownCell(item.branch)} | ${item.branchSha ?? '-'} | ${markdownCell(item.archiveTag ?? '-')} | ${markdownCell(item.reason ?? '-')} | ${item.action} |`,
    ),
    '',
  ];
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDirectory, 'work-branch-policy.md'), `${lines.join('\n')}\n`, 'utf8'),
    writeFile(
      path.join(outputDirectory, 'work-branch-policy.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    ),
  ]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
