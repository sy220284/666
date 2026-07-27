import { readFile, writeFile } from 'node:fs/promises';

const taskIdFiles = [
  '.github/governance/deferred-task-closure.mjs',
  '.github/governance/task-transition-policy-core.mjs',
  '.github/governance/verification-hold-taskctl.mjs',
  'scripts/audit-remediation-policy.mjs',
  'scripts/evidence-policy.mjs',
  'scripts/task-control-lib.mjs',
  'scripts/verified-evidence-scan.mjs',
];

let replacements = 0;
for (const file of taskIdFiles) {
  const source = await readFile(file, 'utf8');
  let updated = source;
  for (const [before, after] of [
    ['M\\d-\\d{2}', 'M\\d+-\\d{2}'],
    ['m\\d-\\d{2}', 'm\\d+-\\d{2}'],
    ['M[0-9]-[0-9]{2}', 'M[0-9]+-[0-9]{2}'],
    ['m[0-9]-[0-9]{2}', 'm[0-9]+-[0-9]{2}'],
  ]) {
    const occurrences = updated.split(before).length - 1;
    if (occurrences > 0) {
      updated = updated.replaceAll(before, after);
      replacements += occurrences;
    }
  }
  if (updated !== source) await writeFile(file, updated, 'utf8');
}
if (replacements === 0) throw new Error('No legacy single-digit task id patterns were found');

const ciPolicyPath = 'scripts/ci-policy.mjs';
let ciPolicy = await readFile(ciPolicyPath, 'utf8');
for (const [marker, addition] of [
  [
    "  '.github/governance/required-checks.json',\n",
    "  '.github/governance/required-checks.json',\n  '.github/governance/secret-scan-allowlist.json',\n  '.github/governance/workspace-architecture.json',\n",
  ],
  [
    "  'scripts/scan-secrets.mjs',\n",
    "  'scripts/scan-secrets.mjs',\n  'scripts/workflow-structure-policy.mjs',\n",
  ],
]) {
  if (!ciPolicy.includes(addition.trim())) {
    if (!ciPolicy.includes(marker)) throw new Error(`CI policy marker missing: ${marker.trim()}`);
    ciPolicy = ciPolicy.replace(marker, addition);
  }
}
const oldPerformanceMessage = 'changed paths are not performance-sensitive';
const newPerformanceMessage = 'only documentation changed';
if (ciPolicy.includes(oldPerformanceMessage)) {
  ciPolicy = ciPolicy.replace(oldPerformanceMessage, newPerformanceMessage);
}
if (!ciPolicy.includes(newPerformanceMessage)) {
  throw new Error('CI policy performance route message was not synchronized');
}
await writeFile(ciPolicyPath, ciPolicy, 'utf8');

const rendererPath = 'apps/desktop/renderer/build-assets.mjs';
let renderer = await readFile(rendererPath, 'utf8');
renderer = renderer.replace(
  "import { fileURLToPath } from 'node:url';",
  "import { URL, fileURLToPath } from 'node:url';",
);
if (!renderer.includes("import { URL, fileURLToPath } from 'node:url';")) {
  throw new Error('Renderer URL import was not hardened');
}
await writeFile(rendererPath, renderer, 'utf8');

const transactionPath = 'scripts/atomic-file-transaction.mjs';
let transaction = await readFile(transactionPath, 'utf8');
const oldTransactionRethrow = "\n    throw error;\n  }\n\n  journal.status = 'committed';";
const newTransactionRethrow =
  "\n    throw new Error(error instanceof Error ? error.message : 'Atomic file transaction failed', { cause: error });\n  }\n\n  journal.status = 'committed';";
if (!transaction.includes(oldTransactionRethrow)) {
  throw new Error('Atomic transaction rethrow baseline was not found');
}
transaction = transaction.replace(oldTransactionRethrow, newTransactionRethrow);
if (transaction.includes(oldTransactionRethrow) || !transaction.includes('{ cause: error }')) {
  throw new Error('Atomic transaction error cause was not preserved');
}
await writeFile(transactionPath, transaction, 'utf8');

const taskctlPath = 'scripts/taskctl.mjs';
let taskctl = await readFile(taskctlPath, 'utf8');
taskctl = taskctl.replaceAll('structuredClone(', 'globalThis.structuredClone(');
if (!taskctl.includes('globalThis.structuredClone(')) {
  throw new Error('Task controller structuredClone usage was not hardened');
}
await writeFile(taskctlPath, taskctl, 'utf8');

console.log(`Updated ${replacements} legacy task id pattern(s) and permanent CI files.`);
