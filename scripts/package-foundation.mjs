import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { inspectWorkspaces } from './check-workspaces.mjs';

function workspaceExportPath(directory, manifest) {
  const entry = manifest.exports;
  if (typeof entry !== 'string' || !entry.startsWith('./')) {
    throw new Error(`${directory} must expose a relative string package export`);
  }
  const normalized = path.posix.normalize(entry.slice(2));
  if (
    normalized.length === 0 ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    path.posix.isAbsolute(normalized)
  ) {
    throw new Error(`${directory} package export must stay inside the workspace`);
  }
  return normalized;
}

// Foundation smoke follows each buildable workspace's declared runtime export instead of
// assuming every package is an ESM dist/index.js package. This is important for preload,
// whose real Electron runtime entry is dist/index.cjs.
export async function foundationWorkspaceEntries(rootDirectory = process.cwd()) {
  const workspaces = await inspectWorkspaces(rootDirectory);
  return workspaces
    .filter(({ policy }) => policy.buildable)
    .map(({ directory, manifest }) => ({
      directory,
      exportPath: workspaceExportPath(directory, manifest),
    }))
    .sort((left, right) => left.directory.localeCompare(right.directory, 'en'));
}

export async function foundationWorkspaceDirectories(rootDirectory = process.cwd()) {
  return (await foundationWorkspaceEntries(rootDirectory)).map(({ directory }) => directory);
}

export async function packageFoundation(rootDirectory = process.cwd()) {
  const buildable = await foundationWorkspaceEntries(rootDirectory);
  const entries = [];

  for (const { directory, exportPath } of buildable) {
    const file = path.join(rootDirectory, directory, ...exportPath.split('/'));
    const content = await readFile(file);
    entries.push({
      packageDirectory: directory,
      entry: path.relative(rootDirectory, file).replaceAll('\\', '/'),
      sha256: createHash('sha256').update(content).digest('hex'),
    });
  }

  const artifactDirectory = path.join(rootDirectory, 'artifacts', 'foundation');
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(
    path.join(artifactDirectory, 'manifest.json'),
    `${JSON.stringify({ schemaVersion: 1, entries }, null, 2)}\n`,
    'utf8',
  );
  return entries;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const entries = await packageFoundation();
  console.log(`Packaged ${entries.length} compiled foundation entries.`);
}
