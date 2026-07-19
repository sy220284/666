/* global console, process */
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const branch = 'work/m1-08-recovery-readonly-foundation';
const expectedHead = process.env.EXPECTED_BRANCH_HEAD;
const outputDir = process.env.PLAN_OUTPUT_DIR;

if (!expectedHead || !outputDir) {
  throw new Error('EXPECTED_BRANCH_HEAD and PLAN_OUTPUT_DIR are required');
}

const git = (args, options = {}) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  }).trim();

const snapshotHead = git(['rev-parse', 'HEAD']);
if (snapshotHead !== expectedHead) {
  throw new Error(`Checked out head ${snapshotHead} differs from expected ${expectedHead}`);
}

await mkdir(outputDir, { recursive: true });
git(['fetch', 'origin', 'main']);
git(['branch', '-f', 'closeout-snapshot', snapshotHead]);
git(['reset', '--hard', 'origin/main']);

const snapshotPaths = [
  'docs/tasks/ACTIVE_TASK.json',
  'docs/tasks/M1/M1-08_RECOVERY_READONLY_FOUNDATION.md',
  'docs/tasks/M2/M2-01_LOCK_GUARD.md',
  'docs/tasks/M2/M2-02_CANDIDATE_VERSION_MODEL.md',
  'docs/tasks/M2/M2-03_DIFF_APPLY_CONFLICT_UNDO.md',
  'docs/tasks/M2/M2-04_TRASH_STRUCTURE_RECOVERY.md',
  'docs/tasks/M3/M3-03_ENTITY_CANON.md',
  'docs/test-evidence/M0-05',
  'docs/test-evidence/M1-08',
  'docs/test-evidence/M2-01',
  'docs/test-evidence/M2-02',
  'docs/test-evidence/M2-03',
  'docs/test-evidence/M2-04',
];
git(['checkout', 'closeout-snapshot', '--', ...snapshotPaths]);

const indexPath = 'docs/tasks/TASK_INDEX.md';
let index = await readFile(indexPath, 'utf8');
const statuses = new Map([
  ['M1-08', 'Verified'],
  ['M2-01', 'Verified'],
  ['M2-02', 'Verified'],
  ['M2-03', 'Verified'],
  ['M2-04', 'Verified'],
  ['M3-03', 'In Progress'],
]);
for (const [id, status] of statuses) {
  const row = new RegExp(`^(\\|\\s*${id}\\s*\\|[^\\n]*\\|\\s*)([^|]+?)(\\s*\\|\\s*)$`, 'mu');
  if (!row.test(index)) throw new Error(`Missing task index row: ${id}`);
  index = index.replace(row, `$1${status}$3`);
}
await writeFile(indexPath, index, 'utf8');

const tracePath = 'docs/product/V1.0_TRACEABILITY_MATRIX.md';
let trace = await readFile(tracePath, 'utf8');
for (const id of ['REQ-010', 'REQ-011', 'REQ-012']) {
  const row = new RegExp(`^(\\|\\s*${id}\\s*\\|[^\\n]*\\|\\s*)Implemented(\\s*\\|\\s*)$`, 'mu');
  if (!row.test(trace)) throw new Error(`Missing implemented trace row: ${id}`);
  trace = trace.replace(row, '$1Verified$2');
}
const branchTrace = git(['show', 'closeout-snapshot:docs/product/V1.0_TRACEABILITY_MATRIX.md']);
const branchOffset = branchTrace.indexOf('## M2延期验收闭环');
const mainOffset = trace.indexOf('## M2-01实现证据');
if (branchOffset < 0 || mainOffset < 0) {
  throw new Error('Traceability closeout sections are incomplete');
}
trace = `${trace.slice(0, mainOffset).trimEnd()}\n\n${branchTrace.slice(branchOffset).trim()}\n`;
await writeFile(tracePath, trace, 'utf8');

git(['add', '-A']);
execFileSync('node', ['scripts/taskctl.mjs', 'sync'], { stdio: 'inherit' });
execFileSync('node', ['scripts/taskctl.mjs', 'validate'], { stdio: 'inherit' });
const { validateTaskEvidence } = await import('../../scripts/evidence-policy.mjs');
for (const id of ['M0-05', 'M1-08', 'M2-01', 'M2-02', 'M2-03', 'M2-04']) {
  await validateTaskEvidence(id, process.cwd(), { final: true });
}

try {
  git(['rm', '-f', '--ignore-unmatch', '.github/workflows/tmp-refresh-closeout-branch.yml']);
} catch {
  // The temporary workflow may already be absent from the snapshot.
}
try {
  git(['rm', '-f', '--ignore-unmatch', 'docs/tasks/CLOSEOUT_REFRESH_REQUEST.md']);
} catch {
  // The request marker may already be absent when reproducing a reviewed plan.
}
await writeFile(
  'docs/tasks/CLOSEOUT_REBASE_READY.md',
  '# Closeout branch refresh marker\n\nThe reviewed closeout snapshot has been rebuilt on the current main tree and validated.\nRemove this marker with an authenticated repository commit to trigger final PR checks.\n',
  'utf8',
);
git(['add', '-A']);

const changedPaths = git(['diff', '--cached', '--name-only', '-z'])
  .split('\0')
  .filter(Boolean);
const allowedExact = new Set([
  'docs/product/V1.0_TRACEABILITY_MATRIX.md',
  'docs/tasks/ACTIVE_TASK.json',
  'docs/tasks/ACTIVE_TASK.md',
  'docs/tasks/CLOSEOUT_REBASE_READY.md',
  'docs/tasks/CLOSEOUT_REFRESH_REQUEST.md',
  'docs/tasks/TASK_INDEX.md',
  'docs/tasks/M1/M1-08_RECOVERY_READONLY_FOUNDATION.md',
  'docs/tasks/M2/M2-01_LOCK_GUARD.md',
  'docs/tasks/M2/M2-02_CANDIDATE_VERSION_MODEL.md',
  'docs/tasks/M2/M2-03_DIFF_APPLY_CONFLICT_UNDO.md',
  'docs/tasks/M2/M2-04_TRASH_STRUCTURE_RECOVERY.md',
  'docs/tasks/M3/M3-03_ENTITY_CANON.md',
  '.github/workflows/tmp-refresh-closeout-branch.yml',
]);
const allowedPrefixes = [
  'docs/test-evidence/M0-05/',
  'docs/test-evidence/M1-08/',
  'docs/test-evidence/M2-01/',
  'docs/test-evidence/M2-02/',
  'docs/test-evidence/M2-03/',
  'docs/test-evidence/M2-04/',
];
const unexpected = changedPaths.filter(
  (file) => !allowedExact.has(file) && !allowedPrefixes.some((prefix) => file.startsWith(prefix)),
);
if (unexpected.length > 0) {
  throw new Error(`Unexpected refresh-plan paths:\n${unexpected.join('\n')}`);
}

const entries = [];
for (const file of changedPaths) {
  const status = git(['diff', '--cached', '--name-status', '--', file]).split(/\s+/u)[0];
  if (status === 'D') {
    entries.push({ path: file, mode: '100644', type: 'blob', sha: null });
    continue;
  }
  const stage = git(['ls-files', '-s', '--', file]).split(/\s+/u);
  const mode = stage[0] ?? '100644';
  const blobSha = stage[1];
  if (!blobSha) throw new Error(`Missing staged blob for ${file}`);
  if (/\.(?:png|jpg|jpeg|webp)$/iu.test(file)) {
    entries.push({ path: file, mode, type: 'blob', sha: blobSha });
  } else {
    entries.push({ path: file, mode, type: 'blob', content: await readFile(file, 'utf8') });
  }
}

const plan = {
  schemaVersion: 1,
  repository: process.env.GITHUB_REPOSITORY,
  branch,
  expectedBranchHead: expectedHead,
  baseMainSha: git(['rev-parse', 'origin/main']),
  baseTreeSha: git(['rev-parse', 'origin/main^{tree}']),
  desiredTreeSha: git(['write-tree']),
  changedPathCount: changedPaths.length,
  changedPaths,
  entries,
};
await writeFile(path.join(outputDir, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
console.log(`Validated closeout refresh plan with ${changedPaths.length} paths.`);
