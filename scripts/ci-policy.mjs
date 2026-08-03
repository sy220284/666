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
const workflowDirectory = path.join(root, '.github', 'workflows');

const requiredWorkflows = [
  'automerge.yml',
  'branch-hygiene.yml',
  'engineering-validation.yml',
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
  'toolchain-export.yml',
  'work-synchronization.yml',
];

const requiredFiles = [
  '.github/governance/automation-layout-policy.mjs',
  '.github/governance/automerge-base-gate.mjs',
  '.github/governance/branch-inventory-policy.mjs',
  '.github/governance/main-protection.json',
  '.github/governance/post-merge-verification.mjs',
  '.github/governance/required-checks.json',
  '.github/governance/secret-scan-allowlist.json',
  '.github/governance/single-work-policy.mjs',
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
  if (/pull_request_target\s*:|repository_dispatch\s*:/u.test(source)) {
    errors.push(`${file}: privileged PR triggers are forbidden`);
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

  const prPolicy = workflows.get('pr-policy.yml') ?? '';
  requireTokens(errors, 'pr-policy.yml', prPolicy, [
    'pull_request:',
    'ready_for_review',
    'converted_to_draft',
    'single-work-policy.mjs validate',
    'automation-layout-policy.mjs',
    'pnpm ci:policy',
  ]);
  forbidTokens(errors, 'pr-policy.yml', prPolicy, [
    'verification-hold-taskctl.mjs pr-policy',
    'parallel-task-policy.mjs',
  ]);

  const taskGovernance = workflows.get('task-governance.yml') ?? '';
  requireTokens(errors, 'task-governance.yml', taskGovernance, [
    'pull_request:',
    'ready_for_review',
    'converted_to_draft',
    'single-work-policy.mjs validate',
  ]);
  forbidTokens(errors, 'task-governance.yml', taskGovernance, [
    'parallel-task-policy.mjs',
    'verification-hold-taskctl.mjs validate',
    'verification-hold-taskctl.mjs preflight',
    "startsWith(github.head_ref, 'policy/')",
    "startsWith(github.head_ref, 'fix/')",
  ]);

  const branchHygiene = workflows.get('branch-hygiene.yml') ?? '';
  requireTokens(errors, 'branch-hygiene.yml', branchHygiene, [
    'branch-inventory-policy.mjs self-test',
    'branch-inventory-policy.mjs',
  ]);
  forbidTokens(errors, 'branch-hygiene.yml', branchHygiene, [
    'contents: write',
    'scripts/work-branch-policy.mjs',
  ]);

  const workSynchronization = workflows.get('work-synchronization.yml') ?? '';
  requireTokens(errors, 'work-synchronization.yml', workSynchronization, [
    '- Main Verification',
    'contents: write',
    'pull-requests: read',
    'work-synchronization.mjs self-test',
    'work-synchronization.mjs',
  ]);
  forbidTokens(errors, 'work-synchronization.yml', workSynchronization, [
    'pull_request:',
    'push:',
    'git push',
  ]);

  const automerge = workflows.get('automerge.yml') ?? '';
  requireTokens(errors, 'automerge.yml', automerge, [
    'workflow_run:',
    '- PR Policy',
    '- Task Governance',
    '- Quality',
    '- Security',
    '- Performance',
    '- Evidence',
    'automerge-base-gate.mjs',
    'scripts/automerge.mjs',
  ]);

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

  const evidence = workflows.get('evidence.yml') ?? '';
  requireTokens(errors, 'evidence.yml', evidence, ['pull_request:', 'workflow_dispatch:', 'schedule:']);
  const quality = workflows.get('quality.yml') ?? '';
  requireTokens(errors, 'quality.yml', quality, ['pull_request:', 'quality-core.yml']);
  const security = workflows.get('security.yml') ?? '';
  requireTokens(errors, 'security.yml', security, ['pull_request:', 'scan-secrets.mjs', 'name: security']);
  const performance = workflows.get('performance.yml') ?? '';
  requireTokens(errors, 'performance.yml', performance, ['pull_request:', 'workflow_dispatch:', 'pnpm test:perf']);
  const release = workflows.get('release.yml') ?? '';
  requireTokens(errors, 'release.yml', release, ['workflow_dispatch:', 'environment: release']);
  forbidTokens(errors, 'release.yml', release, ['pull_request:', 'schedule:']);

  for (const [file, source] of workflows) {
    if (/(?:work|feat|fix|chore|policy|validate|release)\/[a-z0-9._/-]+/iu.test(source)) {
      errors.push(`${file}: task-specific or auxiliary branch syntax is forbidden`);
    }
  }

  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log('CI policy is valid for the single work branch model.');
}

function everyPathAllowed(files, allowedPaths) {
  return files.every((file) => allowedPaths.some((allowed) => isPathInside(file, allowed)));
}

export function allowedPathsForBranch(branch, activeState = null) {
  if (branch !== 'work') return [];
  return [
    ...new Set([
      ...GOVERNANCE_ALLOWED_PATHS,
      ...TASK_PLANNING_ALLOWED_PATHS,
      ...SCHEMA_GOVERNANCE_ALLOWED_PATHS,
      ...(activeState?.activeTask?.allowedPaths ?? []),
    ]),
  ];
}

export function recommendBranch() {
  return 'work';
}

export function validateBranchPlan(branch, files, activeState = null) {
  if (branch !== 'work') {
    return {
      ok: false,
      violations: [`Branch ${branch || '<missing>'} is forbidden; use work.`],
      recommendedBranch: 'work',
    };
  }
  if (!Array.isArray(files) || files.length === 0) {
    return { ok: false, violations: ['At least one changed file path is required.'], recommendedBranch: 'work' };
  }
  const allowedPaths = allowedPathsForBranch(branch, activeState);
  const violations = files
    .filter((file) => !allowedPaths.some((allowed) => isPathInside(file, allowed)))
    .map((file) => `${file}: outside authorized work paths`);
  return { ok: violations.length === 0, violations, recommendedBranch: 'work' };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
