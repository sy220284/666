import { execFileSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const requiredFiles = [
  'summary.md',
  'commands.txt',
  'known-risks.md',
  'manual-acceptance.md',
  'quality-matrix.md',
  'manifest.json',
  'test-results/results.json',
  'screenshots/manifest.json',
];

function changedFiles(baseSha) {
  if (!baseSha) throw new Error('EVIDENCE_BASE_SHA is required');
  const allZero = /^0+$/u.test(baseSha);
  const argumentsList = allZero
    ? ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', 'HEAD']
    : ['diff', '--name-only', baseSha, 'HEAD'];
  const output = execFileSync('git', argumentsList, { cwd: root, encoding: 'utf8' });
  return output.split(/\r?\n/u).filter(Boolean);
}

function changedEvidenceTasks(files) {
  const tasks = new Set();
  for (const file of files) {
    const match = /^docs\/test-evidence\/(M\d-\d{2})\//u.exec(file.replaceAll('\\', '/'));
    if (match?.[1]) tasks.add(match[1]);
  }
  return [...tasks].sort();
}

async function validateTaskEvidence(taskId) {
  const directory = path.join(root, 'docs/test-evidence', taskId);
  const missing = [];
  for (const relative of requiredFiles) {
    try {
      await access(path.join(directory, relative));
    } catch {
      missing.push(relative);
    }
  }
  if (missing.length > 0) {
    throw new Error(`${taskId} evidence is incomplete: ${missing.join(', ')}`);
  }

  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.taskId !== taskId || !Array.isArray(manifest.files)) {
    throw new Error(`${taskId} evidence manifest is invalid`);
  }
  if (manifest.files.length === 0) throw new Error(`${taskId} evidence manifest is empty`);
  const manifestPaths = new Set(manifest.files.map((entry) => entry?.path).filter(Boolean));
  for (const required of [
    'summary.md',
    'commands.txt',
    'known-risks.md',
    'manual-acceptance.md',
    'quality-matrix.md',
    'test-results/results.json',
  ]) {
    if (!manifestPaths.has(required)) {
      throw new Error(`${taskId} evidence manifest does not list ${required}`);
    }
  }
  console.log(`Evidence gate passed for ${taskId}.`);
}

async function main() {
  const files = changedFiles(process.env.EVIDENCE_BASE_SHA);
  const taskIds = changedEvidenceTasks(files);
  if (taskIds.length === 0) {
    const state = JSON.parse(await readFile('docs/tasks/ACTIVE_TASK.json', 'utf8'));
    console.log(`Final evidence is deferred for ${state.activeTask?.id ?? '<no-active-task>'}.`);
    return;
  }
  for (const taskId of taskIds) await validateTaskEvidence(taskId);
  console.log(`Validated ${taskIds.length} changed evidence package(s).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
