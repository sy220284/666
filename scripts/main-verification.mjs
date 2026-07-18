import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const githubFetch = globalThis.fetch;

export function latestChecksByName(checkRuns = []) {
  const latest = new Map();
  for (const run of checkRuns) {
    const previous = latest.get(run.name);
    if (!previous || new Date(run.started_at) > new Date(previous.started_at)) {
      latest.set(run.name, run);
    }
  }
  return latest;
}

function assertFullSha(value, label) {
  if (!/^[0-9a-f]{40}$/iu.test(value ?? '')) {
    throw new Error(`${label} must be a full commit SHA`);
  }
}

export function validateMainVerification({
  repository,
  baseBranch,
  expectedSha,
  sourcePr,
  sourceHeadSha,
  githubRef,
  githubSha,
  pull,
  requiredChecks,
  checkRuns,
}) {
  if (!/^[^/\s]+\/[^/\s]+$/u.test(repository ?? '')) {
    throw new Error('GITHUB_REPOSITORY is invalid');
  }
  if (!baseBranch) throw new Error('Base branch is missing');
  assertFullSha(expectedSha, 'EXPECTED_SHA');
  assertFullSha(sourceHeadSha, 'SOURCE_HEAD_SHA');
  if (!Number.isSafeInteger(sourcePr) || sourcePr <= 0) {
    throw new Error('SOURCE_PR must be a positive integer');
  }
  if (githubRef !== `refs/heads/${baseBranch}`) {
    throw new Error(`Main verification must run from refs/heads/${baseBranch}`);
  }
  if (githubSha !== expectedSha) {
    throw new Error(`Dispatched SHA ${githubSha} does not match expected main SHA ${expectedSha}`);
  }
  if (!pull?.merged || !pull.merged_at) {
    throw new Error(`Pull request #${sourcePr} is not merged`);
  }
  if (pull.base?.ref !== baseBranch) {
    throw new Error(`Pull request #${sourcePr} does not target ${baseBranch}`);
  }
  if (pull.head?.sha !== sourceHeadSha) {
    throw new Error(`Pull request #${sourcePr} head SHA changed after permanent checks`);
  }
  if (pull.merge_commit_sha !== expectedSha) {
    throw new Error(`Pull request #${sourcePr} did not produce ${expectedSha}`);
  }

  const latest = latestChecksByName(checkRuns);
  const missing = [];
  for (const name of requiredChecks) {
    const check = latest.get(name);
    if (check?.status !== 'completed' || check.conclusion !== 'success') {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Source PR permanent checks are not successful: ${missing.join(', ')}`);
  }
}

async function api(token, pathname) {
  const response = await githubFetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`GitHub API ${response.status}: ${pathname}\n${details}`);
  }
  return response.json();
}

async function main() {
  if (typeof githubFetch !== 'function') throw new Error('Node fetch API is unavailable');
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const expectedSha = process.env.EXPECTED_SHA;
  const sourceHeadSha = process.env.SOURCE_HEAD_SHA;
  const sourcePr = Number(process.env.SOURCE_PR);
  const githubRef = process.env.GITHUB_REF;
  const githubSha = process.env.GITHUB_SHA;
  if (!token || !repository) throw new Error('GitHub Actions environment is incomplete');

  const config = JSON.parse(await readFile('.github/governance/required-checks.json', 'utf8'));
  const [owner, repo] = repository.split('/');
  const [pull, checks] = await Promise.all([
    api(token, `/repos/${owner}/${repo}/pulls/${sourcePr}`),
    api(token, `/repos/${owner}/${repo}/commits/${sourceHeadSha}/check-runs?per_page=100`),
  ]);

  validateMainVerification({
    repository,
    baseBranch: config.baseBranch,
    expectedSha,
    sourcePr,
    sourceHeadSha,
    githubRef,
    githubSha,
    pull,
    requiredChecks: config.requiredChecks,
    checkRuns: checks.check_runs ?? [],
  });
  console.log(
    `Main verification provenance passed for ${expectedSha} from PR #${sourcePr} (${sourceHeadSha}).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
