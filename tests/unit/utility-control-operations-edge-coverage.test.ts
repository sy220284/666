import {
  GENERATION_COMMANDS,
  PROJECT_WORKSPACE_COMMANDS,
  PROVIDER_CORE_OPERATIONS,
  type CoreControlMessage,
} from '@worldforge/contracts';
import { describe, expect, it, vi } from 'vitest';

import type {
  TrackedOperationHandlers,
  UtilityControlContext,
} from '../../packages/core-service/src/utility-control-context.js';
import { dispatchUtilityOperation } from '../../packages/core-service/src/utility-control-operations.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const routers = vi.hoisted(() => ({
  provider: vi.fn(),
  generation: vi.fn(),
  project: vi.fn(),
}));

vi.mock('../../packages/core-service/src/utility-provider-router.js', () => ({
  executeProviderOperation: routers.provider,
}));
vi.mock('../../packages/core-service/src/utility-generation-router.js', () => ({
  executeGenerationOperation: routers.generation,
}));
vi.mock('../../packages/core-service/src/utility-project-router.js', () => ({
  executeProjectOperation: routers.project,
}));

interface Tracked {
  readonly operation: Promise<unknown>;
  readonly handlers: TrackedOperationHandlers<unknown>;
}

function context(accepting: boolean, options: Record<string, unknown> = {}) {
  const sent: unknown[] = [];
  const reports: string[] = [];
  const tracked: Tracked[] = [];
  const value = contractInput<UtilityControlContext>({
    options: {
      appRuntime: {},
      generationServices: {},
      services: {},
      projectWorkspace: { activeProject: null },
      generationRuns: { recoverInterrupted: vi.fn() },
      ...options,
    },
    state: {
      shuttingDown: false,
      acceptingAppDataOperations: accepting,
      activeAppDataOperations: new Set(),
    },
    send: (message: unknown) => {
      sent.push(message);
      return true;
    },
    report: (event: string) => reports.push(event),
    track: (operation: Promise<unknown>, handlers: TrackedOperationHandlers<unknown>) => {
      tracked.push({ operation, handlers });
    },
  });
  return { value, sent, reports, tracked };
}

const requestId = '66666666-6666-4666-8666-666666666666';

describe('utility operation routing edge coverage', () => {
  it('cancels provider and generation commands after operation intake closes', () => {
    const provider = context(false);
    expect(
      dispatchUtilityOperation(
        provider.value,
        contractInput<CoreControlMessage>({
          type: 'core.provider.command',
          requestId,
          operation: { operation: PROVIDER_CORE_OPERATIONS.list },
        }),
      ),
    ).toBe(true);
    expect(provider.sent[0]).toMatchObject({
      type: 'core.provider.result',
      result: { errorCode: 'COMMON_CANCELLED_004' },
    });

    const generation = context(false);
    expect(
      dispatchUtilityOperation(
        generation.value,
        contractInput<CoreControlMessage>({
          type: 'core.generation.command',
          requestId,
          operation: { operation: GENERATION_COMMANDS.getRun, input: {} },
        }),
      ),
    ).toBe(true);
    expect(generation.sent[0]).toMatchObject({
      type: 'core.generation.result',
      result: { errorCode: 'COMMON_CANCELLED_004' },
    });
  });

  it('tracks accepted provider and generation operations through their dedicated routers', () => {
    routers.provider.mockResolvedValueOnce({
      ok: false,
      operation: PROVIDER_CORE_OPERATIONS.list,
      errorCode: 'COMMON_INTERNAL_999',
    });
    const provider = context(true);
    expect(
      dispatchUtilityOperation(
        provider.value,
        contractInput<CoreControlMessage>({
          type: 'core.provider.command',
          requestId,
          operation: { operation: PROVIDER_CORE_OPERATIONS.list },
        }),
      ),
    ).toBe(true);
    expect(routers.provider).toHaveBeenCalledOnce();
    expect(provider.tracked).toHaveLength(1);
    expect(provider.tracked[0]?.handlers.failureEvent).toBe('provider.operation.failed');

    routers.generation.mockResolvedValueOnce({
      ok: false,
      operation: GENERATION_COMMANDS.getRun,
      errorCode: 'COMMON_INTERNAL_999',
    });
    const generation = context(true);
    expect(
      dispatchUtilityOperation(
        generation.value,
        contractInput<CoreControlMessage>({
          type: 'core.generation.command',
          requestId,
          operation: { operation: GENERATION_COMMANDS.getRun, input: {} },
        }),
      ),
    ).toBe(true);
    expect(routers.generation).toHaveBeenCalledOnce();
    expect(generation.tracked).toHaveLength(1);
    expect(generation.tracked[0]?.handlers.failureEvent).toBe('generation.operation.failed');
  });

  it('attempts generation recovery after a writable project open and reports recovery failure', async () => {
    routers.project.mockResolvedValueOnce({
      ok: true,
      operation: PROJECT_WORKSPACE_COMMANDS.create,
      data: {},
    });
    const recoverInterrupted = vi.fn().mockRejectedValueOnce(new Error('recovery failed'));
    const project = context(true, {
      projectWorkspace: {
        activeProject: {
          databaseMode: 'read-write',
          projectId: '77777777-7777-4777-8777-777777777777',
        },
      },
      generationRuns: { recoverInterrupted },
    });
    expect(
      dispatchUtilityOperation(
        project.value,
        contractInput<CoreControlMessage>({
          type: 'core.project.command',
          requestId,
          operation: {
            operation: PROJECT_WORKSPACE_COMMANDS.create,
            input: {},
          },
        }),
      ),
    ).toBe(true);
    expect(project.tracked).toHaveLength(1);
    await expect(project.tracked[0]!.operation).resolves.toMatchObject({ ok: true });
    expect(recoverInterrupted).toHaveBeenCalledOnce();
    expect(project.reports).toContain('generation.recovery.failed');
  });
});
