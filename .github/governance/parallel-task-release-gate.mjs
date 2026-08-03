/* global console, process */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();

async function statusVerified(task) {
  if (task.status === 'VERIFIED') return true;
  const binding = task.verificationBinding;
  if (task.status !== 'IMPLEMENTED' || !binding?.mainCommit || !binding?.context) return false;
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) return false;
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits/${binding.mainCommit}/status`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );
  if (!response.ok) return false;
  const payload = await response.json();
  return payload.statuses?.some(
    (status) => status.context === binding.context && status.state === 'success',
  );
}

export async function validateSingleWorkRelease(repositoryRoot = root) {
  const authorization = JSON.parse(
    await readFile(path.join(repositoryRoot, 'docs/tasks/TASK_AUTHORIZATION.json'), 'utf8'),
  );
  if (
    authorization.schemaVersion !== 2 ||
    authorization.mode !== 'single-work-pr' ||
    authorization.workBranch !== 'work' ||
    authorization.mainWriteMode !== 'serialized'
  ) {
    throw new Error('Single work authorization is invalid');
  }
  const directory = path.join(repositoryRoot, authorization.taskRuntimeDirectory);
  const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();
  if (files.length === 0) throw new Error('No task runtime files were found');
  const unfinished = [];
  for (const file of files) {
    const task = JSON.parse(await readFile(path.join(directory, file), 'utf8'));
    if (task.releaseBlocking === false) continue;
    if (!(await statusVerified(task))) unfinished.push(`${task.id ?? file}:${task.status ?? 'missing'}`);
  }
  if (unfinished.length > 0) throw new Error(`Single work release gate blocked by ${unfinished.join(', ')}`);
  console.log(`Single work release gate passed for ${files.length} runtime task(s).`);
}

export const validateParallelTaskRelease = validateSingleWorkRelease;

if (process.argv[1] === fileURLToPath(import.meta.url)) await validateSingleWorkRelease();
