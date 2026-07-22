import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { isPathInside, parseTaskIndex } from './task-control-lib.mjs';

const MANIFEST_DIRECTORY = '.github/audit-remediations';
const AUDIT_BRANCH_PATTERN = /^fix\/governance-audit-[a-z0-9._-]+$/u;

function git(argumentsList, repositoryRoot) {
  return execFileSync('git', argumentsList, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right, 'en'))
        .map(([key, nested]) => [key, stable(nested)]),
    );
  }
  return value;
}

function sameValue(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function uniqueStrings(values, label) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${label} must be a non-empty array`);
  }
  const parsed = values.map((value) => {
    if (typeof value !== 'string' || value.length === 0 || value.includes('\\')) {
      throw new Error(`${label} contains an invalid path or identifier`);
    }
    return value;
  });
  if (new Set(parsed).size !== parsed.length) throw new Error(`${label} contains duplicates`);
  return parsed;
}

function manifestAllowedPaths(manifest) {
  const allowed = new Set(uniqueStrings(manifest.governancePaths, 'governancePaths'));
  for (const repair of manifest.verifiedTaskRepairs) {
    for (const file of uniqueStrings(repair.allowedPaths, `${repair.taskId}.allowedPaths`)) {
      allowed.add(file);
    }
  }
  for (const taskId of manifest.evidenceMigrationTasks) {
    allowed.add(`docs/test-evidence/${taskId}/`);
  }
  return [...allowed];
}

function validateManifestShape(manifest) {
  if (manifest?.schemaVersion !== 1) throw new Error('Unsupported audit remediation schemaVersion');
  if (!/^audit-[a-z0-9-]+$/u.test(manifest.remediationId ?? '')) {
    throw new Error('Invalid audit remediation id');
  }
  if (!/^[0-9a-f]{40}$/u.test(manifest.baseCommit ?? '')) {
    throw new Error('Audit remediation baseCommit must be a full SHA');
  }
  if (!AUDIT_BRANCH_PATTERN.test(manifest.branch ?? '')) {
    throw new Error('Audit remediation branch is invalid');
  }
  if (
    manifest.activeTaskInvariant?.mustMatchBase !== true ||
    !/^M\d-\d{2}$/u.test(manifest.activeTaskInvariant?.id ?? '')
  ) {
    throw new Error('Audit remediation must pin an unchanged active task');
  }
  if (!Array.isArray(manifest.verifiedTaskRepairs) || manifest.verifiedTaskRepairs.length === 0) {
    throw new Error('Audit remediation requires at least one verified task repair');
  }
  const repairIds = manifest.verifiedTaskRepairs.map((repair) => repair?.taskId);
  if (
    repairIds.some((taskId) => !/^M\d-\d{2}$/u.test(taskId ?? '')) ||
    new Set(repairIds).size !== repairIds.length
  ) {
    throw new Error('Audit remediation task ids are invalid or duplicated');
  }
  uniqueStrings(manifest.evidenceMigrationTasks, 'evidenceMigrationTasks');
  manifestAllowedPaths(manifest);
}

export function isAuditRemediationBranch(branch) {
  return AUDIT_BRANCH_PATTERN.test(branch ?? '');
}

export async function loadAuditRemediationManifest({ repositoryRoot = process.cwd(), branch }) {
  if (!isAuditRemediationBranch(branch)) {
    throw new Error('Audit remediation branch is invalid');
  }
  const directory = path.join(repositoryRoot, MANIFEST_DIRECTORY);
  const entries = await readdir(directory, { withFileTypes: true });
  const manifests = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map(async (entry) => {
        const manifestPath = path.posix.join(MANIFEST_DIRECTORY, entry.name);
        const manifest = JSON.parse(
          await readFile(path.join(repositoryRoot, manifestPath), 'utf8'),
        );
        return { manifest, manifestPath };
      }),
  );
  const matches = manifests.filter(({ manifest }) => manifest?.branch === branch);
  if (matches.length !== 1) {
    throw new Error(
      `Audit remediation branch ${branch} must match exactly one manifest; found ${matches.length}`,
    );
  }
  validateManifestShape(matches[0].manifest);
  return matches[0];
}

export async function validateAuditRemediation({
  repositoryRoot = process.cwd(),
  branch,
  changedFiles,
  currentState,
  baseState,
  baseRef,
}) {
  if (!isAuditRemediationBranch(branch)) return false;
  const { manifest, manifestPath } = await loadAuditRemediationManifest({
    repositoryRoot,
    branch,
  });
  if (manifest.branch !== branch)
    throw new Error('Audit remediation branch does not match manifest');
  const resolvedBase = git(['rev-parse', baseRef], repositoryRoot);
  if (manifest.baseCommit !== resolvedBase) {
    throw new Error(
      `Audit remediation base changed: expected ${manifest.baseCommit}, got ${resolvedBase}`,
    );
  }
  if (!baseState || !sameValue(currentState, baseState)) {
    throw new Error('Audit remediation must not change ACTIVE_TASK state');
  }
  if (currentState?.activeTask?.id !== manifest.activeTaskInvariant.id) {
    throw new Error('Audit remediation active task differs from the pinned task');
  }

  const taskIndex = parseTaskIndex(
    await readFile(path.join(repositoryRoot, 'docs/tasks/TASK_INDEX.md'), 'utf8'),
  );
  const requiredVerified = new Set([
    ...manifest.verifiedTaskRepairs.map((repair) => repair.taskId),
    ...manifest.evidenceMigrationTasks,
  ]);
  for (const taskId of requiredVerified) {
    if (taskIndex.get(taskId)?.status !== 'Verified') {
      throw new Error(`${taskId} must remain Verified during audit remediation`);
    }
  }

  const allowedPaths = manifestAllowedPaths(manifest);
  const violations = changedFiles.filter(
    (file) => !allowedPaths.some((allowed) => isPathInside(file, allowed)),
  );
  if (violations.length > 0) {
    throw new Error(
      `Audit remediation changed files outside its manifest:\n${violations.join('\n')}`,
    );
  }
  if (!changedFiles.includes(manifestPath)) {
    throw new Error('Audit remediation PR must include its machine-readable manifest');
  }
  console.log(
    `Audit remediation ${manifest.remediationId} accepted with ${changedFiles.length} changed file(s).`,
  );
  return true;
}
