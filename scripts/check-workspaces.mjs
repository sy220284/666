import { access, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse as parseYaml } from 'yaml';

const architecturePath = path.join('.github', 'governance', 'workspace-architecture.json');

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function expandWorkspacePattern(rootDirectory, pattern) {
  if (!pattern.includes('*')) {
    return (await exists(path.join(rootDirectory, pattern, 'package.json'))) ? [pattern] : [];
  }
  if (!pattern.endsWith('/*') || pattern.slice(0, -2).includes('*')) {
    throw new Error(`Unsupported workspace pattern: ${pattern}`);
  }
  const parent = pattern.slice(0, -2);
  const entries = await readdir(path.join(rootDirectory, parent), { withFileTypes: true });
  const directories = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const relative = path.posix.join(parent.replaceAll('\\', '/'), entry.name);
    if (await exists(path.join(rootDirectory, relative, 'package.json'))) directories.push(relative);
  }
  return directories;
}

export async function discoverWorkspaceDirectories(rootDirectory = process.cwd()) {
  const workspace = parseYaml(await readFile(path.join(rootDirectory, 'pnpm-workspace.yaml'), 'utf8'));
  if (!Array.isArray(workspace?.packages) || workspace.packages.length === 0) {
    throw new Error('pnpm-workspace.yaml must declare at least one package pattern');
  }
  const directories = new Set();
  for (const pattern of workspace.packages) {
    if (typeof pattern !== 'string' || pattern.trim().length === 0) {
      throw new Error('Workspace package patterns must be non-empty strings');
    }
    for (const directory of await expandWorkspacePattern(rootDirectory, pattern)) {
      directories.add(directory.replaceAll('\\', '/'));
    }
  }
  return [...directories].sort((left, right) => left.localeCompare(right, 'en'));
}

export async function loadWorkspaceArchitecture(rootDirectory = process.cwd()) {
  const document = JSON.parse(await readFile(path.join(rootDirectory, architecturePath), 'utf8'));
  if (document.schemaVersion !== 1 || !document.workspaces || typeof document.workspaces !== 'object') {
    throw new Error('Workspace architecture must use schemaVersion 1 with a workspaces object');
  }
  return document.workspaces;
}

export async function inspectWorkspaces(rootDirectory = process.cwd()) {
  const directories = await discoverWorkspaceDirectories(rootDirectory);
  const architecture = await loadWorkspaceArchitecture(rootDirectory);
  const declared = Object.keys(architecture).sort((left, right) => left.localeCompare(right, 'en'));
  if (JSON.stringify(directories) !== JSON.stringify(declared)) {
    const missing = directories.filter((directory) => !declared.includes(directory));
    const stale = declared.filter((directory) => !directories.includes(directory));
    throw new Error(
      [
        'Workspace architecture registry is out of sync',
        missing.length ? `missing: ${missing.join(', ')}` : null,
        stale.length ? `stale: ${stale.join(', ')}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  const packages = [];
  for (const directory of directories) {
    const manifestPath = path.join(rootDirectory, directory, 'package.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const policy = architecture[directory];
    if (manifest.name !== policy.packageName) {
      throw new Error(`${directory} package name must match workspace architecture`);
    }
    if (typeof policy.layer !== 'string' || policy.layer.length === 0) {
      throw new Error(`${directory} must declare an architecture layer`);
    }
    if (!Array.isArray(policy.allowedInternalImports)) {
      throw new Error(`${directory} must declare allowedInternalImports`);
    }
    if (policy.buildable) {
      if (typeof manifest.exports !== 'string' || typeof manifest.scripts?.build !== 'string') {
        throw new Error(`${directory} must expose a buildable package entry`);
      }
      await stat(path.join(rootDirectory, directory, 'src', 'index.ts'));
    }
    packages.push({ directory, manifest, policy });
  }

  const names = packages.map(({ manifest }) => manifest.name);
  if (new Set(names).size !== names.length) throw new Error('Workspace package names must be unique');
  return packages;
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const packages = await inspectWorkspaces();
  console.log(`Validated ${packages.length} auto-discovered workspace packages.`);
}
