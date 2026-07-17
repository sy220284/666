import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function main() {
  const state = JSON.parse(await readFile('docs/tasks/ACTIVE_TASK.json', 'utf8'));
  const task = state.activeTask;
  if (!task) throw new Error('ACTIVE_TASK has no active task');
  if (process.env.EVIDENCE_REQUIRED !== 'true') {
    console.log(`Final evidence is deferred for ${task.id}.`);
    return;
  }
  const directory = path.join('docs/test-evidence', task.id);
  const required = [
    'summary.md',
    'commands.txt',
    'known-risks.md',
    'manual-acceptance.md',
    'quality-matrix.md',
    'manifest.json',
    'test-results/results.json',
    'screenshots/manifest.json',
  ];
  const missing = [];
  for (const relative of required) {
    try {
      await access(path.join(directory, relative));
    } catch {
      missing.push(relative);
    }
  }
  if (missing.length > 0)
    throw new Error(`${task.id} evidence is incomplete: ${missing.join(', ')}`);
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  if (
    manifest.taskId !== task.id ||
    !Array.isArray(manifest.files) ||
    manifest.files.length === 0
  ) {
    throw new Error(`${task.id} evidence manifest is invalid`);
  }
  console.log(`Evidence gate passed for ${task.id}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
