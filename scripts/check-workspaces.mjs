import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const expectedWorkspaceDirectories = [
  'apps/desktop',
  'apps/desktop/main',
  'apps/desktop/preload',
  'apps/desktop/renderer',
  'packages/contracts',
  'packages/domain',
  'packages/core-service',
  'packages/editor-core',
  'packages/prompts',
  'packages/testkit',
];

export async function inspectWorkspaces(rootDirectory = process.cwd()) {
  const packages = [];

  for (const directory of expectedWorkspaceDirectories) {
    const manifestPath = path.join(rootDirectory, directory, 'package.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    packages.push({ directory, manifest });

    if (directory === 'apps/desktop') continue;

    if (typeof manifest.exports !== 'string' || typeof manifest.scripts?.build !== 'string') {
      throw new Error(`${directory} must expose a buildable package entry`);
    }

    await stat(path.join(rootDirectory, directory, 'src', 'index.ts'));
  }

  const names = packages.map(({ manifest }) => manifest.name);
  if (new Set(names).size !== names.length) {
    throw new Error('Workspace package names must be unique');
  }

  return packages;
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const packages = await inspectWorkspaces();
  console.log(`Validated ${packages.length} workspace packages.`);
}
