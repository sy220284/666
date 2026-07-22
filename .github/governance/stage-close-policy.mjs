/* global console, process */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateTaskEvidence } from '../../scripts/evidence-policy.mjs';
import { validateAllVerifiedEvidence } from '../../scripts/verified-evidence-scan.mjs';

const root = process.cwd();
const statePath = 'docs/tasks/ACTIVE_TASK.json';
const indexPath = 'docs/tasks/TASK_INDEX.md';
const fullShaPattern = /^[0-9a-f]{40}$/u;

function git(argumentsList) {
  return execFileSync('git', argumentsList, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function ensureCommitAvailable(commit) {
  try {
    git(['cat-file', '-e', `${commit}^{commit}`]);
    return;
  } catch {
    git(['fetch', '--quiet', '--no-tags', 'origin', commit]);
  }
  git(['cat-file', '-e', `${commit}^{commit}`]);
}

function commitTree(commit) {
  ensureCommitAvailable(commit);
  return git(['rev-parse', `${commit}^{tree}`]);
}

function assertCommitAncestor(ancestor, descendant, label) {
  try {
    git(['merge-base', '--is-ancestor', ancestor, descendant]);
  } catch (error) {
    throw new Error(`${label} must be reachable from ${descendant}`, { cause: error });
  }
}

export function parseTaskStatuses(markdown) {
  const statuses = new Map();
  const pattern = /^\|\s*(M\d+-\d{2})\s*\|[^\n]*\|\s*([^|]+?)\s*\|\s*$/gmu;
  for (const match of markdown.matchAll(pattern)) {
    if (match[1] && match[2]) statuses.set(match[1], match[2].trim());
  }
  return statuses;
}

export function newlyVerifiedTaskIds(baseTasks, headTasks) {
  return [...headTasks.entries()]
    .filter(([id, status]) => status === 'Verified' && baseTasks.get(id) !== 'Verified')
    .map(([id]) => id)
    .sort((left, right) => left.localeCompare(right, 'en'));
}

export function m3StageCloseErrors(state, taskStatuses) {
  if (state?.activeTask?.id !== 'M4-01') return [];
  const errors = [];
  const m3Tasks = [...taskStatuses.entries()].filter(([id]) => id.startsWith('M3-'));
  if (m3Tasks.length === 0) errors.push('M4-01 activation requires indexed M3 tasks');
  for (const [id, status] of m3Tasks) {
    if (status !== 'Verified') errors.push(`${id} must be Verified before M4-01 activation`);
  }
  const deferredM3 = (state.deferredVerification ?? [])
    .map((entry) => entry?.id)
    .filter((id) => typeof id === 'string' && id.startsWith('M3-'));
  if (deferredM3.length > 0) {
    errors.push(`M3 deferredVerification must be empty before M4-01: ${deferredM3.join(', ')}`);
  }

  const verified = state.lastVerifiedTask;
  if (verified?.id !== 'M3-10') {
    errors.push('lastVerifiedTask must be M3-10 before M4-01 activation');
    return errors;
  }
  if (!fullShaPattern.test(verified.evidenceHead ?? '')) {
    errors.push('M3-10 stage close requires a full evidenceHead SHA');
  }
  const provenance = verified.squashProvenance;
  for (const field of ['implementationHead', 'mainCommit']) {
    if (!fullShaPattern.test(provenance?.[field] ?? '')) {
      errors.push(`M3-10 stage close requires squashProvenance.${field}`);
    }
  }
  const recordedTreeFields = ['implementationTree', 'mainTree'].filter(
    (field) => provenance?.[field] !== undefined,
  );
  if (recordedTreeFields.length > 0) {
    for (const field of ['implementationTree', 'mainTree']) {
      if (!fullShaPattern.test(provenance?.[field] ?? '')) {
        errors.push(`Recorded squash provenance requires ${field}`);
      }
    }
    if (
      fullShaPattern.test(provenance?.implementationTree ?? '') &&
      fullShaPattern.test(provenance?.mainTree ?? '') &&
      provenance.implementationTree !== provenance.mainTree
    ) {
      errors.push('M3-10 implementation and main Tree SHA must match');
    }
  }
  return errors;
}

function selfTest() {
  const base = new Map([
    ['M3-01', 'Implemented'],
    ['M3-10', 'Implemented'],
    ['M4-01', 'Planned'],
  ]);
  const closed = new Map([
    ['M3-01', 'Verified'],
    ['M3-10', 'Verified'],
    ['M4-01', 'In Progress'],
  ]);
  assert.deepEqual(newlyVerifiedTaskIds(base, closed), ['M3-01', 'M3-10']);
  assert.deepEqual(
    m3StageCloseErrors(
      {
        activeTask: { id: 'M4-01' },
        deferredVerification: [],
        lastVerifiedTask: {
          id: 'M3-10',
          evidenceHead: 'a'.repeat(40),
          squashProvenance: {
            implementationHead: 'c'.repeat(40),
            mainCommit: 'd'.repeat(40),
          },
        },
      },
      closed,
    ),
    [],
  );
  assert.ok(
    m3StageCloseErrors(
      {
        activeTask: { id: 'M4-01' },
        deferredVerification: [{ id: 'M3-01' }],
        lastVerifiedTask: { id: 'M3-06' },
      },
      base,
    ).length >= 3,
  );
  assert.ok(
    m3StageCloseErrors(
      {
        activeTask: { id: 'M4-01' },
        deferredVerification: [],
        lastVerifiedTask: {
          id: 'M3-10',
          evidenceHead: 'a'.repeat(40),
          squashProvenance: {},
        },
      },
      closed,
    ).some((error) => error.includes('implementationHead')),
  );
  assert.ok(
    m3StageCloseErrors(
      {
        activeTask: { id: 'M4-01' },
        deferredVerification: [],
        lastVerifiedTask: {
          id: 'M3-10',
          evidenceHead: 'a'.repeat(40),
          squashProvenance: {
            implementationHead: 'c'.repeat(40),
            mainCommit: 'd'.repeat(40),
            implementationTree: 'e'.repeat(40),
          },
        },
      },
      closed,
    ).some((error) => error.includes('mainTree')),
  );
  assert.deepEqual(m3StageCloseErrors({ activeTask: { id: 'M3-10' } }, base), []);
}

async function validatePolicy() {
  selfTest();
  const baseStatePath = process.env.TASK_BASE_STATE_PATH;
  const baseIndexPath = process.env.TASK_BASE_INDEX_PATH;
  const baseRef = process.env.TASK_BASE_REF;
  if (!baseStatePath || !baseIndexPath || !fullShaPattern.test(baseRef ?? '')) {
    throw new Error('Stage close policy requires base state, base index and full TASK_BASE_REF');
  }

  const [baseState, headState, baseIndex, headIndex] = await Promise.all([
    readFile(baseStatePath, 'utf8').then(JSON.parse),
    readFile(statePath, 'utf8').then(JSON.parse),
    readFile(baseIndexPath, 'utf8'),
    readFile(indexPath, 'utf8'),
  ]);
  const baseTasks = parseTaskStatuses(baseIndex);
  const headTasks = parseTaskStatuses(headIndex);
  const stageErrors = m3StageCloseErrors(headState, headTasks);
  if (stageErrors.length > 0) throw new Error(stageErrors.join('\n'));

  for (const taskId of newlyVerifiedTaskIds(baseTasks, headTasks)) {
    await validateTaskEvidence(taskId, root, {
      final: true,
      expectedHead: baseRef,
    });
  }

  if (baseState?.activeTask?.id !== 'M4-01' && headState?.activeTask?.id === 'M4-01') {
    const actualHead = git(['rev-parse', 'HEAD']);
    const verified = headState.lastVerifiedTask;
    const provenance = verified.squashProvenance;
    assertCommitAncestor(verified.evidenceHead, actualHead, 'M3-10 evidenceHead');
    assertCommitAncestor(provenance.mainCommit, baseRef, 'M3-10 mainCommit');
    const implementationTree = commitTree(provenance.implementationHead);
    const mainTree = commitTree(provenance.mainCommit);
    if (implementationTree !== mainTree) {
      throw new Error('M3-10 implementation Head and main commit must resolve to the same Tree SHA');
    }
    if (
      provenance.implementationTree !== undefined &&
      provenance.implementationTree !== implementationTree
    ) {
      throw new Error('M3-10 recorded implementation Tree SHA does not match the implementation Head');
    }
    if (provenance.mainTree !== undefined && provenance.mainTree !== mainTree) {
      throw new Error('M3-10 recorded main Tree SHA does not match the main commit');
    }
    const manifest = JSON.parse(
      await readFile(path.join(root, 'docs/test-evidence/M3-10/manifest.json'), 'utf8'),
    );
    if (manifest.commit !== provenance.mainCommit) {
      throw new Error('M3-10 evidence manifest must bind squashProvenance.mainCommit');
    }
    await validateAllVerifiedEvidence(root, baseRef);
  }

  const actualHead = git(['rev-parse', 'HEAD']);
  console.log(`Stage close policy passed at ${actualHead}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await validatePolicy();
