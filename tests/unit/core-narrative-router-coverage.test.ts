import { beforeEach, describe, expect, it, vi } from 'vitest';

const routeState = vi.hoisted(() => ({
  narrativeError: undefined as { code: string; message: string } | Error | undefined,
  proposalError: undefined as { code: string; message: string } | Error | undefined,
  calls: [] as Array<{ key: string; args: unknown[] }>,
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
  const invoke = (name: string, args: unknown[]) => {
    routeState.calls.push({ key: `narrative.${name}`, args });
    const failure = routeState.narrativeError;
    if (failure instanceof Error) throw failure;
    if (failure) throw new NarrativePlanningServiceError(failure.code, failure.message);
    return { marker: `narrative.${name}` };
  };
  return {
    NarrativePlanningServiceError,
    NarrativePlanningService: class {
      list(...args: unknown[]) { return invoke('list', args); }
      async saveForeshadowing(...args: unknown[]) { return invoke('saveForeshadowing', args); }
      async transitionForeshadowing(...args: unknown[]) { return invoke('transitionForeshadowing', args); }
      async saveCharacterArc(...args: unknown[]) { return invoke('saveCharacterArc', args); }
      async saveArcMilestone(...args: unknown[]) { return invoke('saveArcMilestone', args); }
      async transitionArcMilestone(...args: unknown[]) { return invoke('transitionArcMilestone', args); }
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
  const invoke = (name: string, args: unknown[]) => {
    routeState.calls.push({ key: `proposal.${name}`, args });
    const failure = routeState.proposalError;
    if (failure instanceof Error) throw failure;
    if (failure) throw new StateProposalServiceError(failure.code, failure.message);
    return { marker: `proposal.${name}` };
  };
  return {
    StateProposalServiceError,
    StateProposalService: class {
      list(...args: unknown[]) { return invoke('list', args); }
      async generate(...args: unknown[]) { return invoke('generate', args); }
      async resolve(...args: unknown[]) { return invoke('resolve', args); }
      async refreshSnapshot(...args: unknown[]) { return invoke('refreshSnapshot', args); }
      readSnapshot(...args: unknown[]) { return invoke('readSnapshot', args); }
      async invalidateDerived(...args: unknown[]) { return invoke('invalidateDerived', args); }
    },
  };
});

import { NARRATIVE_PLANNING_COMMANDS, STATE_PROPOSAL_COMMANDS } from '@worldforge/contracts';
import { ContinuityServiceError } from '../../packages/core-service/src/continuity.js';
import { routeNarrativePlanningOperation } from '../../packages/core-service/src/utility-project-narrative-router.js';

const requestId = 'request-id';
const input = { projectId: 'project-id', marker: 'input' };
const services = { projectWorkspace: {} } as never;
const operation = (name: string): never => ({ operation: name, input }) as never;

const routeCases = [
  [NARRATIVE_PLANNING_COMMANDS.list, 'narrative.list', [input]],
  [NARRATIVE_PLANNING_COMMANDS.saveForeshadowing, 'narrative.saveForeshadowing', [requestId, input]],
  [NARRATIVE_PLANNING_COMMANDS.transitionForeshadowing, 'narrative.transitionForeshadowing', [requestId, input]],
  [NARRATIVE_PLANNING_COMMANDS.saveCharacterArc, 'narrative.saveCharacterArc', [requestId, input]],
  [NARRATIVE_PLANNING_COMMANDS.saveArcMilestone, 'narrative.saveArcMilestone', [requestId, input]],
  [NARRATIVE_PLANNING_COMMANDS.transitionArcMilestone, 'narrative.transitionArcMilestone', [requestId, input]],
  [STATE_PROPOSAL_COMMANDS.list, 'proposal.list', [input]],
  [STATE_PROPOSAL_COMMANDS.generate, 'proposal.generate', [requestId, input]],
  [STATE_PROPOSAL_COMMANDS.resolve, 'proposal.resolve', [requestId, input]],
  [STATE_PROPOSAL_COMMANDS.refreshSnapshot, 'proposal.refreshSnapshot', [requestId, input]],
  [STATE_PROPOSAL_COMMANDS.readSnapshot, 'proposal.readSnapshot', [input]],
  [STATE_PROPOSAL_COMMANDS.invalidateDerived, 'proposal.invalidateDerived', [requestId, input]],
] as const;

describe('Core narrative planning router exact mapping', () => {
  beforeEach(() => {
    routeState.narrativeError = undefined;
    routeState.proposalError = undefined;
    routeState.calls.length = 0;
  });

  it.each(routeCases)('maps %s to %s with exact arguments', async (name, key, args) => {
    await expect(routeNarrativePlanningOperation(services, requestId, operation(name))).resolves.toMatchObject({
      ok: true,
      operation: name,
      data: { marker: key },
    });
    expect(routeState.calls).toEqual([{ key, args: [...args] }]);
  });

  it('returns null without invoking either service for unknown operations', async () => {
    await expect(
      routeNarrativePlanningOperation(services, requestId, operation('unknown.operation')),
    ).resolves.toBeNull();
    expect(routeState.calls).toEqual([]);
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
      requestId,
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
      requestId,
      operation(STATE_PROPOSAL_COMMANDS.list),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ContinuityServiceError);
    expect(error).toMatchObject({ code: expected, cause: expect.any(Error) });
  });

  it('rethrows errors outside the known service classes unchanged', async () => {
    const original = new TypeError('unexpected');
    routeState.narrativeError = original;
    await expect(
      routeNarrativePlanningOperation(
        services,
        requestId,
        operation(NARRATIVE_PLANNING_COMMANDS.list),
      ),
    ).rejects.toBe(original);
  });
});
