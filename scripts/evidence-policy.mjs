import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
export const REQUIRED_EVIDENCE_FILES = [
  'summary.md',
  'commands.txt',
  'known-risks.md',
  'manual-acceptance.md',
  'quality-matrix.md',
  'test-results/results.json',
  'screenshots/manifest.json',
];

function git(argumentsList, repositoryRoot = root) {
  return execFileSync('git', argumentsList, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function changedFiles(baseSha) {
  if (!baseSha) throw new Error('EVIDENCE_BASE_SHA is required');
  const allZero = /^0+$/u.test(baseSha);
  const argumentsList = allZero
    ? ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', 'HEAD']
    : ['diff', '--name-only', baseSha, 'HEAD'];
  const output = git(argumentsList);
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
    throw new Error(`${taskId} evidence must reference a committed source revision`);
  }
  try {
    git(['cat-file', '-e', `${sourceCommit}^{commit}`], repositoryRoot);
  } catch (error) {
    throw new Error(`${taskId} evidence source commit does not exist`, { cause: error });
  }
  try {
    git(['merge-base', '--is-ancestor', sourceCommit, expectedHead], repositoryRoot);
  } catch (error) {
    throw new Error(`${taskId} evidence source commit is not an ancestor of the PR Head`, {
      cause: error,
    });
  }
}

export function changedEvidenceTasks(files) {
  const tasks = new Set();
  for (const file of files) {
    const match = /^docs\/test-evidence\/(M\d-\d{2})\//u.exec(file.replaceAll('\\', '/'));
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
    if (entry.isDirectory())
      files.push(...(await regularFiles(path.join(directory, entry.name), relative)));
    else if (entry.isFile()) files.push(relative);
    else throw new Error(`${relative} must be a regular evidence file`);
  }
  return files;
}

export function assertFinalEvidenceSemantics(taskId, manifest, screenshots, documents) {
  if (!/^[0-9a-f]{7,40}$/u.test(manifest.commit ?? '')) {
    throw new Error(`${taskId} final evidence must reference a committed revision`);
  }
  if (taskId.startsWith('M2-') && screenshots.length === 0) {
    throw new Error(`${taskId} final evidence requires at least one desktop screenshot`);
  }
  const combined = [documents.summary, documents.manualAcceptance, documents.qualityMatrix].join(
    '\n',
  );
  const stale =
    /working-tree|BLOCKED_BY_ENVIRONMENT|(?:^|\W)(?:BLOCKED|PENDING|DEFERRED)(?:\W|$)|人工待运行|桌面待运行|等待(?:有显示环境|implementation PR|PR|CI)|任务(?:保持|结论)[^\n]*(?:In Progress|Implemented)/imu;
  if (stale.test(combined)) {
    throw new Error(`${taskId} final evidence contains stale implementation or acceptance state`);
  }
}

export async function validateTaskEvidence(taskId, repositoryRoot = root, options = {}) {
  if (!/^M\d-\d{2}$/u.test(taskId)) throw new Error(`Invalid evidence task id: ${taskId}`);
  const directory = path.join(repositoryRoot, 'docs', 'test-evidence', taskId);
  const manifestPath = path.join(directory, 'manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`${taskId} evidence manifest is missing or invalid`, { cause: error });
  }
  if (
    manifest.schemaVersion !== 1 ||
    manifest.taskId !== taskId ||
    !/^(?:working-tree|[0-9a-f]{7,40})$/u.test(manifest.commit ?? '') ||
    Number.isNaN(Date.parse(manifest.generatedAt ?? '')) ||
    !Array.isArray(manifest.files) ||
    manifest.files.length === 0
  ) {
    throw new Error(`${taskId} evidence manifest metadata is invalid`);
  }
  if (options.expectedHead) {
    assertEvidenceSourceCommit(taskId, manifest.commit, options.expectedHead, repositoryRoot);
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

  let screenshots;
  try {
    screenshots = JSON.parse(
      await readFile(path.join(directory, 'screenshots/manifest.json'), 'utf8'),
    );
  } catch (error) {
    throw new Error(`${taskId} screenshot manifest is invalid`, { cause: error });
  }
  if (!Array.isArray(screenshots))
    throw new Error(`${taskId} screenshot manifest must be an array`);
  const screenshotNames = new Set();
  for (const screenshot of screenshots) {
    const fileName = assertRelativeEvidencePath(
      screenshot?.fileName,
      `${taskId} screenshot manifest`,
    );
    if (
      fileName.includes('/') ||
      screenshotNames.has(fileName) ||
      !/^[0-9a-f]{64}$/u.test(screenshot?.sha256 ?? '')
    ) {
      throw new Error(`${taskId} screenshot manifest entry is invalid: ${fileName}`);
    }
    screenshotNames.add(fileName);
    const evidenceEntry = entries.get(`screenshots/${fileName}`);
    if (!evidenceEntry || evidenceEntry.sha256 !== screenshot.sha256) {
      throw new Error(`${taskId} screenshot is absent from the evidence manifest: ${fileName}`);
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
    assertFinalEvidenceSemantics(taskId, manifest, screenshots, {
      summary: await readFile(path.join(directory, 'summary.md'), 'utf8'),
      manualAcceptance: await readFile(path.join(directory, 'manual-acceptance.md'), 'utf8'),
      qualityMatrix: await readFile(path.join(directory, 'quality-matrix.md'), 'utf8'),
    });
  }

  const actualFiles = (await regularFiles(directory)).filter((file) => file !== 'manifest.json');
  const unlisted = actualFiles.filter((file) => !entries.has(file));
  if (unlisted.length > 0) {
    throw new Error(`${taskId} evidence contains unlisted files: ${unlisted.join(', ')}`);
  }
  console.log(`Evidence gate passed for ${taskId}.`);
}

async function main() {
  const expectedHead = assertEvidenceHead(process.env.EVIDENCE_HEAD_SHA);
  const taskIds = changedEvidenceTasks(changedFiles(process.env.EVIDENCE_BASE_SHA));
  if (taskIds.length === 0) {
    const state = JSON.parse(await readFile('docs/tasks/ACTIVE_TASK.json', 'utf8'));
    console.log(
      `No changed evidence package at ${expectedHead}; final evidence is deferred for ${state.activeTask?.id ?? '<no-active-task>'}.`,
    );
    return;
  }
  for (const taskId of taskIds) {
    await validateTaskEvidence(taskId, root, { expectedHead });
  }
  console.log(`Validated ${taskIds.length} changed evidence package(s) at ${expectedHead}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
