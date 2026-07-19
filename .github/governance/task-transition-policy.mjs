import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const statePath = 'docs/tasks/ACTIVE_TASK.json';
const indexPath = 'docs/tasks/TASK_INDEX.md';
const closeoutBranch = 'work/m1-08-recovery-readonly-foundation';

function parseTaskStatuses(markdown) {
  const statuses = new Map();
  const pattern = /^\|\s*(M\d-\d{2})\s*\|[^\n]*\|\s*([^|]+?)\s*\|\s*$/gmu;
  for (const match of markdown.matchAll(pattern)) {
    statuses.set(match[1], match[2].trim());
  }
  return statuses;
}

export function transitionErrors(baseState, headState, taskStatuses) {
  const errors = [];
  const previous = baseState?.activeTask;
  if (!previous?.id || previous.status !== 'IN_PROGRESS') return errors;

  if (headState?.lastImplementedTask?.id !== previous.id) {
    errors.push(`lastImplementedTask must record ${previous.id}`);
  }
  if (!(headState?.deferredVerification ?? []).some((entry) => entry.id === previous.id)) {
    errors.push(`deferredVerification must include ${previous.id}`);
  }
  if (taskStatuses.get(previous.id) !== 'Implemented') {
    errors.push(`TASK_INDEX must mark ${previous.id} as Implemented`);
  }
  if (!headState?.activeTask || headState.activeTask.status !== 'IN_PROGRESS') {
    errors.push('A dependency-ready next task must be active and IN_PROGRESS');
  } else if (headState.activeTask.id === previous.id) {
    errors.push('The completed task cannot remain the active task');
  }
  return errors;
}

function governanceBranch(branch) {
  return /^(?:policy\/|chore\/governance-|fix\/governance-)/u.test(branch ?? '');
}

async function validateReadyTransition() {
  const baseStatePath = process.env.TASK_BASE_STATE_PATH;
  const branch = process.env.TASK_PR_HEAD_REF ?? process.env.GITHUB_HEAD_REF ?? '';
  const draft = process.env.TASK_PR_DRAFT === 'true';
  if (draft || branch === closeoutBranch || governanceBranch(branch)) {
    console.log(`Ready transition validation skipped for ${branch || 'unknown branch'}.`);
    return;
  }
  if (!baseStatePath) throw new Error('TASK_BASE_STATE_PATH is required');

  const baseState = JSON.parse(await readFile(baseStatePath, 'utf8'));
  if (baseState.authorization?.mode !== 'implementation-pr') return;

  const headState = JSON.parse(await readFile(statePath, 'utf8'));
  const taskStatuses = parseTaskStatuses(await readFile(indexPath, 'utf8'));
  const sameTaskStillActive =
    baseState.activeTask?.id === headState.activeTask?.id &&
    baseState.activeTask?.status === 'IN_PROGRESS' &&
    headState.activeTask?.status === 'IN_PROGRESS';
  if (sameTaskStillActive) {
    throw new Error(
      `Ready implementation PR must run task:advance in the same branch before full review: ${baseState.activeTask.id}`,
    );
  }

  const errors = transitionErrors(baseState, headState, taskStatuses);
  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log(`Implementation transition is valid for ${baseState.activeTask?.id}.`);
}

function selfTest() {
  const baseState = { activeTask: { id: 'M3-03', status: 'IN_PROGRESS' } };
  const headState = {
    activeTask: { id: 'M3-04', status: 'IN_PROGRESS' },
    lastImplementedTask: { id: 'M3-03' },
    deferredVerification: [{ id: 'M3-03' }],
  };
  const statuses = new Map([
    ['M3-03', 'Implemented'],
    ['M3-04', 'In Progress'],
  ]);
  assert.deepEqual(transitionErrors(baseState, headState, statuses), []);
  assert.ok(
    transitionErrors(baseState, { ...headState, deferredVerification: [] }, statuses).includes(
      'deferredVerification must include M3-03',
    ),
  );
  assert.ok(
    transitionErrors(baseState, { ...headState, activeTask: baseState.activeTask }, statuses).includes(
      'The completed task cannot remain the active task',
    ),
  );
  console.log('task transition policy self-test passed');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'self-test') selfTest();
  else await validateReadyTransition();
}
