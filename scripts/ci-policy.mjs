import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    'quality-core.yml',
    'package_smoke: false',
    'performance_eval: false',
  ]);
  forbidTokens(errors, 'quality.yml', quality, ['static-failure-diagnostics']);

  const qualityCore = workflows.get('quality-core.yml') ?? '';
  requireTokens(errors, 'quality-core.yml', qualityCore, [
    'static-checks:',
    'tests:',
    'desktop-e2e:',
    'build:',
    'package-smoke:',
    'Keep package gate green for daily Ready PRs',
    'Package smoke deferred to Release or an explicitly enabled reusable gate.',
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

  const performance = workflows.get('performance.yml') ?? '';
  requireTokens(errors, 'performance.yml', performance, [
    'pull_request:',
    'workflow_dispatch:',
    'converted_to_draft',
    "github.event_name != 'pull_request' || github.event.pull_request.draft == false",
    'Determine performance validation route',
    'Run performance budgets',
    'pnpm test:perf',
    'activeTask?.verification?.includes',
  ]);

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

  for (const file of [
    'pr-policy.yml',
    'task-governance.yml',
    'evidence.yml',
    'security.yml',
    'performance.yml',
    'quality-core.yml',
    'main-verification.yml',
    'post-merge-verification.yml',
  ]) {
    requireTokens(errors, file, workflows.get(file) ?? '', ['assert-clean-tree.mjs']);
  }

  const requiredChecks = JSON.parse(
    await readFile(path.join(root, '.github/governance/required-checks.json'), 'utf8'),
  );
  const expectedChecks = [
    'pr-policy',
    'task-governance',
    'quality / quality',
    'security',
    'performance',
    'evidence',
  ];
  if (JSON.stringify(requiredChecks.requiredChecks) !== JSON.stringify(expectedChecks)) {
    errors.push('required-checks.json: permanent check names changed unexpectedly');
  }

  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log('Permanent CI policy passed.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
