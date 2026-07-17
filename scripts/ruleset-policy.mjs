import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.REPO_ADMIN_TOKEN || process.env.GITHUB_TOKEN;
const output = path.resolve(
  process.env.RULESET_REPORT ?? 'artifacts/repository-governance/report.json',
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
  const text = await response.text();
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${pathname}\n${text}`);
  return text ? JSON.parse(text) : null;
}

async function desiredRuleset() {
  const policy = JSON.parse(await readFile('.github/governance/main-protection.json', 'utf8'));
  const checks = JSON.parse(await readFile(policy.requiredChecksFile, 'utf8'));
  return {
    name: policy.name,
    target: 'branch',
    enforcement: 'active',
    conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
    rules: [
      ...(policy.blockDeletion ? [{ type: 'deletion' }] : []),
      ...(policy.blockForcePush ? [{ type: 'non_fast_forward' }] : []),
      ...(policy.requireLinearHistory ? [{ type: 'required_linear_history' }] : []),
      {
        type: 'pull_request',
        parameters: {
          dismiss_stale_reviews_on_push: true,
          require_code_owner_review: false,
          require_last_push_approval: false,
          required_approving_review_count: 0,
          required_review_thread_resolution: policy.resolveReviewThreads,
        },
      },
      {
        type: 'required_status_checks',
        parameters: {
          strict_required_status_checks_policy: true,
          do_not_enforce_on_create: false,
          required_status_checks: checks.requiredChecks.map((context) => ({ context })),
        },
      },
    ],
    bypass_actors: [],
  };
}

function checkContexts(current, desired) {
  const currentRule = current.rules?.find((rule) => rule.type === 'required_status_checks');
  const desiredRule = desired.rules.find((rule) => rule.type === 'required_status_checks');
  const currentChecks = (currentRule?.parameters?.required_status_checks ?? [])
    .map((entry) => entry.context)
    .sort();
  const desiredChecks = desiredRule.parameters.required_status_checks
    .map((entry) => entry.context)
    .sort();
  return JSON.stringify(currentChecks) === JSON.stringify(desiredChecks);
}

async function main() {
  if (!repository || !token) throw new Error('GITHUB_REPOSITORY and token are required');
  const [owner, repo] = repository.split('/');
  const desired = await desiredRuleset();
  const rulesets = await api(`/repos/${owner}/${repo}/rulesets?includes_parents=false`);
  const existing = rulesets.find((ruleset) => ruleset.name === desired.name);
  const command = process.argv[2] ?? 'check';

  if (command === 'apply') {
    if (!process.env.REPO_ADMIN_TOKEN) {
      throw new Error('REPO_ADMIN_TOKEN is required to apply repository rulesets');
    }
    await api(
      existing
        ? `/repos/${owner}/${repo}/rulesets/${existing.id}`
        : `/repos/${owner}/${repo}/rulesets`,
      {
        method: existing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(desired),
      },
    );
  }

  const refreshed = await api(`/repos/${owner}/${repo}/rulesets?includes_parents=false`);
  const active = refreshed.find((ruleset) => ruleset.name === desired.name);
  const compliant = Boolean(
    active && active.enforcement === 'active' && checkContexts(active, desired),
  );
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(
    output,
    `${JSON.stringify({ compliant, desired: desired.name, active: active ?? null }, null, 2)}\n`,
    'utf8',
  );
  if (!compliant) {
    const message = 'Native main ruleset is missing or drifted.';
    if (process.env.RULESET_STRICT === 'true') throw new Error(message);
    console.warn(`::warning::${message}`);
  } else {
    console.log(`Repository ruleset ${desired.name} is compliant.`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
