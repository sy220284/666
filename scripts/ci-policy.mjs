import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const workflowDirectory = path.join(root, '.github/workflows');
const requiredWorkflows = [
  'automerge.yml',
  'branch-hygiene.yml',
  'evidence.yml',
  'main-verification.yml',
  'performance.yml',
  'pr-policy.yml',
  'quality-core.yml',
  'quality.yml',
  'release.yml',
  'repository-governance.yml',
  'security.yml',
  'task-governance.yml',
];
const requiredFiles = [
  '.github/governance/main-protection.json',
  '.github/governance/required-checks.json',
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

function count(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function requireTokens(errors, file, source, tokens) {
  for (const token of tokens) {
    if (!source.includes(token)) errors.push(`${file}: missing ${token}`);
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
  for (const file of ['lint-diagnostic.yml', 'manual-merge-revert.yml', 'ci-doc-sync.yml']) {
    if (files.includes(file)) errors.push(`Temporary workflow must be removed: ${file}`);
  }

  const workflows = new Map();
  for (const file of files) {
    const source = await readFile(path.join(workflowDirectory, file), 'utf8');
    workflows.set(file, source);
    if (!/^permissions:/mu.test(source)) errors.push(`${file}: permissions must be explicit`);
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
    if (checkouts !== safeCheckouts) errors.push(`${file}: checkout credentials must not persist`);
  }

  const tokenRequirements = new Map([
    [
      'automerge.yml',
      [
        'workflow_run:',
        'scripts/automerge.mjs',
        'actions: write',
        'contents: write',
        'pull-requests: write',
        'group: automerge-main',
      ],
    ],
    [
      'branch-hygiene.yml',
      ['workflow_dispatch:', 'BRANCH_HYGIENE_APPLY: ${{ inputs.apply == true }}'],
    ],
    ['pr-policy.yml', ['taskctl.mjs pr-policy', 'ci-policy.mjs']],
    [
      'task-governance.yml',
      ['taskctl.mjs validate', 'taskctl.mjs preflight', 'taskctl.mjs verify'],
    ],
    [
      'quality-core.yml',
      [
        'draft_mode:',
        'inputs.draft_mode == false',
        'static-checks:',
        'tests:',
        'security-tests:',
        'performance-eval:',
        'desktop-e2e:',
        'build:',
        'package-smoke:',
        'quality:',
        'DRAFT_MODE:',
        'if: failure()',
      ],
    ],
    [
      'quality.yml',
      [
        'ready_for_review',
        'converted_to_draft',
        'draft_mode: ${{ github.event.pull_request.draft == true }}',
        'security_suite: false',
        'performance_eval: false',
      ],
    ],
    [
      'security.yml',
      [
        'github.event.pull_request.draft == false',
        'pnpm audit',
        'scan-secrets.mjs',
        'pnpm test:security',
        'DRAFT_MODE:',
        'name: security',
      ],
    ],
    [
      'performance.yml',
      [
        'ready_for_review',
        'converted_to_draft',
        'Draft pull request fast path',
        'pnpm test:perf',
        'name: performance',
      ],
    ],
    ['evidence.yml', ['EVIDENCE_BASE_SHA:', 'evidence-policy.mjs', 'name: evidence']],
    [
      'main-verification.yml',
      [
        'workflow_dispatch:',
        'expected_sha:',
        'source_pr:',
        'source_head_sha:',
        'statuses: write',
        'scripts/main-verification.mjs',
        'publish-status',
        'package_smoke: true',
        'security_suite: true',
        'performance_eval: true',
        'name: main-verification',
      ],
    ],
    [
      'repository-governance.yml',
      ['ruleset-policy.mjs check', 'RULESET_STRICT: true', 'REPO_ADMIN_TOKEN:'],
    ],
  ]);
  for (const [file, tokens] of tokenRequirements) {
    requireTokens(errors, file, workflows.get(file) ?? '', tokens);
  }

  for (const file of [
    'quality.yml',
    'security.yml',
    'performance.yml',
    'evidence.yml',
    'task-governance.yml',
  ]) {
    if (/^\s*push:/mu.test(workflows.get(file) ?? '')) {
      errors.push(`${file}: post-merge verification must be owned by main-verification.yml`);
    }
  }

  const automerge = await readFile(path.join(root, 'scripts/automerge.mjs'), 'utf8');
  requireTokens(errors, 'scripts/automerge.mjs', automerge, [
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

  const release = workflows.get('release.yml') ?? '';
  if (!release.includes('workflow_dispatch:')) errors.push('release.yml must be manual-only');
  if (!release.includes('environment: release')) {
    errors.push('release publish must use environment: release');
  }
  requireTokens(errors, 'release.yml', release, ['security_suite: true', 'performance_eval: true']);
  const buildIndex = release.indexOf('pnpm build');
  const packageIndex = release.indexOf('pnpm package --');
  if (buildIndex < 0 || packageIndex < 0 || buildIndex > packageIndex) {
    errors.push('release must build before packaging');
  }

  const checks = JSON.parse(
    await readFile(path.join(root, '.github/governance/required-checks.json'), 'utf8'),
  );
  if (checks.mainVerificationWorkflow !== 'main-verification.yml') {
    errors.push('Post-merge main verification workflow must be main-verification.yml');
  }
  for (const check of [
    'pr-policy',
    'task-governance',
    'quality / quality',
    'security',
    'performance',
    'evidence',
  ]) {
    if (!checks.requiredChecks.includes(check)) errors.push(`Missing required check: ${check}`);
  }

  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log(`CI policy passed for ${files.length} workflows.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
