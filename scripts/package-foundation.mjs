import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { inspectWorkspaces } from './check-workspaces.mjs';

// M10-02全量审计将Foundation打包入口纳入三平台Package Smoke验证。
export async function foundationWorkspaceDirectories(rootDirectory = process.cwd()) {
  const workspaces = await inspectWorkspaces(rootDirectory);
  return workspaces
    .filter(({ policy }) => policy.buildable)
    .map(({ directory }) => directory)
    .sort((left, right) => left.localeCompare(right, 'en'));
}

export async function packageFoundation(rootDirectory = process.cwd()) {
  const buildable = await foundationWorkspaceDirectories(rootDirectory);
  const entries = [];

  for (const directory of buildable) {
    const file = path.join(rootDirectory, directory, 'dist', 'index.js');
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
