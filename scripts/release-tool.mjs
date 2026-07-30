import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseTaskIndex } from './task-control-lib.mjs';

const root = process.cwd();
const checksumFileName = 'SHA256SUMS.txt';
export const RELEASE_HOLD_STATUS = 'VERIFIED_HOLD';

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

export function validateReleaseConfiguration({
  packageJson,
  taskIndexMarkdown,
  activeTaskState,
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

  if (parseTaskIndex(taskIndexMarkdown).size === 0) {
    errors.push('TASK_INDEX must contain at least one independent task');
  }
  if (!activeTaskState || activeTaskState.schemaVersion !== 1) {
    errors.push('ACTIVE_TASK must use schemaVersion 1');
  }
  for (const token of [
    'workflow_dispatch:',
    'fetch-depth: 0',
    'package_smoke: true',
    'pnpm audit --audit-level=high',
    'node scripts/scan-secrets.mjs',
    'pnpm release:gate',
    'gh release create',
  ]) {
    if (!workflowSource.includes(token)) errors.push('Release workflow is missing: ' + token);
  }
  return errors;
}

function taskSetDifference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

function validCommitReference(value) {
  return typeof value === 'string' && /^[0-9a-f]{7,40}$/iu.test(value);
}

export function evaluateReleaseGate({
  taskIndexMarkdown,
  activeTaskState,
  packageVersion,
  requestedVersion,
  refName,
  verifiedCommitReachable = true,
  evidenceHeadReachable = true,
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

  const tasks = [...parseTaskIndex(taskIndexMarkdown).values()];
  if (tasks.length === 0) {
    errors.push('TASK_INDEX contains no independent tasks');
  }
  const unfinished = tasks.filter((task) => task.status !== 'Verified');
  if (unfinished.length > 0) {
    errors.push(
      'All independent tasks must be Verified before publishing: ' +
        unfinished.map((task) => `${task.id} ${task.status}`).join(', '),
    );
  }

  const active = activeTaskState?.activeTask;
  const hold = activeTaskState?.verificationHold;
  const lastVerified = activeTaskState?.lastVerifiedTask;
  if (active?.status !== RELEASE_HOLD_STATUS) {
    errors.push(
      `ACTIVE_TASK must be ${RELEASE_HOLD_STATUS} before publishing, found ${active?.status ?? 'missing'}`,
    );
  }
  if (!hold) {
    errors.push('ACTIVE_TASK must contain verificationHold before publishing');
  } else {
    if (hold.taskId !== active?.id) {
      errors.push('verificationHold.taskId must match activeTask.id');
    }
    if (hold.finalTask !== true || hold.nextTaskId !== null) {
      errors.push('verificationHold must be final with nextTaskId=null');
    }
    const indexedTaskIds = tasks.map((task) => task.id);
    const verifiedTaskIds = Array.isArray(hold.verifiedTasks)
      ? hold.verifiedTasks
      : [];
    if (new Set(verifiedTaskIds).size !== verifiedTaskIds.length) {
      errors.push('verificationHold.verifiedTasks must not contain duplicates');
    }
    const missingFromHold = taskSetDifference(indexedTaskIds, verifiedTaskIds);
    const extraInHold = taskSetDifference(verifiedTaskIds, indexedTaskIds);
    if (missingFromHold.length > 0 || extraInHold.length > 0) {
      errors.push(
        'verificationHold.verifiedTasks must exactly match TASK_INDEX' +
          (missingFromHold.length > 0 ? `; missing ${missingFromHold.join(', ')}` : '') +
          (extraInHold.length > 0 ? `; extra ${extraInHold.join(', ')}` : ''),
      );
    }
  }

  if ((activeTaskState?.deferredVerification ?? []).length > 0) {
    errors.push('deferredVerification must be empty before publishing');
  }
  if ((activeTaskState?.deferredTasks ?? []).length > 0) {
    errors.push('deferredTasks must be empty before publishing');
  }
  if (lastVerified?.id !== active?.id || lastVerified?.id !== hold?.taskId) {
    errors.push('lastVerifiedTask.id must match the final verification hold task');
  }
  if (!validCommitReference(lastVerified?.commit)) {
    errors.push('lastVerifiedTask.commit must reference a committed revision');
  } else if (!verifiedCommitReachable) {
    errors.push('lastVerifiedTask.commit is not reachable from the release commit');
  }
  if (!validCommitReference(lastVerified?.evidenceHead)) {
    errors.push('lastVerifiedTask.evidenceHead must reference a committed revision');
  } else if (!evidenceHeadReachable) {
    errors.push('lastVerifiedTask.evidenceHead is not reachable from the release commit');
  }

  return {
    version,
    taskId: active?.id ?? null,
    taskStatus: active?.status ?? null,
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

function git(argumentsList, options = {}) {
  if (options.quiet) {
    execFileSync('git', argumentsList, { cwd: root, stdio: 'ignore' });
    return '';
  }
  return execFileSync('git', argumentsList, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function currentHead() {
  return git(['rev-parse', 'HEAD']);
}

function isAncestor(ancestor, descendant) {
  if (!validCommitReference(ancestor) || !validCommitReference(descendant)) return false;
  try {
    git(['merge-base', '--is-ancestor', ancestor, descendant], { quiet: true });
    return true;
  } catch {
    return false;
  }
}

async function loadReleaseState() {
  const [packageSource, taskIndexMarkdown, activeTaskSource, workflowSource] =
    await Promise.all([
      readFile(path.join(root, 'package.json'), 'utf8'),
      readFile(path.join(root, 'docs/tasks/TASK_INDEX.md'), 'utf8'),
      readFile(path.join(root, 'docs/tasks/ACTIVE_TASK.json'), 'utf8'),
      readFile(path.join(root, '.github/workflows/release.yml'), 'utf8'),
    ]);
  return {
    packageJson: JSON.parse(packageSource),
    taskIndexMarkdown,
    activeTaskState: JSON.parse(activeTaskSource),
    workflowSource,
  };
}

function evaluateCurrentReleaseState(state, requestedVersion, refName) {
  const head = currentHead();
  const lastVerified = state.activeTaskState.lastVerifiedTask;
  return evaluateReleaseGate({
    taskIndexMarkdown: state.taskIndexMarkdown,
    activeTaskState: state.activeTaskState,
    packageVersion: state.packageJson.version,
    requestedVersion,
    refName,
    verifiedCommitReachable: isAncestor(lastVerified?.commit, head),
    evidenceHeadReachable: isAncestor(lastVerified?.evidenceHead, head),
  });
}

async function checkConfiguration() {
  const state = await loadReleaseState();
  const errors = validateReleaseConfiguration(state);
  if (errors.length > 0) throw new Error(errors.join('\n'));

  const result = evaluateCurrentReleaseState(state, state.packageJson.version, 'main');
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

  const result = evaluateCurrentReleaseState(
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
  console.log(
    'Wrote checksums for ' + assets.length + ' assets in WorldForge v' + version + '.',
  );
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

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
