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

console.log(`Updated ${replacements} legacy task id pattern(s) and permanent CI files.`);
