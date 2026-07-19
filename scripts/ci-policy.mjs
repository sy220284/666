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

const obsoleteMergeMarkers = [
  'CLOSEOUT_TRIGGER',
  'tmp_closeout',
  'work/m1-08-recovery-readonly-foundation',
  '29668237967',
  '9110b16bfc2c08d210d0306b7b394ef20cc9c9f7',
  'final-closeout.patch',
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function indentation(line) {
  return line.match(/^ */u)?.[0].length ?? 0;
}

function yamlBlock(source, key, indent = 0) {
  const lines = source.split('\n');
  const prefix = ' '.repeat(indent);
  const pattern = new RegExp(`^${prefix}${escapeRegExp(key)}:\\s*(?:#.*)?$`, 'u');
  const start = lines.findIndex((line) => pattern.test(line));
  if (start < 0) return null;

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (indentation(line) <= indent) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

function jobBlock(source, jobName) {
  const jobs = yamlBlock(source, 'jobs');
  return jobs ? yamlBlock(jobs, jobName, 2) : null;
}

function count(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function requireBlock(errors, file, source, key, indent = 0) {
  const block = yamlBlock(source, key, indent);
  if (!block) errors.push(`${file}: missing YAML block ${key}`);
  return block ?? '';
}

function requireJob(errors, file, source, jobName) {
  const block = jobBlock(source, jobName);
  if (!block) errors.push(`${file}: missing job ${jobName}`);
  return block ?? '';
}

function requireTokens(errors, file, source, tokens) {
  for (const token of tokens) {
    if (!source.includes(token)) errors.push(`${file}: missing ${token}`);
  }
}

function forbidTokens(errors, file, source, tokens) {
  for (const token of tokens) {
    if (source.includes(token)) errors.push(`${file}: obsolete or forbidden marker ${token}`);
  }
}

function validateWorkflowEnvelope(errors, file, source) {
  requireBlock(errors, file, source, 'on');
  requireBlock(errors, file, source, 'permissions');
  requireBlock(errors, file, source, 'jobs');

  if (/\t/u.test(source)) errors.push(`${file}: tabs are forbidden in workflow YAML`);
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

  const checkouts = count(source, /uses:\s*actions\/checkout@v6/gu);
  const safeCheckouts = count(source, /persist-credentials:\s*false/gu);
  if (checkouts !== safeCheckouts) {
    errors.push(`${file}: every checkout must explicitly disable credential persistence`);
  }
}

async function main() {
  const files = (await readdir(workflowDirectory)).filter((file) => /\.ya?ml$/u.test(file)).sort();
  const errors = [];

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

  const githubEntries = await readdir(githubDirectory, { withFileTypes: true });
  for (const entry of githubEntries) {
    if (entry.isDirectory() && /^m\d+-/iu.test(entry.name)) {
      errors.push(
        `Task-specific GitHub automation directory must be removed: .github/${entry.name}`,
      );
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
  const automergeOn = requireBlock(errors, 'automerge.yml', automerge, 'on');
  const automergeConcurrency = requireBlock(errors, 'automerge.yml', automerge, 'concurrency');
  const automergeJob = requireJob(errors, 'automerge.yml', automerge, 'automerge');
  requireTokens(errors, 'automerge.yml on', automergeOn, [
    'workflow_run:',
    '- PR Policy',
    '- Task Governance',
    '- Quality',
    '- Security',
    '- Performance',
    '- Evidence',
  ]);
  requireTokens(errors, 'automerge.yml concurrency', automergeConcurrency, [
    'group: automerge-${{ github.event.workflow_run.head_sha }}',
    'cancel-in-progress: true',
  ]);
  requireTokens(errors, 'automerge.yml automerge job', automergeJob, [
    'ref: main',
    'automerge-base-gate.mjs',
    'scripts/automerge.mjs',
  ]);
  if (jobBlock(automerge, 'closeout')) {
    errors.push('automerge.yml: historical closeout job must not exist');
  }
  forbidTokens(errors, 'automerge.yml', automerge, obsoleteMergeMarkers);

  for (const file of ['pr-policy.yml', 'task-governance.yml', 'evidence.yml']) {
    const source = workflows.get(file) ?? '';
    const onBlock = requireBlock(errors, file, source, 'on');
    requireTokens(errors, `${file} on`, onBlock, ['pull_request:', 'ready_for_review']);
  }

  for (const file of ['quality.yml', 'security.yml', 'performance.yml']) {
    const source = workflows.get(file) ?? '';
    const onBlock = requireBlock(errors, file, source, 'on');
    requireTokens(errors, `${file} on`, onBlock, [
      'pull_request:',
      'ready_for_review',
      'converted_to_draft',
    ]);
  }

  const qualityCore = workflows.get('quality-core.yml') ?? '';
  for (const job of [
    'static-checks',
    'tests',
    'security-tests',
    'performance-eval',
    'desktop-e2e',
    'build',
    'package-smoke',
    'quality',
  ]) {
    requireJob(errors, 'quality-core.yml', qualityCore, job);
  }
  const qualityAggregate = requireJob(errors, 'quality-core.yml', qualityCore, 'quality');
  requireTokens(errors, 'quality-core.yml quality job', qualityAggregate, [
    'PACKAGE_REQUIRED: ${{ inputs.package_smoke }}',
    'SECURITY_REQUIRED: ${{ inputs.security_suite }}',
    'PERFORMANCE_REQUIRED: ${{ inputs.performance_eval }}',
    'require_optional_job "$SECURITY_REQUIRED" "$SECURITY_RESULT" security-tests',
    'require_optional_job "$PERFORMANCE_REQUIRED" "$PERFORMANCE_RESULT" performance-eval',
    'require_optional_job "$PACKAGE_REQUIRED" "$PACKAGE_RESULT" package-smoke',
  ]);

  const security = workflows.get('security.yml') ?? '';
  requireTokens(errors, 'security.yml', security, [
    'pnpm audit --audit-level=high',
    'scan-secrets.mjs',
    'pnpm test:security',
  ]);

  const performance = workflows.get('performance.yml') ?? '';
  requireTokens(errors, 'performance.yml', performance, [
    'Draft pull request fast path',
    'Run performance budgets',
    'pnpm test:perf',
  ]);

  const mainVerificationWorkflow = workflows.get('main-verification.yml') ?? '';
  const mainVerificationOn = requireBlock(
    errors,
    'main-verification.yml',
    mainVerificationWorkflow,
    'on',
  );
  requireTokens(errors, 'main-verification.yml on', mainVerificationOn, [
    'workflow_dispatch:',
    'expected_sha:',
    'source_pr:',
    'source_head_sha:',
  ]);
  requireTokens(errors, 'main-verification.yml', mainVerificationWorkflow, [
    'statuses: write',
    'scripts/main-verification.mjs',
    'package_smoke: true',
    'security_suite: true',
    'performance_eval: true',
    'name: main-verification',
  ]);

  const dispatcher = workflows.get('post-merge-verification.yml') ?? '';
  const dispatcherOn = requireBlock(errors, 'post-merge-verification.yml', dispatcher, 'on');
  requireTokens(errors, 'post-merge-verification.yml on', dispatcherOn, [
    'pull_request:',
    'types: [closed]',
  ]);
  requireTokens(errors, 'post-merge-verification.yml', dispatcher, [
    'github.event.pull_request.merged == true',
    'post-merge-verification.mjs',
  ]);

  const release = workflows.get('release.yml') ?? '';
  const releaseOn = requireBlock(errors, 'release.yml', release, 'on');
  requireTokens(errors, 'release.yml on', releaseOn, ['workflow_dispatch:']);
  for (const forbiddenTrigger of ['pull_request:', 'push:', 'schedule:']) {
    if (releaseOn.includes(forbiddenTrigger)) {
      errors.push(`release.yml: manual release must not include ${forbiddenTrigger}`);
    }
  }
  requireTokens(errors, 'release.yml', release, [
    'environment: release',
    'security_suite: true',
    'performance_eval: true',
  ]);
  const buildIndex = release.indexOf('pnpm build');
  const packageIndex = release.indexOf('pnpm package --');
  if (buildIndex < 0 || packageIndex < 0 || buildIndex > packageIndex) {
    errors.push('release.yml: release must build before packaging');
  }

  for (const file of [
    'quality.yml',
    'security.yml',
    'performance.yml',
    'evidence.yml',
    'task-governance.yml',
  ]) {
    const onBlock = requireBlock(errors, file, workflows.get(file) ?? '', 'on');
    if (/^\s*push:/mu.test(onBlock)) {
      errors.push(`${file}: post-merge verification must be owned by main-verification.yml`);
    }
  }

  const automergeScript = await readFile(path.join(root, 'scripts/automerge.mjs'), 'utf8');
  requireTokens(errors, 'scripts/automerge.mjs', automergeScript, [
    'compare/${mainSha}...${sha}',
    'comparison.behind_by > 0',
    'pull.head.sha !== sha',
    "check.conclusion === 'success'",
    'pull.merged',
    'mainVerificationWorkflow',
    '/actions/workflows/',
    '/dispatches',
    'workflow_runs',
    'expected_sha',
  ]);

  const mainVerification = await readFile(path.join(root, 'scripts/main-verification.mjs'), 'utf8');
  requireTokens(errors, 'scripts/main-verification.mjs', mainVerification, [
    'GITHUB_SHA',
    'merge_commit_sha',
    'requiredChecks',
    "check.conclusion !== 'success'",
    'refs/heads/${baseBranch}',
    'mainVerificationStatusPayload',
    '/statuses/${expectedSha}',
    "context: 'main-verification'",
    "command === 'publish-status'",
  ]);

  const branchHygiene = await readFile(path.join(root, 'scripts/branch-hygiene.mjs'), 'utf8');
  requireTokens(errors, 'scripts/branch-hygiene.mjs', branchHygiene, [
    'pull?.merged_at || comparison.ahead_by === 0',
    "classification: safeDelete ? 'obsolete' : 'orphaned-work'",
  ]);
  if (branchHygiene.includes("pull?.state === 'closed'")) {
    errors.push('scripts/branch-hygiene.mjs: closed PR state must not authorize deletion');
  }

  const evidencePolicy = await readFile(path.join(root, 'scripts/evidence-policy.mjs'), 'utf8');
  requireTokens(errors, 'scripts/evidence-policy.mjs', evidencePolicy, [
    'changedEvidenceTasks',
    'evidence integrity mismatch',
    'screenshot is absent from the evidence manifest',
    'evidence contains unlisted files',
    'for (const taskId of taskIds)',
    'EVIDENCE_BASE_SHA',
  ]);

  const rulesetPolicy = await readFile(path.join(root, 'scripts/ruleset-policy.mjs'), 'utf8');
  requireTokens(errors, 'scripts/ruleset-policy.mjs', rulesetPolicy, [
    'bypass actors are configured',
    'required status checks do not require the branch to be current',
    'throw new Error(`Native main ruleset is missing or drifted:',
  ]);

  const checks = JSON.parse(
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
  if (checks.mergeMethod !== 'squash')
    errors.push('required-checks.json: mergeMethod must be squash');
  if (checks.mainVerificationWorkflow !== 'main-verification.yml') {
    errors.push('required-checks.json: main verification workflow must be main-verification.yml');
  }
  if ('deleteHeadBranchAfterMerge' in checks) {
    errors.push(
      'required-checks.json: branch deletion is owned by Branch Hygiene, not merge config',
    );
  }
  if (JSON.stringify(checks.requiredChecks) !== JSON.stringify(expectedChecks)) {
    errors.push(
      'required-checks.json: requiredChecks must exactly match the permanent Ruleset checks',
    );
  }

  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log(`CI policy passed for ${files.length} permanent workflows.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
