import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  latestChecksByName,
  latestReviewStates,
  latestWorkflowRun,
  modeAwareRunState,
  nextPagePath,
  requiredCheckState,
} from './automerge.mjs';

function workflowRun(overrides = {}) {
  return {
    id: 1,
    status: 'completed',
    conclusion: 'success',
    created_at: '2026-07-19T00:00:00Z',
    ...overrides,
  };
}

function job(name, conclusion = 'success', steps = []) {
  return {
    name,
    status: 'completed',
    conclusion,
    steps,
  };
}

const oldSuccess = {
  id: 1,
  name: 'security',
  status: 'completed',
  conclusion: 'success',
  created_at: '2026-07-19T00:00:00Z',
};
const newPending = {
  id: 2,
  name: 'security',
  status: 'queued',
  conclusion: null,
  created_at: '2026-07-19T00:01:00Z',
};
assert.equal(latestChecksByName([oldSuccess, newPending]).get('security')?.id, 2);
assert.deepEqual(requiredCheckState([oldSuccess, newPending], ['security']), {
  ready: false,
  pending: ['security'],
  failed: [],
});

const sameTimeOld = { ...oldSuccess, id: 3 };
const sameTimeNew = { ...oldSuccess, id: 4 };
assert.equal(latestChecksByName([sameTimeOld, sameTimeNew]).get('security')?.id, 4);
assert.equal(latestWorkflowRun([sameTimeOld, sameTimeNew])?.id, 4);

const draftQualityJobs = [
  job('quality / static-checks'),
  job('quality / tests-unit', 'skipped'),
  job('quality / tests-integration', 'skipped'),
  job('quality / tests-migration', 'skipped'),
  job('quality / desktop-e2e', 'skipped'),
  job('quality / build', 'skipped'),
  job('quality / package-smoke', 'skipped'),
  job('quality / quality'),
];
assert.deepEqual(modeAwareRunState('quality', workflowRun(), draftQualityJobs), {
  ready: false,
  pending: ['quality'],
  failed: [],
});

const oldFullRun = workflowRun({ id: 10, created_at: '2026-07-19T00:00:00Z' });
const newDraftRun = workflowRun({ id: 11, created_at: '2026-07-19T00:01:00Z' });
assert.equal(latestWorkflowRun([oldFullRun, newDraftRun])?.id, 11);
assert.deepEqual(
  modeAwareRunState('quality', latestWorkflowRun([oldFullRun, newDraftRun]), draftQualityJobs),
  {
    ready: false,
    pending: ['quality'],
    failed: [],
  },
);

const fullQualityJobs = draftQualityJobs.map((candidate) => job(candidate.name));
assert.deepEqual(modeAwareRunState('quality', workflowRun(), fullQualityJobs), {
  ready: true,
  pending: [],
  failed: [],
});

assert.deepEqual(
  modeAwareRunState('security', workflowRun(), [
    job('dependency-audit', 'failure'),
    job('secret-scan'),
    job('application-security'),
    job('security', 'failure'),
  ]),
  {
    ready: false,
    pending: [],
    failed: ['security'],
  },
);

assert.deepEqual(
  modeAwareRunState('performance', workflowRun(), [
    job('performance', 'success', [
      {
        name: 'Run performance budgets',
        status: 'completed',
        conclusion: 'skipped',
      },
    ]),
  ]),
  {
    ready: false,
    pending: ['performance'],
    failed: [],
  },
);

assert.deepEqual(
  modeAwareRunState('performance', workflowRun(), [
    job('performance', 'success', [
      {
        name: 'Run performance budgets',
        status: 'completed',
        conclusion: 'success',
      },
    ]),
  ]),
  {
    ready: true,
    pending: [],
    failed: [],
  },
);

assert.equal(
  nextPagePath(
    '<https://api.github.com/repos/acme/repo/check-runs?page=2>; rel="next", <https://api.github.com/repos/acme/repo/check-runs?page=4>; rel="last"',
  ),
  '/repos/acme/repo/check-runs?page=2',
);
assert.equal(nextPagePath(null), null);
assert.throws(
  () => nextPagePath('<https://example.com/page=2>; rel="next"'),
  /Unexpected pagination origin/u,
);

const reviews = [
  { user: { login: 'alice' }, state: 'CHANGES_REQUESTED' },
  { user: { login: 'bob' }, state: 'APPROVED' },
  { user: { login: 'alice' }, state: 'APPROVED' },
];
assert.equal(latestReviewStates(reviews).get('alice'), 'APPROVED');

const [workflowSource, qualitySource, mainVerificationSource] = await Promise.all([
  readFile('.github/workflows/automerge.yml', 'utf8'),
  readFile('.github/workflows/quality.yml', 'utf8'),
  readFile('scripts/main-verification.mjs', 'utf8'),
]);
const triggerBlock = workflowSource.match(/workflows:\s*\n([\s\S]*?)\n\s*types:/u)?.[1] ?? '';
for (const workflowName of [
  'PR Policy',
  'Task Governance',
  'Quality',
  'Security',
  'Performance',
  'Evidence',
]) {
  assert.match(triggerBlock, new RegExp(`^\\s*- ${workflowName}$`, 'mu'));
}
assert.match(
  workflowSource,
  /group: automerge-main-\$\{\{ github\.event\.workflow_run\.head_sha \}\}/u,
);
assert.match(workflowSource, /cancel-in-progress: true/u);
assert.match(qualitySource, /static-failure-diagnostics/u);
assert.match(qualitySource, /test-results\/ci\/lint\.log/u);
assert.match(qualitySource, /test-results\/ci\/typecheck\.log/u);
assert.match(mainVerificationSource, /modeAwareChecksState/u);
assert.match(mainVerificationSource, /nextPagePath/u);

console.log('Auto Merge policy tests passed.');
