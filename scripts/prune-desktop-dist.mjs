import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimePolicies = Object.freeze([
  {
    directory: 'apps/desktop/preload/dist',
    allowedRuntimeFiles: new Set(['index.cjs']),
  },
  {
    directory: 'apps/desktop/renderer/dist',
    allowedRuntimeFiles: new Set(['index.js']),
  },
]);

function isRuntimeJavaScript(fileName) {
  return /\.(?:c?js)(?:\.map)?$/u.test(fileName);
}

export function desktopDistRuntimePolicy() {
  return runtimePolicies.map(({ directory, allowedRuntimeFiles }) => ({
    directory,
    allowedRuntimeFiles: [...allowedRuntimeFiles].sort(),
  }));
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function runtimeFiles(directory) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (!entry.isFile() || !isRuntimeJavaScript(entry.name)) continue;
    const parent = entry.parentPath ?? entry.path;
    files.push(path.join(parent, entry.name));
  }
  return files;
}

export async function pruneDesktopDist(rootDirectory = process.cwd()) {
  const removed = [];
  for (const policy of runtimePolicies) {
    const directory = path.join(rootDirectory, ...policy.directory.split('/'));
    if (!(await pathExists(directory))) continue;
    for (const file of await runtimeFiles(directory)) {
      const relative = path.relative(directory, file).replaceAll('\\', '/');
      if (policy.allowedRuntimeFiles.has(relative)) continue;
      await rm(file, { force: true });
      removed.push(path.relative(rootDirectory, file).replaceAll('\\', '/'));
    }
  }
  return removed.sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const removed = await pruneDesktopDist();
  console.log(`Pruned ${removed.length} desktop shadow runtime artifact(s).`);
}
