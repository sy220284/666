import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isRuntimeEffectivelyVerified,
  loadCommitStatuses,
} from '../.github/governance/effective-task-status.mjs';
import { parseTaskIndex } from './task-control-lib.mjs';

const root = process.cwd();
const checksumFileName = 'SHA256SUMS.txt';

export function parseReleaseVersion(value) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new Error('Release version must be a non-empty SemVer value without surrounding spaces');
  }
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(
      value,
    );
  if (!match) throw new Error('Release version must use SemVer without a leading v');

  const prerelease = match[4];
  if (
    prerelease
      ?.split('.')
      .some(
        (identifier) => /^\d+$/.test(identifier) && identifier.length > 1 && identifier[0] === '0',
      )
  ) {
    throw new Error('Numeric prerelease identifiers must not contain leading zeroes');
  }
  return value;
}

function parseIndependentTaskIndex(markdown) {
  const [independentSection = ''] = markdown.split(/^## 3\. 被吸收的需求来源\s*$/mu, 1);
  return parseTaskIndex(independentSection);
}

export function validateReleaseConfiguration({
  packageJson,
  taskIndexMarkdown,
  authorization,
  workflowSource,
}) {
  const errors = [];
  try {
    parseReleaseVersion(packageJson.version);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const expectedScripts = {
    package: 'node scripts/package-desktop.mjs',
    'package:foundation': 'node scripts/package-foundation.mjs',
    'release:check': 'node scripts/release-tool.mjs check',
    'release:gate': 'node scripts/release-tool.mjs gate',
    'release:checksums': 'node scripts/release-tool.mjs checksums',
  };
  for (const [name, expected] of Object.entries(expectedScripts)) {
    if (packageJson.scripts?.[name] !== expected) {
      errors.push('package.json must define ' + name + ' as "' + expected + '"');
    }
  }

  if (parseIndependentTaskIndex(taskIndexMarkdown).size === 0) {
    errors.push('TASK_INDEX must contain at least one independent task');
  }
  if (
    authorization?.schemaVersion !== 2 ||
    authorization?.mode !== 'single-work-pr' ||
    authorization?.baseBranch !== 'main' ||
    authorization?.workBranch !== 'work' ||
    authorization?.mainWriteMode !== 'serialized' ||
    authorization?.verificationClosure !== 'main-status' ||
    typeof authorization?.taskRuntimeDirectory !== 'string'
  ) {
    errors.push('TASK_AUTHORIZATION must define the complete Schema 2 release model');
  }
  for (const token of [
    'workflow_dispatch:',
    'fetch-depth: 0',
    'package_smoke: false',
    'pnpm audit --audit-level=high',
    'node scripts/scan-secrets.mjs',
    'pnpm release:gate',
    'gh release create',
  ]) {
    if (!workflowSource.includes(token)) errors.push('Release workflow is missing: ' + token);
  }
  return errors;
}

export function evaluateReleaseGate({
  taskIndexMarkdown,
  runtimes,
  statuses = [],
  packageVersion,
  requestedVersion,
  refName,
}) {
  const errors = [];
  let version = null;
  try {
    version = parseReleaseVersion(requestedVersion);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  try {
    parseReleaseVersion(packageVersion);
  } catch {
    errors.push('package.json version is not valid SemVer');
  }
  if (version && packageVersion !== version) {
    errors.push(
      'Requested version ' + version + ' does not match package.json version ' + packageVersion,
    );
  }
  if (refName && refName !== 'main') {
    errors.push('Releases may only run from main, found ' + refName);
  }

  const tasks = [...parseIndependentTaskIndex(taskIndexMarkdown).values()];
  if (tasks.length === 0) errors.push('TASK_INDEX contains no independent tasks');

  const runtimeById = new Map(
    (Array.isArray(runtimes) ? runtimes : [])
      .filter((runtime) => typeof runtime?.id === 'string')
      .map((runtime) => [runtime.id, runtime]),
  );
  const indexedIds = new Set(tasks.map((task) => task.id));
  const unindexedRuntimes = [...runtimeById.values()]
    .filter((runtime) => runtime.releaseBlocking !== false && !indexedIds.has(runtime.id))
    .map((runtime) => runtime.id)
    .sort();
  if (unindexedRuntimes.length > 0) {
    errors.push('Release-blocking runtimes are absent from TASK_INDEX: ' + unindexedRuntimes.join(', '));
  }

  const unfinished = [];
  for (const task of tasks) {
    const runtime = runtimeById.get(task.id);
    if (runtime?.releaseBlocking === false) continue;
    const verified = runtime
      ? isRuntimeEffectivelyVerified(runtime, statuses)
      : task.status === 'Verified';
    if (!verified) unfinished.push(`${task.id} ${runtime?.status ?? task.status}`);
  }
  if (unfinished.length > 0) {
    errors.push('All independent tasks must be effectively Verified before publishing: ' + unfinished.join(', '));
  }

  const latest = tasks.at(-1);
  const latestRuntime = latest ? runtimeById.get(latest.id) : undefined;
  return {
    version,
    taskId: latest?.id ?? null,
    taskStatus: latestRuntime
      ? isRuntimeEffectivelyVerified(latestRuntime, statuses)
        ? 'VERIFIED'
        : latestRuntime.status
      : latest?.status ?? null,
    errors,
  };
}

function toPosix(filePath) {
  return filePath.replaceAll('\\', '/');
}

export async function collectReleaseAssets(assetDirectory, excludedPaths = []) {
  const base = path.resolve(assetDirectory);
  const excluded = new Set(excludedPaths.map(toPosix));
  const assets = [];

  async function visit(relativeDirectory) {
    const directory = path.join(base, relativeDirectory);
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));

    for (const entry of entries) {
      const relativePath = path.join(relativeDirectory, entry.name);
      const normalizedPath = toPosix(relativePath);
      if (excluded.has(normalizedPath)) continue;
      if (entry.isSymbolicLink()) {
        throw new Error('Release assets may not contain symbolic links: ' + normalizedPath);
      }
      if (entry.isDirectory()) {
        await visit(relativePath);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error('Unsupported release asset: ' + normalizedPath);
      }

      const content = await readFile(path.join(base, relativePath));
      assets.push({
        path: normalizedPath,
        bytes: content.byteLength,
        sha256: createHash('sha256').update(content).digest('hex'),
      });
    }
  }

  await visit('');
  return assets;
}

export function renderChecksums(assets) {
  return assets.map((asset) => asset.sha256 + '  ' + asset.path).join('\n') + '\n';
}

function readOption(name, fallback) {
  const prefix = name + '=';
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index >= 0) {
    const value = process.argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(name + ' requires a value');
    return value;
  }
  return fallback;
}

function git(argumentsList) {
  return execFileSync('git', argumentsList, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function currentHead() {
  return git(['rev-parse', 'HEAD']);
}

async function loadRuntimes(directory) {
  const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();
  return Promise.all(
    files.map((file) => readFile(path.join(directory, file), 'utf8').then(JSON.parse)),
  );
}

async function loadReleaseState() {
  const [packageSource, taskIndexMarkdown, authorizationSource, workflowSource] = await Promise.all([
    readFile(path.join(root, 'package.json'), 'utf8'),
    readFile(path.join(root, 'docs/tasks/TASK_INDEX.md'), 'utf8'),
    readFile(path.join(root, 'docs/tasks/TASK_AUTHORIZATION.json'), 'utf8'),
    readFile(path.join(root, '.github/workflows/release.yml'), 'utf8'),
  ]);
  const authorization = JSON.parse(authorizationSource);
  const runtimes = await loadRuntimes(path.join(root, authorization.taskRuntimeDirectory));
  return {
    packageJson: JSON.parse(packageSource),
    taskIndexMarkdown,
    authorization,
    runtimes,
    workflowSource,
  };
}

async function evaluateCurrentReleaseState(state, requestedVersion, refName) {
  const statuses = await loadCommitStatuses(currentHead());
  return evaluateReleaseGate({
    taskIndexMarkdown: state.taskIndexMarkdown,
    runtimes: state.runtimes,
    statuses,
    packageVersion: state.packageJson.version,
    requestedVersion,
    refName,
  });
}

async function checkConfiguration() {
  const state = await loadReleaseState();
  const errors = validateReleaseConfiguration(state);
  if (errors.length > 0) throw new Error(errors.join('\n'));

  const result = await evaluateCurrentReleaseState(state, state.packageJson.version, 'main');
  const gateStatus =
    result.errors.length === 0
      ? `READY (${result.taskId})`
      : `BLOCKED (${result.errors.join('; ')})`;
  console.log('Release tooling is configured. Publishing gate: ' + gateStatus + '.');
}

async function requireReleaseGate(requestedVersion) {
  const state = await loadReleaseState();
  const configurationErrors = validateReleaseConfiguration(state);
  if (configurationErrors.length > 0) throw new Error(configurationErrors.join('\n'));

  const result = await evaluateCurrentReleaseState(
    state,
    requestedVersion,
    process.env.GITHUB_REF_NAME,
  );
  if (result.errors.length > 0) throw new Error(result.errors.join('\n'));
  console.log(`Release gate passed for v${result.version} through ${result.taskId}.`);
  return result.version;
}

async function writeChecksums(requestedVersion) {
  const version = await requireReleaseGate(requestedVersion);
  const assetDirectory = path.resolve(root, readOption('--assets', 'release'));
  const outputPath = path.resolve(
    root,
    readOption('--output', path.join(path.relative(root, assetDirectory), checksumFileName)),
  );
  const relativeOutput = path.relative(assetDirectory, outputPath);
  if (
    relativeOutput === '' ||
    relativeOutput === '..' ||
    relativeOutput.startsWith('..' + path.sep) ||
    path.isAbsolute(relativeOutput)
  ) {
    throw new Error('Checksum output must be located inside the release asset directory');
  }

  const assets = await collectReleaseAssets(assetDirectory, [toPosix(relativeOutput)]);
  if (assets.length === 0) throw new Error('No release assets were found');
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderChecksums(assets), 'utf8');
  console.log('Wrote checksums for ' + assets.length + ' assets in WorldForge v' + version + '.');
}

async function main() {
  const command = process.argv[2] ?? 'check';
  if (command === 'check') return checkConfiguration();
  if (command === 'gate') {
    const version = readOption('--version');
    if (!version) throw new Error('gate requires --version');
    await requireReleaseGate(version);
    return;
  }
  if (command === 'checksums') {
    const version = readOption('--version');
    if (!version) throw new Error('checksums requires --version');
    await writeChecksums(version);
    return;
  }
  throw new Error('Unknown release-tool command: ' + command);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
