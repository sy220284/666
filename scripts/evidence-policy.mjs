import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
export const REQUIRED_EVIDENCE_FILES = ['summary.md', 'commands.txt', 'known-risks.md'];

function git(argumentsList, repositoryRoot = root) {
  return execFileSync('git', argumentsList, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function changedFiles(baseSha, repositoryRoot = root) {
  if (!baseSha) throw new Error('EVIDENCE_BASE_SHA is required');
  const allZero = /^0+$/u.test(baseSha);
  const argumentsList = allZero
    ? ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', 'HEAD']
    : ['diff', '--name-only', baseSha, 'HEAD'];
  const output = git(argumentsList, repositoryRoot);
  return output.split(/\r?\n/u).filter(Boolean);
}

function filesChangedAfter(commit, expectedHead, repositoryRoot = root) {
  const output = git(['diff', '--name-only', commit, expectedHead], repositoryRoot);
  return output.split(/\r?\n/u).filter(Boolean);
}

export function assertEvidenceHead(expectedHead, repositoryRoot = root) {
  if (!/^[0-9a-f]{40}$/u.test(expectedHead ?? '')) {
    throw new Error('EVIDENCE_HEAD_SHA must be the full pull request head SHA');
  }
  const actualHead = git(['rev-parse', 'HEAD'], repositoryRoot);
  if (actualHead !== expectedHead) {
    throw new Error(`Evidence checkout SHA mismatch: expected ${expectedHead}, got ${actualHead}`);
  }
  return actualHead;
}

export function assertEvidenceSourceCommit(
  taskId,
  sourceCommit,
  expectedHead,
  repositoryRoot = root,
) {
  if (!/^[0-9a-f]{7,40}$/u.test(sourceCommit ?? '')) {
    throw new Error(`${taskId} evidence must reference a committed implementation revision`);
  }
  try {
    git(['cat-file', '-e', `${sourceCommit}^{commit}`], repositoryRoot);
  } catch (error) {
    throw new Error(`${taskId} evidence implementation commit does not exist`, { cause: error });
  }
  try {
    git(['merge-base', '--is-ancestor', sourceCommit, expectedHead], repositoryRoot);
  } catch (error) {
    throw new Error(`${taskId} evidence implementation commit is not an ancestor of the PR Head`, {
      cause: error,
    });
  }
}

export function evidenceImplementationCommit(manifest) {
  return manifest?.schemaVersion === 2 ? manifest.implementationCommit : manifest?.commit;
}

export function changedEvidenceTasks(files) {
  const tasks = new Set();
  for (const file of files) {
    const match = /^docs\/test-evidence\/(M\d+-\d{2})\//u.exec(file.replaceAll('\\', '/'));
    if (match?.[1]) tasks.add(match[1]);
  }
  return [...tasks].sort();
}

export function changedRuntimeTasks(files) {
  const tasks = new Set();
  for (const file of files) {
    const match = /^docs\/tasks\/runtime\/(M\d+-\d{2})\.json$/u.exec(file.replaceAll('\\', '/'));
    if (match?.[1]) tasks.add(match[1]);
  }
  return [...tasks].sort();
}

function assertRelativeEvidencePath(value, label) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\\') ||
    path.posix.isAbsolute(value) ||
    path.posix.normalize(value) !== value ||
    value === '..' ||
    value.startsWith('../')
  ) {
    throw new Error(`${label} contains an unsafe evidence path`);
  }
  return value;
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

async function regularFiles(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`${relative} must not be a symbolic link`);
    if (entry.isDirectory()) {
      files.push(...(await regularFiles(path.join(directory, entry.name), relative)));
    } else if (entry.isFile()) {
      files.push(relative);
    } else {
      throw new Error(`${relative} must be a regular evidence file`);
    }
  }
  return files;
}

export function assertFinalEvidenceSemantics(taskId, manifest, documents) {
  const implementationCommit = evidenceImplementationCommit(manifest);
  if (!/^[0-9a-f]{7,40}$/u.test(implementationCommit ?? '')) {
    throw new Error(`${taskId} final evidence must reference a committed implementation revision`);
  }
  const stale =
    /working-tree|BLOCKED_BY_ENVIRONMENT|(?:^|\W)(?:BLOCKED|PENDING|DEFERRED)(?:\W|$)|人工待运行|桌面待运行|等待(?:有显示环境|implementation PR|PR|CI)|任务(?:保持|结论)[^\n]*(?:In Progress|Implemented)/imu;
  if (stale.test(documents.summary)) {
    throw new Error(`${taskId} final evidence contains stale implementation or acceptance state`);
  }
}

function validManifestMetadata(manifest, taskId) {
  const implementationCommit = evidenceImplementationCommit(manifest);
  const versionValid =
    manifest.schemaVersion === 1
      ? Object.prototype.hasOwnProperty.call(manifest, 'commit')
      : manifest.schemaVersion === 2 &&
        Object.prototype.hasOwnProperty.call(manifest, 'implementationCommit');
  return (
    versionValid &&
    manifest.taskId === taskId &&
    /^(?:working-tree|[0-9a-f]{7,40})$/u.test(implementationCommit ?? '') &&
    !Number.isNaN(Date.parse(manifest.generatedAt ?? '')) &&
    Array.isArray(manifest.files) &&
    manifest.files.length > 0
  );
}

async function readTaskRuntime(taskId, repositoryRoot = root) {
  const runtimePath = path.join(repositoryRoot, 'docs', 'tasks', 'runtime', `${taskId}.json`);
  let runtime;
  try {
    runtime = JSON.parse(await readFile(runtimePath, 'utf8'));
  } catch (error) {
    throw new Error(`${taskId} Runtime is missing or invalid`, { cause: error });
  }
  if (
    runtime?.schemaVersion !== 2 ||
    runtime?.id !== taskId ||
    typeof runtime?.source !== 'string' ||
    !runtime.source.startsWith('docs/tasks/')
  ) {
    throw new Error(`${taskId} Runtime cannot define final Evidence closure paths`);
  }
  return runtime;
}

export function isAllowedFinalClosurePath(taskId, runtimeSource, file) {
  const normalized = file.replaceAll('\\', '/');
  return (
    normalized === `docs/tasks/runtime/${taskId}.json` ||
    normalized === runtimeSource ||
    normalized === 'docs/tasks/TASK_INDEX.md' ||
    normalized.startsWith(`docs/test-evidence/${taskId}/`)
  );
}

export async function assertReadyEvidenceClosure(
  taskId,
  manifest,
  expectedHead,
  repositoryRoot = root,
) {
  if (manifest?.schemaVersion !== 2) {
    throw new Error(`${taskId} Ready Evidence must use manifest schemaVersion 2`);
  }
  const implementationCommit = evidenceImplementationCommit(manifest);
  if (!/^[0-9a-f]{40}$/u.test(implementationCommit ?? '')) {
    throw new Error(`${taskId} Ready Evidence must bind a full implementation commit SHA`);
  }
  assertEvidenceSourceCommit(taskId, implementationCommit, expectedHead, repositoryRoot);
  const runtime = await readTaskRuntime(taskId, repositoryRoot);
  const changedAfterImplementation = filesChangedAfter(
    implementationCommit,
    expectedHead,
    repositoryRoot,
  );
  const forbidden = changedAfterImplementation.filter(
    (file) => !isAllowedFinalClosurePath(taskId, runtime.source, file),
  );
  if (forbidden.length > 0) {
    throw new Error(
      `${taskId} final Evidence is stale; non-closure changes follow implementationCommit: ${forbidden.join(', ')}`,
    );
  }
  return changedAfterImplementation;
}

export async function validateTaskEvidence(taskId, repositoryRoot = root, options = {}) {
  if (!/^M\d+-\d{2}$/u.test(taskId)) throw new Error(`Invalid evidence task id: ${taskId}`);
  const directory = path.join(repositoryRoot, 'docs', 'test-evidence', taskId);
  const manifestPath = path.join(directory, 'manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`${taskId} evidence manifest is missing or invalid`, { cause: error });
  }
  if (!validManifestMetadata(manifest, taskId)) {
    throw new Error(`${taskId} evidence manifest metadata is invalid`);
  }
  if (options.expectedHead) {
    assertEvidenceSourceCommit(
      taskId,
      evidenceImplementationCommit(manifest),
      options.expectedHead,
      repositoryRoot,
    );
  }

  const entries = new Map();
  for (const entry of manifest.files) {
    const relative = assertRelativeEvidencePath(entry?.path, `${taskId} manifest`);
    if (relative === 'manifest.json' || entries.has(relative)) {
      throw new Error(`${taskId} evidence manifest contains a duplicate or self reference`);
    }
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0) {
      throw new Error(`${taskId} evidence manifest has invalid bytes for ${relative}`);
    }
    if (!/^[0-9a-f]{64}$/u.test(entry.sha256 ?? '')) {
      throw new Error(`${taskId} evidence manifest has invalid sha256 for ${relative}`);
    }
    const absolute = path.join(directory, relative);
    let metadata;
    let content;
    try {
      [metadata, content] = await Promise.all([lstat(absolute), readFile(absolute)]);
    } catch (error) {
      throw new Error(`${taskId} evidence file is missing: ${relative}`, { cause: error });
    }
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(`${taskId} evidence file must be regular: ${relative}`);
    }
    if (content.byteLength !== entry.bytes || sha256(content) !== entry.sha256) {
      throw new Error(`${taskId} evidence integrity mismatch: ${relative}`);
    }
    entries.set(relative, entry);
  }

  for (const required of REQUIRED_EVIDENCE_FILES) {
    if (!entries.has(required)) {
      throw new Error(`${taskId} evidence manifest does not list ${required}`);
    }
  }

  let finalEvidence = options.final === true;
  if (!finalEvidence) {
    try {
      const taskIndex = await readFile(
        path.join(repositoryRoot, 'docs', 'tasks', 'TASK_INDEX.md'),
        'utf8',
      );
      const taskRow = taskIndex.split(/\r?\n/u).find((line) => line.includes(`| ${taskId} |`));
      finalEvidence = /\|\s*Verified\s*\|\s*$/u.test(taskRow ?? '');
    } catch {
      finalEvidence = false;
    }
  }
  if (finalEvidence) {
    assertFinalEvidenceSemantics(taskId, manifest, {
      summary: await readFile(path.join(directory, 'summary.md'), 'utf8'),
    });
  }

  const actualFiles = (await regularFiles(directory)).filter((file) => file !== 'manifest.json');
  const unlisted = actualFiles.filter((file) => !entries.has(file));
  if (unlisted.length > 0) {
    throw new Error(`${taskId} evidence contains unlisted files: ${unlisted.join(', ')}`);
  }
  console.log(`Evidence document gate passed for ${taskId}.`);
  return manifest;
}

export async function validateChangedEvidenceAtHead({
  repositoryRoot = root,
  baseSha,
  expectedHead,
  final = false,
} = {}) {
  const checkedHead = assertEvidenceHead(expectedHead, repositoryRoot);
  const files = changedFiles(baseSha, repositoryRoot);
  const taskIds = changedEvidenceTasks(files);
  if (taskIds.length === 0) {
    if (final) {
      throw new Error('Ready pull request must change the current task Evidence package');
    }
    console.log(
      `No changed evidence documents at ${checkedHead}; no task Evidence package validation is required for this revision.`,
    );
    return [];
  }

  const runtimeTasks = changedRuntimeTasks(files);
  let currentTaskId = null;
  if (final) {
    if (runtimeTasks.length !== 1) {
      throw new Error(
        `Ready Evidence closure requires exactly one changed task Runtime; found ${runtimeTasks.join(', ') || 'none'}`,
      );
    }
    [currentTaskId] = runtimeTasks;
    if (!taskIds.includes(currentTaskId)) {
      throw new Error(`${currentTaskId} Ready pull request must change its own Evidence package`);
    }
  }

  let currentManifest = null;
  for (const taskId of taskIds) {
    const manifest = await validateTaskEvidence(taskId, repositoryRoot, {
      expectedHead: checkedHead,
      final: final && taskId === currentTaskId,
    });
    if (taskId === currentTaskId) currentManifest = manifest;
  }

  if (final && currentTaskId && currentManifest) {
    await assertReadyEvidenceClosure(currentTaskId, currentManifest, checkedHead, repositoryRoot);
  }

  console.log(`Validated ${taskIds.length} changed evidence document set(s) at ${checkedHead}.`);
  return taskIds;
}

function booleanEnvironment(value) {
  return /^(?:1|true)$/iu.test(value ?? '');
}

async function main() {
  await validateChangedEvidenceAtHead({
    baseSha: process.env.EVIDENCE_BASE_SHA,
    expectedHead: process.env.EVIDENCE_HEAD_SHA,
    final: booleanEnvironment(process.env.EVIDENCE_FINAL),
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
