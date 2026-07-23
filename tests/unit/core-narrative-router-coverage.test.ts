import { beforeEach, describe, expect, it, vi } from 'vitest';

const routeState = vi.hoisted(() => ({
  narrativeError: undefined as { code: string; message: string } | Error | undefined,
  proposalError: undefined as { code: string; message: string } | Error | undefined,
}));

vi.mock('@worldforge/contracts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    CoreProjectResultSchema: { parse: (input: unknown) => input },
  };
});

vi.mock('../../packages/core-service/src/continuity.js', () => ({
  ContinuityServiceError: class ContinuityServiceError extends Error {
    readonly code: string;
    constructor(code: string, message: string, options?: ErrorOptions) {
      super(message, options);
      this.name = 'ContinuityServiceError';
      this.code = code;
    }
  },
}));

vi.mock('../../packages/core-service/src/narrative-planning.js', () => {
  class NarrativePlanningServiceError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  const result = (name: string) => {
    const failure = routeState.narrativeError;
    if (failure instanceof Error) throw failure;
    if (failure) throw new NarrativePlanningServiceError(failure.code, failure.message);
    return { name };
  };
  return {
    NarrativePlanningServiceError,
    NarrativePlanningService: class {
      list() {
        return result('list');
      }
      async saveForeshadowing() {
        return result('saveForeshadowing');
      }
      async transitionForeshadowing() {
        return result('transitionForeshadowing');
      }
      async saveCharacterArc() {
        return result('saveCharacterArc');
      }
      async saveArcMilestone() {
        return result('saveArcMilestone');
      }
      async transitionArcMilestone() {
        return result('transitionArcMilestone');
      }
    },
  };
});

vi.mock('../../packages/core-service/src/state-proposal.js', () => {
  class StateProposalServiceError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  const result = (name: string) => {
    const failure = routeState.proposalError;
    if (failure instanceof Error) throw failure;
    if (failure) throw new StateProposalServiceError(failure.code, failure.message);
    return { name };
  };
  return {
    StateProposalServiceError,
    StateProposalService: class {
      list() {
        return result('list');
      }
      async generate() {
        return result('generate');
      }
      async resolve() {
        return result('resolve');
      }
      async refreshSnapshot() {
        return result('refreshSnapshot');
      }
      readSnapshot() {
        return result('readSnapshot');
      }
      async invalidateDerived() {
        return result('invalidateDerived');
      }
    },
  };
});

import { NARRATIVE_PLANNING_COMMANDS, STATE_PROPOSAL_COMMANDS } from '@worldforge/contracts';
import { ContinuityServiceError } from '../../packages/core-service/src/continuity.js';
import { routeNarrativePlanningOperation } from '../../packages/core-service/src/utility-project-narrative-router.js';

const services = { projectWorkspace: {} } as never;
const operation = (name: string): never =>
  ({ operation: name, input: { projectId: 'project-id' } }) as never;

describe('Core narrative planning router coverage', () => {
  beforeEach(() => {
    routeState.narrativeError = undefined;
    routeState.proposalError = undefined;
  });

  it('routes every narrative and state proposal operation', async () => {
    for (const name of [
      ...Object.values(NARRATIVE_PLANNING_COMMANDS),
      ...Object.values(STATE_PROPOSAL_COMMANDS),
    ]) {
      await expect(routeNarrativePlanningOperation(services, 'request-id', operation(name))).resolves.toMatchObject({
        ok: true,
        operation: name,
      });
    }
  });

  it('returns null for unknown operations', async () => {
    await expect(
      routeNarrativePlanningOperation(services, 'request-id', operation('unknown.operation')),
    ).resolves.toBeNull();
  });

  it.each([
    ['NARRATIVE_NOT_FOUND', 'CONTINUITY_NOT_FOUND'],
    ['NARRATIVE_CONFLICT', 'CONTINUITY_CONFLICT'],
    ['NARRATIVE_AUTHOR_REQUIRED', 'CONTINUITY_INVALID'],
    ['NARRATIVE_INVALID', 'CONTINUITY_INVALID'],
    ['NARRATIVE_INVARIANT', 'CONTINUITY_INVARIANT'],
  ])('translates narrative error %s', async (code, expected) => {
    routeState.narrativeError = { code, message: 'narrative failed' };
    const error = await routeNarrativePlanningOperation(
      services,
      'request-id',
      operation(NARRATIVE_PLANNING_COMMANDS.list),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ContinuityServiceError);
    expect(error).toMatchObject({ code: expected, cause: expect.any(Error) });
  });

  it.each([
    ['STATE_PROPOSAL_NOT_FOUND', 'CONTINUITY_NOT_FOUND'],
    ['STATE_PROPOSAL_CONFLICT', 'CONTINUITY_CONFLICT'],
    ['STATE_PROPOSAL_AUTHOR_REQUIRED', 'CONTINUITY_INVALID'],
    ['STATE_PROPOSAL_INVALID', 'CONTINUITY_INVALID'],
    ['STATE_PROPOSAL_INVARIANT', 'CONTINUITY_INVARIANT'],
  ])('translates state proposal error %s', async (code, expected) => {
    routeState.proposalError = { code, message: 'proposal failed' };
    const error = await routeNarrativePlanningOperation(
      services,
      'request-id',
      operation(STATE_PROPOSAL_COMMANDS.list),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ContinuityServiceError);
    expect(error).toMatchObject({ code: expected, cause: expect.any(Error) });
  });

  it('rethrows errors outside the known service classes', async () => {
    const original = new TypeError('unexpected');
    routeState.narrativeError = original;
    await expect(
      routeNarrativePlanningOperation(
        services,
        'request-id',
        operation(NARRATIVE_PLANNING_COMMANDS.list),
      ),
    ).rejects.toBe(original);
  });
});
