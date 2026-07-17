import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.REPO_ADMIN_TOKEN || process.env.GITHUB_TOKEN;
const output = path.resolve(
  process.env.RULESET_REPORT ?? 'artifacts/repository-governance/report.json',
);
const githubFetch = globalThis.fetch;

async function api(pathname, options = {}) {
  if (typeof githubFetch !== 'function') throw new Error('Node fetch API is unavailable');
  const response = await githubFetch(`https://api.github.com${pathname}`, {
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

function sameStrings(left = [], right = []) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function ruleByType(rules, type) {
  return rules?.find((rule) => rule.type === type) ?? null;
}

function complianceReasons(current, desired) {
  const reasons = [];
  if (!current) return ['ruleset is missing'];
  if (current.name !== desired.name) reasons.push(`name is ${current.name}`);
  if (current.target !== desired.target) reasons.push(`target is ${current.target}`);
  if (current.enforcement !== 'active') reasons.push(`enforcement is ${current.enforcement}`);

  const currentInclude = current.conditions?.ref_name?.include ?? [];
  const currentExclude = current.conditions?.ref_name?.exclude ?? [];
  if (!sameStrings(currentInclude, desired.conditions.ref_name.include)) {
    reasons.push(`branch include differs: ${currentInclude.join(', ') || '<none>'}`);
  }
  if (!sameStrings(currentExclude, desired.conditions.ref_name.exclude)) {
    reasons.push(`branch exclude differs: ${currentExclude.join(', ') || '<none>'}`);
  }
  if ((current.bypass_actors ?? []).length > 0) reasons.push('bypass actors are configured');

  const desiredTypes = desired.rules.map((rule) => rule.type);
  const currentTypes = (current.rules ?? []).map((rule) => rule.type);
  for (const type of desiredTypes) {
    if (!currentTypes.includes(type)) reasons.push(`missing rule: ${type}`);
  }

  const pullRequest = ruleByType(current.rules, 'pull_request');
  const desiredPullRequest = ruleByType(desired.rules, 'pull_request');
  for (const [name, value] of Object.entries(desiredPullRequest.parameters)) {
    if (pullRequest?.parameters?.[name] !== value) {
      reasons.push(`pull_request.${name} is ${String(pullRequest?.parameters?.[name])}`);
    }
  }

  const statusChecks = ruleByType(current.rules, 'required_status_checks');
  const desiredStatusChecks = ruleByType(desired.rules, 'required_status_checks');
  if (statusChecks?.parameters?.strict_required_status_checks_policy !== true) {
    reasons.push('required status checks do not require the branch to be current');
  }
  if (statusChecks?.parameters?.do_not_enforce_on_create !== false) {
    reasons.push('required status checks are not enforced on branch creation');
  }
  const currentContexts = (statusChecks?.parameters?.required_status_checks ?? []).map(
    (entry) => entry.context,
  );
  const desiredContexts = desiredStatusChecks.parameters.required_status_checks.map(
    (entry) => entry.context,
  );
  if (!sameStrings(currentContexts, desiredContexts)) {
    reasons.push(`required checks differ: ${currentContexts.join(', ') || '<none>'}`);
  }

  return reasons;
}

async function findRuleset(owner, repo, name) {
  const rulesets = await api(`/repos/${owner}/${repo}/rulesets?includes_parents=false`);
  const summary = rulesets.find((ruleset) => ruleset.name === name);
  if (!summary) return null;
  return api(`/repos/${owner}/${repo}/rulesets/${summary.id}`);
}

async function main() {
  if (!repository || !token) throw new Error('GITHUB_REPOSITORY and token are required');
  const [owner, repo] = repository.split('/');
  const desired = await desiredRuleset();
  const command = process.argv[2] ?? 'check';
  const existing = await findRuleset(owner, repo, desired.name);

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
  } else if (command !== 'check') {
    throw new Error(`Unknown ruleset-policy command: ${command}`);
  }

  const active = await findRuleset(owner, repo, desired.name);
  const reasons = complianceReasons(active, desired);
  const compliant = reasons.length === 0;
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(
    output,
    `${JSON.stringify({ compliant, desired: desired.name, reasons, active }, null, 2)}\n`,
    'utf8',
  );
  if (!compliant) {
    throw new Error(`Native main ruleset is missing or drifted:\n- ${reasons.join('\n- ')}`);
  }
  console.log(`Repository ruleset ${desired.name} is fully compliant.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
