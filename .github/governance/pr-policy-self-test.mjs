/* global console */
import assert from 'node:assert/strict';

import {
  latestChecksByName,
  latestReviewStates,
  modeAwareRunState,
  nextPagePath,
  requiredCheckState,
} from '../../scripts/automerge.mjs';
import { validatePullRequestShape } from './single-work-policy.mjs';

const job = (name, conclusion = 'success', steps = []) => ({
  name,
  status: 'completed',
  conclusion,
  steps,
});
const workflow = {
  id: 1,
  status: 'completed',
  conclusion: 'success',
  created_at: '2026-08-03T00:00:00Z',
};

const oldSuccess = {
  id: 1,
  name: 'security',
  status: 'completed',
  conclusion: 'success',
  created_at: '2026-08-03T00:00:00Z',
};
const newPending = {
  ...oldSuccess,
  id: 2,
  status: 'queued',
  conclusion: null,
  created_at: '2026-08-03T00:01:00Z',
};
assert.equal(latestChecksByName([oldSuccess, newPending]).get('security')?.id, 2);
assert.deepEqual(requiredCheckState([oldSuccess, newPending], ['security']), {
  ready: false,
  pending: ['security'],
  failed: [],
});
assert.deepEqual(
  modeAwareRunState('performance', workflow, [
    job('performance', 'success', [
      { name: 'Run performance budgets', status: 'completed', conclusion: 'success' },
    ]),
  ]),
  { ready: true, pending: [], failed: [] },
);
assert.equal(
  nextPagePath('<https://api.github.com/repos/acme/repo/check-runs?page=2>; rel="next"'),
  '/repos/acme/repo/check-runs?page=2',
);
assert.equal(
  latestReviewStates([
    { user: { login: 'alice' }, state: 'CHANGES_REQUESTED' },
    { user: { login: 'alice' }, state: 'APPROVED' },
  ]).get('alice'),
  'APPROVED',
);
assert.deepEqual(validatePullRequestShape({ head: 'work', base: 'main' }), []);
assert.ok(validatePullRequestShape({ head: 'work/task', base: 'main' }).length > 0);
console.log('PR policy self-test passed.');
