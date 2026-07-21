import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requestPath = path.join(root, '.github/dependency-lock-request.json');
const activeTaskPath = path.join(root, 'docs/tasks/ACTIVE_TASK.json');
const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const workspacePath = /^[A-Za-z0-9._/-]+$/u;

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function validateVersions(value, label) {
  const record = assertRecord(value, label);
  const names = Object.keys(record).sort();
  if (names.length === 0 || names.length > 20) throw new Error(`${label} must contain 1-20 entries.`);
  for (const name of names) {
    if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(name)) {
      throw new Error(`${label}.${name} is not a valid package name.`);
    }
    if (typeof record[name] !== 'string' || !exactVersion.test(record[name])) {
      throw new Error(`${label}.${name} must use an exact semver version.`);
    }
  }
  return record;
}

async function main() {
  const command = process.argv[2];
  if (command !== 'validate') throw new Error('Usage: dependency-lock-request.mjs validate');
  const request = assertRecord(JSON.parse(await readFile(requestPath, 'utf8')), 'request');
  const active = assertRecord(JSON.parse(await readFile(activeTaskPath, 'utf8')), 'active task');
  if (request.schemaVersion !== 1) throw new Error('Unsupported dependency lock request schema.');
  if (request.taskId !== active.activeTask?.id) throw new Error('Request taskId must match the active task.');
  if (process.env.GITHUB_REF_NAME !== active.activeTask?.branch) {
    throw new Error('Dependency lock sync may only run on the active task branch.');
  }
  if (typeof request.workspace !== 'string' || !workspacePath.test(request.workspace)) {
    throw new Error('workspace must be a repository-relative package directory.');
  }
  const packagePath = path.join(root, request.workspace, 'package.json');
  if (!packagePath.startsWith(`${root}${path.sep}`)) throw new Error('workspace escaped repository root.');
  const packageJson = assertRecord(JSON.parse(await readFile(packagePath, 'utf8')), 'package.json');
  const expectedDependencies = validateVersions(request.expectedDependencies, 'expectedDependencies');
  const expectedDevDependencies = validateVersions(
    request.expectedDevDependencies,
    'expectedDevDependencies',
  );
  for (const [name, version] of Object.entries(expectedDependencies)) {
    if (packageJson.dependencies?.[name] !== version) {
      throw new Error(`package.json dependency mismatch for ${name}.`);
    }
  }
  for (const [name, version] of Object.entries(expectedDevDependencies)) {
    if (packageJson.devDependencies?.[name] !== version) {
      throw new Error(`package.json devDependency mismatch for ${name}.`);
    }
  }
  const allowedPaths = active.activeTask?.allowedPaths ?? [];
  if (!allowedPaths.includes('pnpm-lock.yaml')) throw new Error('Active task does not allow pnpm-lock.yaml.');
  if (!allowedPaths.some((entry) => request.workspace.startsWith(entry.replace(/\/$/u, '')))) {
    throw new Error('Active task does not allow the requested workspace.');
  }
  console.log(`Dependency lock request validated for ${request.taskId} / ${request.workspace}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
