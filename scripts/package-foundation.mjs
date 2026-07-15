import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expectedWorkspaceDirectories } from './check-workspaces.mjs';

const root = process.cwd();
const buildable = expectedWorkspaceDirectories.filter((directory) => directory !== 'apps/desktop');
const entries = [];

for (const directory of buildable) {
  const file = path.join(root, directory, 'dist', 'index.js');
  const content = await readFile(file);
  entries.push({
    packageDirectory: directory,
    entry: path.relative(root, file).replaceAll('\\', '/'),
    sha256: createHash('sha256').update(content).digest('hex'),
  });
}

const artifactDirectory = path.join(root, 'artifacts', 'foundation');
await mkdir(artifactDirectory, { recursive: true });
await writeFile(
  path.join(artifactDirectory, 'manifest.json'),
  `${JSON.stringify({ schemaVersion: 1, entries }, null, 2)}\n`,
  'utf8',
);

console.log(`Packaged ${entries.length} compiled foundation entries.`);
