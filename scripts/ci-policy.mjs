import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GOVERNANCE_ALLOWED_PATHS,
  SCHEMA_GOVERNANCE_ALLOWED_PATHS,
  TASK_PLANNING_ALLOWED_PATHS,
  isPathInside,
} from './task-control-lib.mjs';

const root = process.cwd();
const githubDirectory = path.join(root, '.github');
const workflowDirectory = path.join(githubDirectory, 'workflows');

const requiredWorkflows = [
  'automerge.yml',
  'branch-hygiene.yml',
  'evidence.yml',
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
];

const requiredFiles = [
  '.github/governance/automerge-base-gate.mjs',
  '.github/governance/main-protection.json',
  '.github/governance/post-merge-verification.mjs',
  '.github/governance/required-checks.json',
  '.github/governance/task-transition-policy.mjs',
  'scripts/automerge.mjs',
  'scripts/branch-hygiene.mjs',
  'scripts/evidence-policy.mjs',
  'scripts/main-verification.mjs',
  'scripts/ruleset-policy.mjs',
  'scripts/scan-secrets.mjs',
];

const actionVersions = new Map([
  ['actions/checkout', 'v6'],
  ['actions/setup-node', 'v6'],
  ['actions/upload-artifact', 'v7'],
  ['actions/download-artifact', 'v8'],
  ['pnpm/action-setup', 'v4'],
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
  if (/pull_request_target\s*:|repository_dispatch\s*:/u.test(source)) {
    errors.push(`${file}: privileged PR triggers are forbidden`);
  }
  if (/git\s+push[^\n]*(?:HEAD:main|\bmain\b)/iu.test(source)) {
    errors.push(`${file}: direct main push is forbidden`);
  }

  for (const match of source.matchAll(/uses:\s*([^@\s]+)@([^\s#]+)/gu)) {
    const expected = actionVersions.get(match[1]);
    if (expected && match[2] !== expected) {
      errors.push(`${file}: ${match[1]} must use ${expected}`);
    }
  }

  const checkouts = [...source.matchAll(/uses:\s*actions\/checkout@v6/gu)].length;
  const safeCheckouts = [...source.matchAll(/persist-credentials:\s*false/gu)].length;
  if (checkouts !== safeCheckouts) {
    errors.push(`${file}: every checkout must disable credential persistence`);
  }
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

  const automerge = workflows.get('automerge.yml') ?? '';
  requireTokens(errors, 'automerge.yml', automerge, [
    'workflow_run:',
    '- PR Policy',
    '- Task Governance',
    '- Quality',
    '- Security',
    '- Performance',
    '- Evidence',
    'group: automerge-${{ github.event.workflow_run.head_sha }}',
    'automerge-base-gate.mjs',
    'scripts/automerge.mjs',
  ]);
  forbidTokens(errors, 'automerge.yml', automerge, ['CLOSEOUT_TRIGGER', 'tmp_closeout']);

  const prPolicy = workflows.get('pr-policy.yml') ?? '';
  requireTokens(errors, 'pr-policy.yml', prPolicy, [
    'pull_request:',
    'ready_for_review',
    'github.event.pull_request.draft == false',
    'taskctl.mjs pr-policy',
    'automation-layout-policy.mjs',
    'scripts/ci-policy.mjs',
  ]);

  const taskGovernance = workflows.get('task-governance.yml') ?? '';
  requireTokens(errors, 'task-governance.yml', taskGovernance, [
    'pull_request:',
    'ready_for_review',
    'github.event.pull_request.draft == false',
    'taskctl.mjs validate',
    'taskctl.mjs preflight',
    'task-transition-policy.mjs',
  ]);
  forbidTokens(errors, 'task-governance.yml', taskGovernance, [
    'taskctl.mjs pr-policy',
    'taskctl.mjs verify',
  ]);

  const evidence = workflows.get('evidence.yml') ?? '';
  requireTokens(errors, 'evidence.yml', evidence, [
    'pull_request:',
    'workflow_dispatch:',
    'schedule:',
    "github.event_name != 'pull_request' || github.event.pull_request.draft == false",
    'Validate changed task evidence documents',
    "github.event_name == 'pull_request'",
    'Validate all Verified task evidence documents',
    "github.event_name != 'pull_request'",
    'scripts/evidence-policy.mjs',
    'scripts/verified-evidence-scan.mjs',
  ]);
  forbidTokens(errors, 'evidence.yml', evidence, ['screenshots']);

  const quality = workflows.get('quality.yml') ?? '';
  requireTokens(errors, 'quality.yml', quality, [
    'pull_request:',
    'ready_for_review',
    'converted_to_draft',
    'Determine Ready quality route',
    'full_suite:',
    'quality-core.yml',
    'package_smoke: false',
    'performance_eval: false',
  ]);
  forbidTokens(errors, 'quality.yml', quality, ['static-failure-diagnostics']);

  const qualityCore = workflows.get('quality-core.yml') ?? '';
  requireTokens(errors, 'quality-core.yml', qualityCore, [
    'full_suite:',
    'static-checks:',
    'tests:',
    'Skip product tests for documentation-only Ready PR',
    'desktop-e2e:',
    'Skip Electron E2E for documentation-only Ready PR',
    'build:',
    'Skip build for documentation-only Ready PR',
    'package-smoke:',
    'Package smoke not required for this route',
    'Package smoke is reserved for Release or an explicitly enabled reusable gate.',
    'if: ${{ inputs.package_smoke }}',
    'quality:',
    'require_optional_job "$PACKAGE_REQUIRED" "$PACKAGE_RESULT" package-smoke',
  ]);

  const security = workflows.get('security.yml') ?? '';
  requireTokens(errors, 'security.yml', security, [
    'pull_request:',
    'converted_to_draft',
    'github.event.pull_request.draft == false',
    'pnpm audit --audit-level=high',
    'scan-secrets.mjs',
    'pnpm test:security',
    'name: security',
  ]);
  forbidTokens(errors, 'security.yml', security, ['activeTask?.verification?.includes']);

  const performance = workflows.get('performance.yml') ?? '';
  requireTokens(errors, 'performance.yml', performance, [
    'pull_request:',
    'workflow_dispatch:',
    'converted_to_draft',
    "github.event_name != 'pull_request' || github.event.pull_request.draft == false",
    'Determine performance validation route',
    'Run performance budgets',
    'pnpm test:perf',
    'changed paths are not performance-sensitive',
  ]);
  forbidTokens(errors, 'performance.yml', performance, ['activeTask?.verification?.includes']);

  const mainVerification = workflows.get('main-verification.yml') ?? '';
  requireTokens(errors, 'main-verification.yml', mainVerification, [
    'workflow_dispatch:',
    'expected_sha:',
    'source_pr:',
    'source_head_sha:',
    'statuses: write',
    'scripts/main-verification.mjs',
    'name: Main static verification',
    'draft_mode: true',
    'package_smoke: false',
    'security_suite: false',
    'performance_eval: false',
    'name: main-verification',
  ]);

  const dispatcher = workflows.get('post-merge-verification.yml') ?? '';
  requireTokens(errors, 'post-merge-verification.yml', dispatcher, [
    'pull_request:',
    'types: [closed]',
    'github.event.pull_request.merged == true',
    'post-merge-verification.mjs',
  ]);

  const release = workflows.get('release.yml') ?? '';
  requireTokens(errors, 'release.yml', release, [
    'workflow_dispatch:',
    'environment: release',
    'security_suite: true',
    'performance_eval: true',
    'pnpm build',
    'pnpm package --',
  ]);
  forbidTokens(errors, 'release.yml', release, ['pull_request:', 'schedule:']);

  for (const file of [
    'quality.yml',
    'security.yml',
    'performance.yml',
    'evidence.yml',
    'task-governance.yml',
  ]) {
    const source = workflows.get(file) ?? '';
    if (/^\s*push:/mu.test(source)) {
      errors.push(`${file}: post-merge verification belongs to main-verification.yml`);
    }
  }

  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log('CI policy is valid.');
}

function everyPathAllowed(files, allowedPaths) {
  return files.every((file) => allowedPaths.some((allowed) => isPathInside(file, allowed)));
}

export function allowedPathsForBranch(branch, activeState = null) {
  if (/^policy\/task-plan-/u.test(branch)) {
    return [...GOVERNANCE_ALLOWED_PATHS, ...TASK_PLANNING_ALLOWED_PATHS];
  }
  if (/^(?:policy|fix)\/governance-schema-/u.test(branch)) {
    return [...GOVERNANCE_ALLOWED_PATHS, ...SCHEMA_GOVERNANCE_ALLOWED_PATHS];
  }
  if (/^(?:policy\/|chore\/governance-|fix\/governance-)/u.test(branch)) {
    return GOVERNANCE_ALLOWED_PATHS;
  }
  if (branch && branch === activeState?.activeTask?.branch) {
    return activeState.activeTask.allowedPaths ?? [];
  }
  return [];
}

export function recommendBranch(files, activeState = null) {
  if (everyPathAllowed(files, GOVERNANCE_ALLOWED_PATHS)) {
    return 'policy/<topic>';
  }
  const planningPaths = [...GOVERNANCE_ALLOWED_PATHS, ...TASK_PLANNING_ALLOWED_PATHS];
  if (everyPathAllowed(files, planningPaths)) {
    return 'policy/task-plan-<topic>';
  }
  const schemaPaths = [...GOVERNANCE_ALLOWED_PATHS, ...SCHEMA_GOVERNANCE_ALLOWED_PATHS];
  if (everyPathAllowed(files, schemaPaths)) {
    return 'policy/governance-schema-<topic>';
  }
  return activeState?.activeTask?.branch ?? '<active-task-branch>';
}

export function validateBranchPlan(branch, files, activeState = null) {
  if (!branch || branch === 'main') {
    return {
      ok: false,
      violations: ['A named non-main branch is required.'],
      recommendedBranch: recommendBranch(files, activeState),
    };
  }
  if (!Array.isArray(files) || files.length === 0) {
    return {
      ok: false,
      violations: ['At least one changed file path is required.'],
      recommendedBranch: recommendBranch([], activeState),
    };
  }

  const allowedPaths = allowedPathsForBranch(branch, activeState);
  if (allowedPaths.length === 0) {
    return {
      ok: false,
      violations: [`Branch ${branch} is not authorized for governance or the active task.`],
      recommendedBranch: recommendBranch(files, activeState),
    };
  }

  const forbiddenPaths =
    branch === activeState?.activeTask?.branch ? (activeState.activeTask.forbiddenPaths ?? []) : [];
  const violations = files.flatMap((file) => {
    if (forbiddenPaths.some((blocked) => isPathInside(file, blocked))) {
      return [`${file}: forbidden by the active task`];
    }
    if (!allowedPaths.some((allowed) => isPathInside(file, allowed))) {
      return [`${file}: outside the branch authorization`];
    }
    return [];
  });
  return {
    ok: violations.length === 0,
    violations,
    recommendedBranch: violations.length > 0 ? recommendBranch(files, activeState) : branch,
  };
}

async function branchCheck() {
  const state = JSON.parse(await readFile(path.join(root, 'docs/tasks/ACTIVE_TASK.json'), 'utf8'));
  const values = process.argv.slice(3);
  const branchArgument = values.find((value) => value.startsWith('--branch='));
  const branch = branchArgument?.slice('--branch='.length) ?? '';
  const files = values.filter((value) => !value.startsWith('--'));
  const result = validateBranchPlan(branch, files, state);
  if (!result.ok) {
    throw new Error(
      `${result.violations.join('\n')}\nRecommended branch: ${result.recommendedBranch}`,
    );
  }
  console.log(`Branch preflight passed: ${branch}`);
  console.log(`Files: ${files.join(', ')}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2] ?? 'validate';
  if (command === 'branch-check') await branchCheck();
  else if (command === 'validate') await main();
  else throw new Error(`Unknown ci-policy command: ${command}`);
}
