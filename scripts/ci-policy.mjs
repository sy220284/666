import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const workflowDirectory = path.join(root, '.github/workflows');
const requiredWorkflows = new Set([
  'branch-hygiene.yml',
  'pr-policy.yml',
  'quality-core.yml',
  'quality.yml',
  'release.yml',
  'security.yml',
  'task-governance.yml',
]);
const approvedActionMajors = new Map([
  ['actions/checkout', 'v6'],
  ['actions/setup-node', 'v6'],
  ['actions/upload-artifact', 'v7'],
  ['actions/download-artifact', 'v8'],
  ['pnpm/action-setup', 'v4'],
]);

function occurrences(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function validateActionVersions(fileName, source, errors) {
  for (const match of source.matchAll(/uses:\s*([^@\s]+)@([^\s#]+)/gu)) {
    const [, action, version] = match;
    const expected = approvedActionMajors.get(action);
    if (expected && version !== expected) {
      errors.push(`${fileName}: ${action} must use ${expected}, found ${version}`);
    }
  }
  const checkoutCount = occurrences(source, /uses:\s*actions\/checkout@v6/gu);
  const safeCheckoutCount = occurrences(source, /persist-credentials:\s*false/gu);
  if (checkoutCount !== safeCheckoutCount) {
    errors.push(
      `${fileName}: every checkout must set persist-credentials: false (${checkoutCount} checkout, ${safeCheckoutCount} safe)`,
    );
  }
}

function validateWorkflow(fileName, source, errors) {
  if (!/^permissions:/mu.test(source)) {
    errors.push(`${fileName}: workflow must declare least-privilege permissions`);
  }
  if (/permissions:\s*write-all/iu.test(source)) {
    errors.push(`${fileName}: permissions: write-all is forbidden`);
  }
  if (/pull_request_target\s*:|workflow_run\s*:|repository_dispatch\s*:/u.test(source)) {
    errors.push(`${fileName}: privileged or indirect trigger is forbidden`);
  }
  if (
    /git\s+push[^\n]*(?:HEAD:main|\bmain\b)|gh\s+pr\s+merge|merge_pull_request|enablePullRequestAutoMerge/iu.test(
      source,
    )
  ) {
    errors.push(`${fileName}: direct main push or automatic PR merge is forbidden`);
  }
  if (fileName !== 'release.yml' && /contents:\s*write/iu.test(source)) {
    errors.push(`${fileName}: contents: write is reserved for release publication`);
  }
  validateActionVersions(fileName, source, errors);
}

async function main() {
  const files = (await readdir(workflowDirectory)).filter((name) => /\.ya?ml$/u.test(name)).sort();
  const errors = [];
  for (const required of requiredWorkflows) {
    if (!files.includes(required)) errors.push(`Missing required workflow: ${required}`);
  }

  const workflows = new Map();
  for (const fileName of files) {
    const source = await readFile(path.join(workflowDirectory, fileName), 'utf8');
    workflows.set(fileName, source);
    validateWorkflow(fileName, source, errors);
  }

  const quality = workflows.get('quality-core.yml') ?? '';
  for (const token of [
    'static-checks:',
    'tests:',
    'performance-eval:',
    'desktop-e2e:',
    'build:',
    'package-smoke:',
    'quality:',
  ]) {
    if (!quality.includes(token)) errors.push(`quality-core.yml is missing ${token}`);
  }

  const governance = workflows.get('task-governance.yml') ?? '';
  for (const token of ['taskctl.mjs validate', 'taskctl.mjs preflight', 'taskctl.mjs verify']) {
    if (!governance.includes(token)) errors.push(`task-governance.yml is missing ${token}`);
  }

  const prPolicy = workflows.get('pr-policy.yml') ?? '';
  for (const token of ['taskctl.mjs pr-policy', 'ci-policy.mjs']) {
    if (!prPolicy.includes(token)) errors.push(`pr-policy.yml is missing ${token}`);
  }

  const release = workflows.get('release.yml') ?? '';
  if (!release.includes('workflow_dispatch:')) errors.push('release.yml must be manual-only');
  if (/\n\s+(?:push|pull_request|schedule):/u.test(release)) {
    errors.push('release.yml must not have automatic triggers');
  }
  if (occurrences(release, /contents:\s*write/gu) !== 1) {
    errors.push('release.yml must contain exactly one contents: write permission');
  }
  if (!release.includes('environment: release')) {
    errors.push('release.yml publish job must use the protected release environment');
  }
  const buildIndex = release.indexOf('pnpm build');
  const packageIndex = release.indexOf('pnpm package --');
  if (buildIndex < 0 || packageIndex < 0 || buildIndex > packageIndex) {
    errors.push('release.yml must build each platform before packaging');
  }

  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log(`CI policy passed for ${files.length} workflows.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
