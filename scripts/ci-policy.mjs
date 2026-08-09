import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const workflowDirectory = path.join(root, '.github', 'workflows');

const requiredWorkflows = [
  'automerge.yml',
  'branch-hygiene.yml',
  'engineering-validation.yml',
  'evidence.yml',
  'full-work-validation.yml',
  'main-verification.yml',
  'performance.yml',
  'post-merge-verification.yml',
  'pr-policy.yml',
  'quality-core.yml',
  'quality.yml',
  'release.yml',
  'repository-governance.yml',
  'security.yml',
  'task-governance.yml',
  'toolchain-export.yml',
  'work-synchronization.yml',
];

const requiredFiles = [
  '.github/governance/automation-layout-policy.mjs',
  '.github/governance/automerge-base-gate.mjs',
  '.github/governance/branch-inventory-policy.mjs',
  '.github/governance/effective-task-status.mjs',
  '.github/governance/main-protection.json',
  '.github/governance/post-merge-verification.mjs',
  '.github/governance/required-checks.json',
  '.github/governance/secret-scan-allowlist.json',
  '.github/governance/single-work-policy.mjs',
  '.github/governance/single-work-release-gate.mjs',
  '.github/governance/single-work-taskctl.mjs',
  '.github/governance/work-synchronization.mjs',
  '.github/governance/workspace-architecture.json',
  'scripts/automerge.mjs',
  'scripts/evidence-policy.mjs',
  'scripts/main-verification.mjs',
  'scripts/ruleset-policy.mjs',
  'scripts/scan-secrets.mjs',
  'scripts/workflow-structure-policy.mjs',
];

const actionPins = new Map([
  ['actions/checkout', 'd23441a48e516b6c34aea4fa41551a30e30af803'],
  ['actions/setup-node', '249970729cb0ef3589644e2896645e5dc5ba9c38'],
  ['actions/upload-artifact', '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a'],
  ['actions/download-artifact', '3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c'],
  ['pnpm/action-setup', 'b906affcce14559ad1aafd4ab0e942779e9f58b1'],
]);

function requireTokens(errors, file, source, tokens) {
  for (const token of tokens) {
    if (!source.includes(token)) errors.push(`${file}: missing ${token}`);
  }
}

function forbidTokens(errors, file, source, tokens) {
  for (const token of tokens) {
    if (source.includes(token)) errors.push(`${file}: forbidden ${token}`);
  }
}

function validateWorkflowEnvelope(errors, file, source) {
  requireTokens(errors, file, source, ['on:', 'permissions:', 'jobs:']);
  if (/\t/u.test(source)) errors.push(`${file}: tabs are forbidden`);
  if (/permissions:\s*write-all/iu.test(source)) errors.push(`${file}: write-all is forbidden`);
  if (/repository_dispatch\s*:/u.test(source)) errors.push(`${file}: repository_dispatch is forbidden`);
  if (/pull_request_target\s*:/u.test(source) && file !== 'pr-policy.yml') {
    errors.push(`${file}: pull_request_target is reserved for trusted PR policy`);
  }
  if (/git\s+push[^\n]*(?:HEAD:main|\bmain\b)/iu.test(source)) {
    errors.push(`${file}: direct main push is forbidden`);
  }
  for (const match of source.matchAll(/uses:\s*([^@\s]+)@([^\s#]+)/gu)) {
    const action = match[1];
    const reference = match[2];
    if (action.startsWith('./')) continue;
    const expected = actionPins.get(action);
    if (!expected) errors.push(`${file}: external action ${action} is not allowlisted`);
    else if (reference !== expected) errors.push(`${file}: ${action} must use immutable SHA ${expected}`);
  }
  const checkouts = [...source.matchAll(/uses:\s*actions\/checkout@[^\s#]+/gu)].length;
  const safeCheckouts = [...source.matchAll(/persist-credentials:\s*false/gu)].length;
  if (checkouts !== safeCheckouts) errors.push(`${file}: every checkout must disable credential persistence`);
}

async function main() {
  const errors = [];
  const files = (await readdir(workflowDirectory)).filter((file) => /\.ya?ml$/u.test(file)).sort();
  for (const file of requiredWorkflows) {
    if (!files.includes(file)) errors.push(`Missing required workflow: ${file}`);
  }
  for (const file of requiredFiles) {
    try {
      await access(path.join(root, file));
    } catch {
      errors.push(`Missing permanent governance file: ${file}`);
    }
  }
  for (const file of files) {
    if (/^(?:m\d+-|.*(?:diagnostic|implementation-runner|temporary|tmp).*)\.ya?ml$/iu.test(file)) {
      errors.push(`Task-specific or temporary workflow must be removed: ${file}`);
    }
  }

  const workflows = new Map();
  for (const file of files) {
    const source = await readFile(path.join(workflowDirectory, file), 'utf8');
    workflows.set(file, source);
    validateWorkflowEnvelope(errors, file, source);
  }

  const config = JSON.parse(
    await readFile(path.join(root, '.github', 'governance', 'required-checks.json'), 'utf8'),
  );
  const expectedChecks = ['pr-policy', 'quality / quality', 'security', 'performance'];
  if (JSON.stringify(config.requiredChecks) !== JSON.stringify(expectedChecks)) {
    errors.push(`required-checks.json must contain only ${expectedChecks.join(', ')}`);
  }
  if (config.baseBranch !== 'main' || config.mergeMethod !== 'squash') {
    errors.push('required-checks.json must keep main + squash automation');
  }

  const automerge = workflows.get('automerge.yml') ?? '';
  requireTokens(errors, 'automerge.yml', automerge, [
    'workflow_run:',
    '- Quality',
    '- Security',
    '- Performance',
    'automerge-base-gate.mjs',
    'scripts/automerge.mjs',
    'statuses: read',
  ]);
  forbidTokens(errors, 'automerge.yml', automerge, ['- Task Governance', '- Evidence', '- PR Policy']);

  const prPolicy = workflows.get('pr-policy.yml') ?? '';
  requireTokens(errors, 'pr-policy.yml', prPolicy, [
    'pull_request_target:',
    'path: trusted',
    'path: candidate',
    '../trusted/.github/governance/single-work-policy.mjs validate',
    '../trusted/.github/governance/automation-layout-policy.mjs',
    '../trusted/scripts/ci-policy.mjs',
    "context: 'pr-policy'",
    'statuses: write',
  ]);

  const taskGovernance = workflows.get('task-governance.yml') ?? '';
  requireTokens(errors, 'task-governance.yml', taskGovernance, ['workflow_dispatch:', 'schedule:']);
  forbidTokens(errors, 'task-governance.yml', taskGovernance, ['pull_request:']);

  const evidence = workflows.get('evidence.yml') ?? '';
  requireTokens(errors, 'evidence.yml', evidence, [
    'workflow_dispatch:',
    'schedule:',
    'verified-evidence-scan.mjs',
  ]);
  forbidTokens(errors, 'evidence.yml', evidence, ['pull_request:']);

  const repositoryGovernance = workflows.get('repository-governance.yml') ?? '';
  requireTokens(errors, 'repository-governance.yml', repositoryGovernance, [
    'push:',
    'branches: [main]',
    'workflow_dispatch:',
    'schedule:',
    'automation-layout-policy.mjs',
    'scripts/ci-policy.mjs',
    'ruleset-policy.mjs apply',
    'REPO_ADMIN_TOKEN',
  ]);
  forbidTokens(errors, 'repository-governance.yml', repositoryGovernance, ['pull_request:']);

  const branchHygiene = workflows.get('branch-hygiene.yml') ?? '';
  requireTokens(errors, 'branch-hygiene.yml', branchHygiene, [
    '- Work Synchronization',
    'contents: write',
    'branch-inventory-policy.mjs self-test',
    'branch-inventory-policy.mjs --repair',
  ]);

  const workSynchronization = workflows.get('work-synchronization.yml') ?? '';
  requireTokens(errors, 'work-synchronization.yml', workSynchronization, [
    '- Main Verification',
    'contents: write',
    'pull-requests: read',
    'work-synchronization.mjs self-test',
    'work-synchronization.mjs',
  ]);
  forbidTokens(errors, 'work-synchronization.yml', workSynchronization, ['pull_request:', 'push:', 'git push']);

  const mainVerification = workflows.get('main-verification.yml') ?? '';
  requireTokens(errors, 'main-verification.yml', mainVerification, [
    'workflow_dispatch:',
    'expected_sha:',
    'source_pr:',
    'source_head_sha:',
    'statuses: write',
    'scripts/main-verification.mjs',
    'name: main-verification',
  ]);

  const dispatcher = workflows.get('post-merge-verification.yml') ?? '';
  requireTokens(errors, 'post-merge-verification.yml', dispatcher, [
    'pull_request:',
    'types: [closed]',
    'github.event.pull_request.merged == true',
    'post-merge-verification.mjs',
  ]);

  const quality = workflows.get('quality.yml') ?? '';
  requireTokens(errors, 'quality.yml', quality, ['pull_request:', 'quality-core.yml']);

  const qualityCore = workflows.get('quality-core.yml') ?? '';
  requireTokens(errors, 'quality-core.yml', qualityCore, [
    'static-checks:',
    'product-tests:',
    'coverage:',
    'desktop-e2e:',
    'build:',
    'package-smoke:',
    'quality:',
  ]);

  const security = workflows.get('security.yml') ?? '';
  requireTokens(errors, 'security.yml', security, ['pull_request:', 'scan-secrets.mjs', 'pnpm test:security', 'name: security']);

  const performance = workflows.get('performance.yml') ?? '';
  requireTokens(errors, 'performance.yml', performance, [
    'pull_request:',
    'workflow_dispatch:',
    'Run performance budgets',
    'vitest run tests/performance --no-file-parallelism --retry=1',
    'Run AI protocol baselines',
  ]);

  const release = workflows.get('release.yml') ?? '';
  requireTokens(errors, 'release.yml', release, [
    'workflow_dispatch:',
    'environment: release',
    'security_suite: true',
    'performance_eval: true',
    'pnpm run package --',
  ]);
  forbidTokens(errors, 'release.yml', release, ['pull_request:', 'schedule:']);

  const engineeringValidation = workflows.get('engineering-validation.yml') ?? '';
  requireTokens(errors, 'engineering-validation.yml', engineeringValidation, [
    'workflow_dispatch:',
    'workflow_call:',
    'quality-core.yml',
    'name: engineering-validation',
  ]);
  forbidTokens(errors, 'engineering-validation.yml', engineeringValidation, [
    'pull_request:',
    'push:',
    'schedule:',
    'contents: write',
    'statuses: write',
    'git push',
  ]);

  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log('CI policy is valid for the automated engineering-gate model.');
}

export function allowedPathsForBranch(branch) {
  return branch === 'work' ? ['<all repository paths>'] : [];
}

export function recommendBranch() {
  return 'work';
}

export function validateBranchPlan(branch, files) {
  if (branch !== 'work') {
    return {
      ok: false,
      violations: [`Branch ${branch || '<missing>'} is forbidden; use work.`],
      recommendedBranch: 'work',
    };
  }
  if (!Array.isArray(files) || files.length === 0) {
    return {
      ok: false,
      violations: ['At least one changed file path is required.'],
      recommendedBranch: 'work',
    };
  }
  return { ok: true, violations: [], recommendedBranch: 'work' };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
