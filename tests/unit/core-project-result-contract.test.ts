import { beforeEach, describe, expect, it, vi } from 'vitest';

const routeState = vi.hoisted(() => ({ result: null as unknown }));

vi.mock('@worldforge/contracts', async (importOriginal) => {
  const [actual, strictEnvelope] = await Promise.all([
    importOriginal<Record<string, unknown>>(),
    import('../testkit/strict-result-envelope.js'),
  ]);
  return { ...actual, CoreProjectResultSchema: strictEnvelope.strictResultEnvelopeSchema };
});
vi.mock('../../packages/core-service/src/utility-project-primary-router.js', () => ({
  routePrimaryProjectOperation: async () => routeState.result,
}));
vi.mock('../../packages/core-service/src/utility-project-narrative-router.js', () => ({
  routeNarrativePlanningOperation: async () => null,
}));
vi.mock('../../packages/core-service/src/utility-validation-router.js', () => ({
  routeValidationOperation: async () => null,
}));
vi.mock('../../packages/core-service/src/utility-search-rhythm-router.js', () => ({
  routeSearchRhythmOperation: async () => null,
}));
vi.mock('../../packages/core-service/src/utility-project-idea-router.js', () => ({
  routeIdeaOperation: async () => null,
}));
vi.mock('../../packages/core-service/src/utility-project-structure-router.js', () => ({
  routeStructureProjectOperation: async () => null,
}));
vi.mock('../../packages/core-service/src/utility-project-content-router.js', () => ({
  routeContentProjectOperation: async () => null,
}));
vi.mock('../../packages/core-service/src/utility-errors.js', () => ({
  projectOperationError: () => 'COMMON_INTERNAL_999',
}));
vi.mock('../../packages/core-service/src/draft.js', () => ({
  DraftServiceError: class DraftServiceError extends Error {
    readonly lockConflict = undefined;
  },
}));

import { executeProjectOperation } from '../../packages/core-service/src/utility-project-router.js';
import { contractInput, strictTestDouble } from '../testkit/strict-test-doubles.js';

const services = strictTestDouble<Parameters<typeof executeProjectOperation>[0]>(
  'ProjectRouterServices',
  {},
);

beforeEach(() => {
  routeState.result = null;
});

describe('Core project result runtime contract', () => {
  it('turns a malformed routed success result into an immediate internal error', async () => {
    routeState.result = { ok: true, operation: 'malformed', unexpected: true };

    await expect(
      executeProjectOperation(
        services,
        'request-id',
        contractInput({ operation: 'malformed' }) as Parameters<typeof executeProjectOperation>[2],
      ),
    ).resolves.toEqual({
      ok: false,
      operation: 'malformed',
      errorCode: 'COMMON_INTERNAL_999',
    });
  });
});
