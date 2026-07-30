import { execFileSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const acceptancePath = path.join(root, 'docs/ui/UI_ACCEPTANCE_STATE.json');
const ALLOWED_STATUSES = new Set(['PASS', 'FAIL', 'NOT_APPLICABLE', 'ACCEPTED_RISK']);
const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/iu;

function validDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function currentHead() {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function isAncestor(ancestor, descendant) {
  if (!COMMIT_PATTERN.test(ancestor ?? '') || !COMMIT_PATTERN.test(descendant ?? '')) return false;
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: root,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

export function evaluateUiAcceptanceState(state, options = {}) {
  const errors = [];
  const releaseSeverities = new Set(state?.releaseBlockingSeverities ?? ['P0', 'P1']);
  const items = Array.isArray(state?.items) ? state.items : [];
  const head = options.head ?? null;
  const reachable = options.isReachable ?? (() => true);

  if (!state || state.schemaVersion !== 1) {
    errors.push('UI acceptance state must use schemaVersion 1');
  }
  if (typeof state?.taskId !== 'string' || !/^M\d+-\d{2}$/u.test(state.taskId)) {
    errors.push('UI acceptance state must identify a valid taskId');
  }
  if (!validDate(state?.updatedAt)) errors.push('UI acceptance state updatedAt must be an ISO date');
  if (items.length === 0) errors.push('UI acceptance state must contain acceptance items');

  const ids = new Set();
  for (const item of items) {
    const id = typeof item?.id === 'string' ? item.id : '<missing>';
    if (ids.has(id)) errors.push(`Duplicate UI acceptance item: ${id}`);
    ids.add(id);

    if (!ALLOWED_STATUSES.has(item?.status)) {
      errors.push(`${id}: unsupported status ${String(item?.status)}`);
      continue;
    }
    if (typeof item?.severity !== 'string' || !/^P[0-3]$/u.test(item.severity)) {
      errors.push(`${id}: severity must be P0-P3`);
    }
    if (typeof item?.description !== 'string' || item.description.trim().length === 0) {
      errors.push(`${id}: description is required`);
    }

    if (releaseSeverities.has(item?.severity) && item.status !== 'PASS') {
      errors.push(`${id}: release-blocking ${item.severity} item must be PASS, found ${item.status}`);
    }

    if (item.status === 'PASS') {
      if (!COMMIT_PATTERN.test(item?.verifiedCommit ?? '')) {
        errors.push(`${id}: PASS requires a committed verifiedCommit`);
      } else if (head && !reachable(item.verifiedCommit, head)) {
        errors.push(`${id}: verifiedCommit is not reachable from the release commit`);
      }
      if (!Array.isArray(item?.evidence) || item.evidence.length === 0) {
        errors.push(`${id}: PASS requires at least one evidence reference`);
      }
    }

    if (item.status === 'ACCEPTED_RISK') {
      const waiver = item?.waiver;
      if (
        !waiver ||
        typeof waiver.reason !== 'string' ||
        !waiver.reason.trim() ||
        typeof waiver.approvedBy !== 'string' ||
        !waiver.approvedBy.trim() ||
        !validDate(waiver.expiresAt)
      ) {
        errors.push(`${id}: ACCEPTED_RISK requires reason, approvedBy and expiresAt`);
      } else if (Date.parse(waiver.expiresAt) <= (options.now ?? Date.now())) {
        errors.push(`${id}: accepted-risk waiver has expired`);
      }
    }
  }

  return errors;
}

export async function validateUiAcceptanceEvidence(state, repositoryRoot = root) {
  const errors = [];
  for (const item of state.items ?? []) {
    if (item?.status !== 'PASS') continue;
    for (const evidence of item.evidence ?? []) {
      if (typeof evidence !== 'string' || evidence.trim().length === 0) {
        errors.push(`${item.id}: evidence reference must be a non-empty string`);
        continue;
      }
      if (/^(?:run|artifact|manual):/u.test(evidence)) continue;
      try {
        await access(path.resolve(repositoryRoot, evidence));
      } catch {
        errors.push(`${item.id}: evidence path does not exist: ${evidence}`);
      }
    }
  }
  return errors;
}

export async function runUiAcceptanceGate() {
  const state = JSON.parse(await readFile(acceptancePath, 'utf8'));
  const head = currentHead();
  const errors = [
    ...evaluateUiAcceptanceState(state, {
      head,
      isReachable: isAncestor,
    }),
    ...(await validateUiAcceptanceEvidence(state)),
  ];
  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log(`UI acceptance gate passed for ${state.taskId} at ${head}.`);
}

const invokedDirectly = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (invokedDirectly) {
  runUiAcceptanceGate().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
