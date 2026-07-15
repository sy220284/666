import { execFileSync } from 'node:child_process';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseTaskIndex,
  renderActiveTask,
  validateActiveState,
  validateChangedPaths,
} from './task-control-lib.mjs';

const root = process.cwd();
const statePath = path.join(root, 'docs/tasks/ACTIVE_TASK.json');
const mirrorPath = path.join(root, 'docs/tasks/ACTIVE_TASK.md');
const indexPath = path.join(root, 'docs/tasks/TASK_INDEX.md');

async function load() {
  const [stateSource, indexSource] = await Promise.all([
    readFile(statePath, 'utf8'),
    readFile(indexPath, 'utf8'),
  ]);
  return { state: JSON.parse(stateSource), taskIndex: parseTaskIndex(indexSource) };
}

async function validate() {
  const { state, taskIndex } = await load();
  const errors = validateActiveState(state, taskIndex);
  const required = [state.activeTask.source, ...state.activeTask.requiredDocs];
  for (const file of required) {
    try {
      await access(path.join(root, file));
    } catch {
      errors.push(`Required file is missing: ${file}`);
    }
  }
  if (errors.length > 0) throw new Error(errors.join('\n'));
  return state;
}

function changedFiles() {
  const base = process.env.TASK_BASE_REF ?? 'HEAD^';
  const output = execFileSync('git', ['diff', '--name-only', base, 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  });
  return output.split(/\r?\n/).filter(Boolean);
}

async function preflight() {
  const state = await validate();
  const violations = validateChangedPaths(
    changedFiles(),
    state.activeTask.allowedPaths,
    state.activeTask.forbiddenPaths,
  );
  if (violations.length > 0) throw new Error(violations.join('\n'));
  console.log(`Preflight passed for ${state.activeTask.id}.`);
}

async function verify() {
  const state = await validate();
  const evidence = path.join(root, 'docs/test-evidence', state.activeTask.id);
  for (const file of ['summary.md', 'commands.txt', 'known-risks.md']) {
    await access(path.join(evidence, file));
  }
  console.log(`Evidence structure exists for ${state.activeTask.id}.`);
}

async function sync() {
  const { state } = await load();
  await writeFile(mirrorPath, renderActiveTask(state), 'utf8');
  console.log('ACTIVE_TASK.md synchronized from ACTIVE_TASK.json.');
}

async function main() {
  const command = process.argv[2] ?? 'status';
  if (command === 'status') {
    const { state } = await load();
    console.log(JSON.stringify(state, null, 2));
    return;
  }
  if (command === 'validate') {
    const state = await validate();
    console.log(`Task control is valid: ${state.activeTask.id} ${state.activeTask.status}.`);
    return;
  }
  if (command === 'preflight') return preflight();
  if (command === 'verify') return verify();
  if (command === 'sync') return sync();
  throw new Error(`Unknown taskctl command: ${command}`);
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  await main();
}
