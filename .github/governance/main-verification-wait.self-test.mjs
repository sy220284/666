import assert from 'node:assert/strict';

import { waitForSourceReadyChecks } from '../../scripts/main-verification.mjs';

const requiredChecks = [
  'pr-policy',
  'task-governance',
  'quality / quality',
  'security',
  'performance',
  'evidence',
];

function successfulChecks() {
  return requiredChecks.map((name, index) => ({
    id: index + 1,
    name,
    status: 'completed',
    conclusion: 'success',
    started_at: `2026-07-28T00:00:0${index}Z`,
  }));
}

{
  let checkLoads = 0;
  let modeLoads = 0;
  const result = await waitForSourceReadyChecks({
    requiredChecks,
    attempts: 3,
    initialDelayMs: 0,
    delayMs: 0,
    sleep: async () => {},
    log: () => {},
    loadCheckRuns: async () => {
      checkLoads += 1;
      const checks = successfulChecks();
      if (checkLoads === 1) {
        checks.push({
          id: 100,
          name: 'quality / quality',
          status: 'in_progress',
          conclusion: null,
          started_at: '2026-07-28T00:10:00Z',
        });
      }
      return checks;
    },
    loadModeState: async () => {
      modeLoads += 1;
      return modeLoads === 1
        ? { ready: false, pending: ['quality / quality'], failed: [] }
        : { ready: true, pending: [], failed: [] };
    },
  });

  assert.equal(checkLoads, 2);
  assert.equal(modeLoads, 2);
  assert.equal(result.length, requiredChecks.length);
}

await assert.rejects(
  waitForSourceReadyChecks({
    requiredChecks,
    attempts: 3,
    initialDelayMs: 0,
    delayMs: 0,
    sleep: async () => {},
    log: () => {},
    loadCheckRuns: async () => [
      ...successfulChecks(),
      {
        id: 200,
        name: 'performance',
        status: 'completed',
        conclusion: 'failure',
        started_at: '2026-07-28T00:20:00Z',
      },
    ],
    loadModeState: async () => ({ ready: true, pending: [], failed: [] }),
  }),
  /Source PR permanent checks failed: performance/u,
);

console.log('Main verification wait self-test passed.');
