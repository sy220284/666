import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const workflowDirectory = path.join(root, '.github/workflows');
const requiredWorkflows = [
  'branch-hygiene.yml',
  'evidence.yml',
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
  'scripts/evidence-policy.mjs',
  'scripts/ruleset-policy.mjs',
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
      if (expected && match[2] !== expected)
        errors.push(`${file}: ${match[1]} must use ${expected}`);
    }
    const checkouts = count(source, /uses:\s*actions\/checkout@v6/gu);
    const safeCheckouts = count(source, /persist-credentials:\s*false/gu);
    if (checkouts !== safeCheckouts) errors.push(`${file}: checkout credentials must not persist`);
  }

  const tokenRequirements = new Map([
    ['pr-policy.yml', ['taskctl.mjs pr-policy', 'ci-policy.mjs']],
    [
      'task-governance.yml',
      ['taskctl.mjs validate', 'taskctl.mjs preflight', 'taskctl.mjs verify'],
    ],
    [
      'quality-core.yml',
      ['static-checks:', 'tests:', 'desktop-e2e:', 'build:', 'package-smoke:', 'quality:'],
    ],
    ['security.yml', ['pnpm audit', 'scan-secrets.mjs', 'pnpm test:security', 'name: security']],
    ['performance.yml', ['pnpm test:perf', 'name: performance']],
    ['evidence.yml', ['evidence-policy.mjs', 'name: evidence']],
    ['repository-governance.yml', ['ruleset-policy.mjs']],
  ]);
  for (const [file, tokens] of tokenRequirements) {
    const source = workflows.get(file) ?? '';
    for (const token of tokens)
      if (!source.includes(token)) errors.push(`${file}: missing ${token}`);
  }

  const release = workflows.get('release.yml') ?? '';
  if (!release.includes('workflow_dispatch:')) errors.push('release.yml must be manual-only');
  if (!release.includes('environment: release'))
    errors.push('release publish must use environment: release');
  const buildIndex = release.indexOf('pnpm build');
  const packageIndex = release.indexOf('pnpm package --');
  if (buildIndex < 0 || packageIndex < 0 || buildIndex > packageIndex) {
    errors.push('release must build before packaging');
  }

  const checks = JSON.parse(
    await readFile(path.join(root, '.github/governance/required-checks.json'), 'utf8'),
  );
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
