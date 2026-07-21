/* global console, process */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertEvidenceHead, validateTaskEvidence } from '../../scripts/evidence-policy.mjs';
import {
  parseTaskIndex,
  renderActiveTask,
  replaceTaskIndexStatus,
} from '../../scripts/task-control-lib.mjs';

const root = process.cwd();
const statePath = path.join(root, 'docs/tasks/ACTIVE_TASK.json');
const mirrorPath = path.join(root, 'docs/tasks/ACTIVE_TASK.md');
const indexPath = path.join(root, 'docs/tasks/TASK_INDEX.md');

function git(argumentsList) {
  return execFileSync('git', argumentsList, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function option(name) {
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
}

function commitTree(commit) {
  try {
    return git(['rev-parse', `${commit}^{tree}`]);
  } catch (error) {
    throw new Error(`Cannot resolve commit tree for ${commit}`, { cause: error });
  }
}

function assertCommitAncestor(ancestor, descendant, label) {
  try {
    git(['merge-base', '--is-ancestor', ancestor, descendant]);
  } catch (error) {
    throw new Error(`${label} must be an ancestor of the expected Head`, { cause: error });
  }
}

export function replaceDeferredCardStatus(markdown) {
  return markdown.replace(/^> 状态：Deferred(?:（[^\r\n]*）)?[ \t]*$/m, '> 状态：Verified  ');
}

export function deferredClosureErrors({
  target,
  evidenceTask,
  deferredRecord,
  evidenceTaskId,
  card,
}) {
  const errors = [];
  if (!target || target.status !== 'Deferred') {
    errors.push('Target task must be Deferred');
  }
  if (!evidenceTask || !['Implemented', 'Verified'].includes(evidenceTask.status)) {
    errors.push('Evidence task must be Implemented or Verified');
  }
  if (!deferredRecord || deferredRecord.status !== 'Deferred') {
    errors.push('ACTIVE_TASK deferredTasks must contain the target task');
  }
  if (deferredRecord?.absorbedBy !== evidenceTaskId) {
    errors.push('Deferred task absorbedBy must match the evidence task');
  }
  if (target?.id === evidenceTaskId) {
    errors.push('Deferred task cannot use itself as the evidence task');
  }

  const escapedEvidenceTaskId = evidenceTaskId.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const linkPattern = new RegExp(`^> 承接任务：\`${escapedEvidenceTaskId}\`[ \\t]*$`, 'mu');
  if (!linkPattern.test(card)) {
    errors.push(`Deferred task card must declare 承接任务：${evidenceTaskId}`);
  }
  return errors;
}

export function selfTest() {
  const target = { id: 'M3-07', status: 'Deferred' };
  const evidenceTask = { id: 'M3-08', status: 'Implemented' };
  const deferredRecord = {
    id: 'M3-07',
    status: 'Deferred',
    absorbedBy: 'M3-08',
  };
  const card = '# task\n\n> 状态：Deferred  \n> 承接任务：`M3-08`\n';

  assert.deepEqual(
    deferredClosureErrors({
      target,
      evidenceTask,
      deferredRecord,
      evidenceTaskId: 'M3-08',
      card,
    }),
    [],
  );
  assert.deepEqual(
    deferredClosureErrors({
      target,
      evidenceTask: { ...evidenceTask, status: 'Planned' },
      deferredRecord,
      evidenceTaskId: 'M3-08',
      card,
    }),
    ['Evidence task must be Implemented or Verified'],
  );
  assert.deepEqual(
    deferredClosureErrors({
      target,
      evidenceTask,
      deferredRecord: { ...deferredRecord, absorbedBy: 'M3-09' },
      evidenceTaskId: 'M3-08',
      card,
    }),
    ['Deferred task absorbedBy must match the evidence task'],
  );
  assert.match(replaceDeferredCardStatus(card), /^> 状态：Verified {2}$/mu);
  console.log('Deferred task closure self-test passed.');
}

function requireSha(value, label, full = false) {
  const pattern = full ? /^[0-9a-f]{40}$/iu : /^[0-9a-f]{7,40}$/iu;
  if (!pattern.test(value ?? '')) {
    throw new Error(`close-deferred requires ${label}=<${full ? 'full-' : ''}sha>`);
  }
}

async function closeDeferred(taskId) {
  const ciStatus = option('--ci');
  const commit = option('--commit');
  const evidenceTaskId = option('--evidence-task');
  const expectedHead = option('--expected-head');
  const implementationHead = option('--implementation-head');
  const mainCommit = option('--main-commit');

  if (ciStatus !== 'success') throw new Error('close-deferred requires --ci=success');
  if (!/^M\d-\d{2}$/u.test(taskId ?? '')) {
    throw new Error('close-deferred requires a target task id');
  }
  if (!/^M\d-\d{2}$/u.test(evidenceTaskId ?? '')) {
    throw new Error('close-deferred requires --evidence-task=<task-id>');
  }
  requireSha(commit, '--commit');
  requireSha(expectedHead, '--expected-head', true);
  requireSha(implementationHead, '--implementation-head', true);
  requireSha(mainCommit, '--main-commit', true);

  assertEvidenceHead(expectedHead, root);
  assertCommitAncestor(mainCommit, expectedHead, 'mainCommit');
  const implementationTree = commitTree(implementationHead);
  const mainTree = commitTree(mainCommit);
  if (implementationTree !== mainTree) {
    throw new Error('Squash provenance requires identical implementation and main trees');
  }

  const [stateSource, indexSource] = await Promise.all([
    readFile(statePath, 'utf8'),
    readFile(indexPath, 'utf8'),
  ]);
  const state = JSON.parse(stateSource);
  const taskIndex = parseTaskIndex(indexSource);
  const target = taskIndex.get(taskId);
  const evidenceTask = taskIndex.get(evidenceTaskId);
  const deferredRecord = (state.deferredTasks ?? []).find((entry) => entry.id === taskId);
  const cardPath = path.join(root, target?.source ?? '');
  const card = target ? await readFile(cardPath, 'utf8') : '';
  const errors = deferredClosureErrors({
    target,
    evidenceTask,
    deferredRecord,
    evidenceTaskId,
    card,
  });
  if (errors.length > 0) throw new Error(errors.join('\n'));

  await validateTaskEvidence(evidenceTaskId, root, {
    final: true,
    expectedHead,
  });
  const evidenceManifest = JSON.parse(
    await readFile(path.join(root, 'docs/test-evidence', evidenceTaskId, 'manifest.json'), 'utf8'),
  );
  if (evidenceManifest.commit !== mainCommit) {
    throw new Error(`${evidenceTaskId} evidence manifest must bind the reachable main commit`);
  }

  const verifiedIndex = replaceTaskIndexStatus(indexSource, taskId, 'Verified');
  const verifiedCard = replaceDeferredCardStatus(card);
  if (verifiedCard === card) throw new Error(`${taskId} card is not Deferred`);

  state.deferredTasks = (state.deferredTasks ?? []).filter((entry) => entry.id !== taskId);
  state.lastVerifiedTask = {
    id: taskId,
    commit,
    verifiedAt: new Date().toISOString(),
    evidenceHead: expectedHead,
    evidenceTaskId,
    squashProvenance: {
      implementationHead,
      mainCommit,
      implementationTree,
      mainTree,
    },
  };

  await Promise.all([
    writeFile(cardPath, verifiedCard, 'utf8'),
    writeFile(indexPath, verifiedIndex, 'utf8'),
    writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8'),
    writeFile(mirrorPath, renderActiveTask(state), 'utf8'),
  ]);
  console.log(`Closed deferred task ${taskId} using ${evidenceTaskId} evidence.`);
}

async function main() {
  const command = process.argv[2] ?? '--self-test';
  if (command === '--self-test') return selfTest();
  if (command === 'close') return closeDeferred(process.argv[3]);
  throw new Error(`Unknown deferred task closure command: ${command}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
