/* global console, process */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();

export async function validateParallelTaskRelease(repositoryRoot = root) {
  const authorization = JSON.parse(
    await readFile(path.join(repositoryRoot, 'docs/tasks/TASK_AUTHORIZATION.json'), 'utf8'),
  );
  if (
    authorization.schemaVersion !== 1 ||
    authorization.mode !== 'parallel-pr' ||
    authorization.mainWriteMode !== 'serialized'
  ) {
    throw new Error('Parallel task authorization is invalid');
  }
  const directory = path.join(repositoryRoot, authorization.taskRuntimeDirectory);
  const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();
  if (files.length === 0) throw new Error('No task runtime files were found');
  const unfinished = [];
  for (const file of files) {
    const task = JSON.parse(await readFile(path.join(directory, file), 'utf8'));
    if (task.releaseBlocking === false) continue;
    if (task.status !== 'VERIFIED') unfinished.push(`${task.id ?? file}:${task.status ?? 'missing'}`);
  }
  if (unfinished.length > 0) {
    throw new Error(`Parallel task release gate blocked by ${unfinished.join(', ')}`);
  }
  console.log(`Parallel task release gate passed for ${files.length} runtime task(s).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await validateParallelTaskRelease();
