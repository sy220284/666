import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const requiredFiles = [
  '.github/workflows/automerge.yml',
  '.github/workflows/branch-hygiene.yml',
  '.github/workflows/engineering-validation.yml',
  '.github/workflows/evidence.yml',
  '.github/workflows/full-work-validation.yml',
  '.github/workflows/main-verification.yml',
  '.github/workflows/performance.yml',
  '.github/workflows/post-merge-verification.yml',
  '.github/workflows/pr-policy.yml',
  '.github/workflows/quality-core.yml',
  '.github/workflows/quality.yml',
  '.github/workflows/release.yml',
  '.github/workflows/repository-governance.yml',
  '.github/workflows/security.yml',
  '.github/workflows/task-governance.yml',
  '.github/workflows/toolchain-export.yml',
  '.github/workflows/work-synchronization.yml',
  '.github/governance/branch-inventory-policy.mjs',
  '.github/governance/required-checks.json',
  '.github/governance/single-work-policy.mjs',
  '.github/governance/work-synchronization.mjs',
  'scripts/automerge.mjs',
  'scripts/main-verification.mjs',
  'scripts/ruleset-policy.mjs',
];

const pins = new Map([
  [
    'actions/checkout',
    {
      preferred: 'de0fac2e4500dabe0009e67214ff5f5447ce83dd',
      allowed: new Set([
        'd23441a48e516b6c34aea4fa41551a30e30af803',
        'de0fac2e4500dabe0009e67214ff5f5447ce83dd',
      ]),
    },
  ],
  [
    'actions/setup-node',
    {
      preferred: '48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
      allowed: new Set([
        '249970729cb0ef3589644e2896645e5dc5ba9c38',
        '48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
      ]),
    },
  ],
  [
    'actions/upload-artifact',
    {
      preferred: '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
      allowed: new Set(['043fb46d1a93c77aae656e7c1c64a875d1fc6a0a']),
    },
  ],
  [
    'actions/download-artifact',
    {
      preferred: '3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
      allowed: new Set(['3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c']),
    },
  ],
  [
    'pnpm/action-setup',
    {
      preferred: '0ebf47130e4866e96fce0953f49152a61190b271',
      allowed: new Set([
        'b906affcce14559ad1aafd4ab0e942779e9f58b1',
        '0ebf47130e4866e96fce0953f49152a61190b271',
      ]),
    },
  ],
]);

function requireText(errors, label, source, tokens) {
  for (const token of tokens)
    if (!source.includes(token)) errors.push(`${label}: missing ${token}`);
}

function forbidText(errors, label, source, tokens) {
  for (const token of tokens)
    if (source.includes(token)) errors.push(`${label}: forbidden ${token}`);
}

function validateActions(errors, label, source) {
  if (/permissions:\s*write-all/iu.test(source)) errors.push(`${label}: write-all is forbidden`);
  if (/repository_dispatch\s*:/u.test(source))
    errors.push(`${label}: repository_dispatch is forbidden`);
  for (const match of source.matchAll(/uses:\s*([^@\s]+)@([^\s#]+)/gu)) {
    const [action, ref] = [match[1], match[2]];
    if (action.startsWith('./')) continue;
    if (!pins.has(action)) errors.push(`${label}: ${action} is not allowlisted`);
    else {
      const policy = pins.get(action);
      if (!policy.allowed.has(ref))
        errors.push(`${label}: ${action} must use governed immutable SHA ${policy.preferred}`);
    }
  }
  const checkouts = [...source.matchAll(/uses:\s*actions\/checkout@/gu)].length;
  const safe = [...source.matchAll(/persist-credentials:\s*false/gu)].length;
  if (checkouts !== safe)
    errors.push(`${label}: every checkout must disable credential persistence`);
}

async function source(relative) {
  return readFile(path.join(root, relative), 'utf8');
}

async function main() {
  const errors = [];
  for (const file of requiredFiles) {
    try {
      await access(path.join(root, file));
    } catch {
      errors.push(`Missing permanent CI file: ${file}`);
    }
  }

  const config = JSON.parse(await source('.github/governance/required-checks.json'));
  const expected = ['pr-policy', 'quality / quality', 'security', 'performance'];
  if (JSON.stringify(config.requiredChecks) !== JSON.stringify(expected)) {
    errors.push(`required-checks.json must contain only ${expected.join(', ')}`);
  }
  if (config.baseBranch !== 'main' || config.mergeMethod !== 'squash') {
    errors.push('required-checks.json must keep main + squash');
  }

  const names = [
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
  const workflows = new Map();
  for (const name of names) {
    const text = await source(`.github/workflows/${name}`);
    workflows.set(name, text);
    validateActions(errors, name, text);
    if (/pull_request_target\s*:/u.test(text) && name !== 'pr-policy.yml') {
      errors.push(`${name}: pull_request_target is reserved for trusted PR policy`);
    }
  }

  const automerge = workflows.get('automerge.yml');
  requireText(errors, 'automerge.yml', automerge, [
    '- Quality',
    '- Security',
    '- Performance',
    'statuses: read',
    'scripts/automerge.mjs',
  ]);
  forbidText(errors, 'automerge.yml', automerge, ['- Task Governance', '- Evidence']);

  const automergeScript = await source('scripts/automerge.mjs');
  requireText(errors, 'scripts/automerge.mjs', automergeScript, [
    'modeAwareChecksState',
    'latestWorkflowRun',
    'quality / release-audit',
    'quality / package-smoke',
  ]);

  const prPolicy = workflows.get('pr-policy.yml');
  requireText(errors, 'pr-policy.yml', prPolicy, [
    'pull_request_target:',
    'path: trusted',
    'path: candidate',
    'pnpm install --frozen-lockfile --ignore-scripts',
    '../trusted/.github/governance/single-work-policy.mjs validate',
    '../trusted/scripts/workflow-structure-policy.mjs',
    '../trusted/scripts/ci-policy.mjs',
    "context: 'pr-policy'",
    'statuses: write',
  ]);

  for (const name of ['task-governance.yml', 'evidence.yml']) {
    const text = workflows.get(name);
    requireText(errors, name, text, ['workflow_dispatch:', 'schedule:']);
    forbidText(errors, name, text, ['pull_request:']);
  }

  const repositoryGovernance = workflows.get('repository-governance.yml');
  requireText(errors, 'repository-governance.yml', repositoryGovernance, [
    'push:',
    'branches: [main]',
    'ruleset-policy.mjs apply',
    'REPO_ADMIN_TOKEN',
  ]);

  const branchHygiene = workflows.get('branch-hygiene.yml');
  requireText(errors, 'branch-hygiene.yml', branchHygiene, [
    'schedule:',
    'workflow_dispatch:',
    'contents: write',
    'branch-inventory-policy.mjs --repair',
  ]);
  forbidText(errors, 'branch-hygiene.yml', branchHygiene, ['workflow_run:']);

  const integrationSynchronization = workflows.get('work-synchronization.yml');
  requireText(errors, 'work-synchronization.yml', integrationSynchronization, [
    'name: Integration Branch Synchronization',
    'workflow_dispatch:',
    'contents: write',
    'INTEGRATION_SYNCHRONIZATION_OUTPUT:',
    'work-synchronization.mjs',
  ]);
  forbidText(errors, 'work-synchronization.yml', integrationSynchronization, ['workflow_run:']);

  const mainVerification = workflows.get('main-verification.yml');
  requireText(errors, 'main-verification.yml', mainVerification, [
    'workflow_dispatch:',
    'source_head_sha:',
    'statuses: write',
    'scripts/main-verification.mjs',
    'synchronize-work:',
    'name: synchronize-integrations',
    'INTEGRATION_SYNCHRONIZATION_OUTPUT:',
    'work-synchronization.mjs',
    'branch-hygiene:',
    'branch-inventory-policy.mjs --repair',
  ]);

  const mainVerificationScript = await source('scripts/main-verification.mjs');
  requireText(errors, 'scripts/main-verification.mjs', mainVerificationScript, [
    'task-verification/',
    'validateTaskVerificationBinding',
    'modeAwareChecksState',
  ]);

  const qualityWorkflow = workflows.get('quality.yml');
  requireText(errors, 'quality.yml', qualityWorkflow, [
    'name: quality / release-audit',
    'EVIDENCE_FINAL:',
    'scripts/evidence-policy.mjs',
  ]);

  requireText(errors, 'quality-core.yml', workflows.get('quality-core.yml'), [
    'static-checks:',
    'product-tests:',
    'desktop-e2e:',
    'quality:',
  ]);
  requireText(errors, 'security.yml', workflows.get('security.yml'), [
    'scan-secrets.mjs',
    'pnpm test:security',
    'name: security',
  ]);
  requireText(errors, 'performance.yml', workflows.get('performance.yml'), [
    'vitest run tests/performance --no-file-parallelism --retry=1',
    'Run AI protocol baselines',
  ]);

  const releaseWorkflow = workflows.get('release.yml');
  const publishStart = releaseWorkflow.indexOf('\n  publish:');
  const finalStart = releaseWorkflow.indexOf('\n  release-status-final:');
  if (
    publishStart === -1 ||
    finalStart === -1 ||
    !releaseWorkflow.slice(publishStart, finalStart).includes('- release-status-ready')
  ) {
    errors.push('release.yml: publish must wait for release-status-ready before publishing');
  }

  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log('CI policy is valid for the automated engineering-gate model.');
}

const governancePrefixes = Object.freeze(['.github/', 'scripts/', 'tests/', 'docs/process/']);
const governanceExactFiles = new Set([
  'AGENTS.md',
  'agent.md',
  'package.json',
  'docs/PROJECT_EXECUTION_ENTRY.md',
]);

function isGovernanceMaintenancePath(file) {
  return (
    governanceExactFiles.has(file) || governancePrefixes.some((prefix) => file.startsWith(prefix))
  );
}

export function allowedPathsForBranch(branch) {
  if (branch === 'work') return ['<all repository paths>'];
  if (branch === 'governance') {
    return [...governancePrefixes, ...governanceExactFiles];
  }
  return [];
}

export function recommendBranch(files = []) {
  return Array.isArray(files) && files.length > 0 && files.every(isGovernanceMaintenancePath)
    ? 'governance'
    : 'work';
}

export function validateBranchPlan(branch, files) {
  if (!Array.isArray(files) || files.length === 0) {
    return {
      ok: false,
      violations: ['At least one changed file path is required.'],
      recommendedBranch: 'work',
    };
  }
  if (branch === 'work') return { ok: true, violations: [], recommendedBranch: 'work' };
  if (branch === 'governance') {
    const violations = files.filter((file) => !isGovernanceMaintenancePath(file));
    return {
      ok: violations.length === 0,
      violations: violations.map((file) => `Governance branch cannot change product path: ${file}`),
      recommendedBranch: violations.length === 0 ? 'governance' : 'work',
    };
  }
  return {
    ok: false,
    violations: [`Branch ${branch || '<missing>'} is forbidden; use work or governance.`],
    recommendedBranch: recommendBranch(files),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
