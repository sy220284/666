import { beforeEach, describe, expect, it, vi } from 'vitest';

const routeState = vi.hoisted(() => ({
  primary: null as unknown,
  narrative: null as unknown,
  structure: null as unknown,
  content: null as unknown,
  error: undefined as Error | undefined,
  calls: [] as string[],
}));

vi.mock('@worldforge/contracts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    CoreAppDataResultSchema: { parse: (input: unknown) => input },
    CoreProjectResultSchema: { parse: (input: unknown) => input },
  };
});
vi.mock('../../packages/core-service/src/utility-project-primary-router.js', () => ({
  routePrimaryProjectOperation: async () => {
    routeState.calls.push('primary');
    if (routeState.error) throw routeState.error;
    return routeState.primary;
  },
}));
vi.mock('../../packages/core-service/src/utility-project-narrative-router.js', () => ({
  routeNarrativePlanningOperation: async () => {
    routeState.calls.push('narrative');
    return routeState.narrative;
  },
}));
vi.mock('../../packages/core-service/src/utility-project-structure-router.js', () => ({
  routeStructureProjectOperation: async () => {
    routeState.calls.push('structure');
    return routeState.structure;
  },
}));
vi.mock('../../packages/core-service/src/utility-project-content-router.js', () => ({
  routeContentProjectOperation: async () => {
    routeState.calls.push('content');
    return routeState.content;
  },
}));
vi.mock('../../packages/core-service/src/utility-errors.js', () => ({
  appDataError: () => 'COMMON_INTERNAL_999',
  projectOperationError: () => 'COMMON_INTERNAL_999',
}));
vi.mock('../../packages/core-service/src/draft.js', () => ({
  DraftServiceError: class DraftServiceError extends Error {
    readonly lockConflict: unknown;
    constructor(lockConflict?: unknown) {
      super('draft failed');
      this.lockConflict = lockConflict;
    }
  },
}));

import { APP_DATA_COMMANDS } from '@worldforge/contracts';
import { DraftServiceError } from '../../packages/core-service/src/draft.js';
import { executeAppDataOperation } from '../../packages/core-service/src/utility-app-data-router.js';
import { executeProjectOperation } from '../../packages/core-service/src/utility-project-router.js';

const requestId = 'request-id';
const projectId = '22222222-2222-4222-8222-222222222222';

function appRuntime() {
  return {
    appSettings: {
      get: vi.fn(() => ({ source: 'stored', settings: { marker: 'get' } })),
      update: vi.fn(async () => ({ source: 'stored', settings: { marker: 'update' } })),
      reset: vi.fn(async () => ({ source: 'default', settings: { marker: 'reset' } })),
    },
    recentProjects: {
      list: vi.fn(async () => [{ projectId, marker: 'list' }]),
      relocate: vi.fn(async () => ({ projectId, marker: 'relocate' })),
      remove: vi.fn(async () => true),
    },
  };
}

const appCases = [
  {
    operation: { operation: APP_DATA_COMMANDS.settingsGet },
    method: 'appSettings.get',
    args: [],
  },
  {
    operation: { operation: APP_DATA_COMMANDS.settingsSet, settings: { reduceMotion: true } },
    method: 'appSettings.update',
    args: [requestId, { reduceMotion: true }],
  },
  {
    operation: { operation: APP_DATA_COMMANDS.settingsReset },
    method: 'appSettings.reset',
    args: [requestId],
  },
  {
    operation: { operation: APP_DATA_COMMANDS.projectListRecent },
    method: 'recentProjects.list',
    args: [requestId],
  },
  {
    operation: {
      operation: APP_DATA_COMMANDS.projectRelocateRecent,
      projectId,
      workspacePath: '/tmp/relocated',
    },
    method: 'recentProjects.relocate',
    args: [requestId, projectId, '/tmp/relocated'],
  },
  {
    operation: { operation: APP_DATA_COMMANDS.projectRemoveRecent, projectId },
    method: 'recentProjects.remove',
    args: [requestId, projectId],
  },
] as const;

function method(runtime: ReturnType<typeof appRuntime>, path: string): ReturnType<typeof vi.fn> {
  const [owner, name] = path.split('.');
  return (runtime as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>)[owner]?.[
    name
  ] as ReturnType<typeof vi.fn>;
}

describe('Core utility app-data router exact mapping', () => {
  it.each(appCases)(
    'maps $operation.operation to $method',
    async ({ operation, method: path, args }) => {
      const runtime = appRuntime();
      const result = await executeAppDataOperation(runtime as never, requestId, operation as never);
      expect(result).toMatchObject({ ok: true, operation: operation.operation });
      expect(method(runtime, path)).toHaveBeenCalledOnce();
      expect(method(runtime, path)).toHaveBeenCalledWith(...args);
      const allMethods = [
        runtime.appSettings.get,
        runtime.appSettings.update,
        runtime.appSettings.reset,
        runtime.recentProjects.list,
        runtime.recentProjects.relocate,
        runtime.recentProjects.remove,
      ];
      expect(allMethods.filter((candidate) => candidate.mock.calls.length > 0)).toEqual([
        method(runtime, path),
      ]);
    },
  );

  it('maps synchronous and asynchronous failures without invoking unrelated methods', async () => {
    const synchronous = appRuntime();
    synchronous.appSettings.get.mockImplementationOnce(() => {
      throw new Error('get failed');
    });
    await expect(
      executeAppDataOperation(synchronous as never, requestId, {
        operation: APP_DATA_COMMANDS.settingsGet,
      } as never),
    ).resolves.toEqual({
      ok: false,
      operation: APP_DATA_COMMANDS.settingsGet,
      errorCode: 'COMMON_INTERNAL_999',
    });
    expect(synchronous.appSettings.update).not.toHaveBeenCalled();

    const asynchronous = appRuntime();
    asynchronous.recentProjects.remove.mockRejectedValueOnce(new Error('remove failed'));
    await expect(
      executeAppDataOperation(asynchronous as never, requestId, {
        operation: APP_DATA_COMMANDS.projectRemoveRecent,
        projectId,
      } as never),
    ).resolves.toEqual({
      ok: false,
      operation: APP_DATA_COMMANDS.projectRemoveRecent,
      errorCode: 'COMMON_INTERNAL_999',
    });
    expect(asynchronous.recentProjects.list).not.toHaveBeenCalled();
  });
});

describe('Core utility project router exact order and short-circuiting', () => {
  beforeEach(() => {
    routeState.primary = null;
    routeState.narrative = null;
    routeState.structure = null;
    routeState.content = null;
    routeState.error = undefined;
    routeState.calls.length = 0;
  });

  it.each([
    ['primary', ['primary']],
    ['narrative', ['primary', 'narrative']],
    ['structure', ['primary', 'narrative', 'structure']],
    ['content', ['primary', 'narrative', 'structure', 'content']],
  ] as const)(
    'returns the first %s result and does not invoke later routers',
    async (owner, expectedCalls) => {
      routeState[owner] = { ok: true, operation: owner, data: { owner } };
      await expect(
        executeProjectOperation({} as never, requestId, { operation: owner } as never),
      ).resolves.toMatchObject({ ok: true, operation: owner });
      expect(routeState.calls).toEqual(expectedCalls);
    },
  );

  it('maps unrouted and thrown operations after the exact attempted chain', async () => {
    await expect(
      executeProjectOperation({} as never, requestId, { operation: 'unrouted' } as never),
    ).resolves.toEqual({
      ok: false,
      operation: 'unrouted',
      errorCode: 'COMMON_INTERNAL_999',
    });
    expect(routeState.calls).toEqual(['primary', 'narrative', 'structure', 'content']);

    routeState.calls.length = 0;
    routeState.error = new Error('router failed');
    await expect(
      executeProjectOperation({} as never, requestId, { operation: 'thrown' } as never),
    ).resolves.toEqual({
      ok: false,
      operation: 'thrown',
      errorCode: 'COMMON_INTERNAL_999',
    });
    expect(routeState.calls).toEqual(['primary']);
  });

  it('preserves Draft lock-conflict details only when present', async () => {
    routeState.error = new DraftServiceError({ logicalBlockId: 'block-id' });
    await expect(
      executeProjectOperation({} as never, requestId, { operation: 'locked' } as never),
    ).resolves.toEqual({
      ok: false,
      operation: 'locked',
      errorCode: 'COMMON_INTERNAL_999',
      details: { lockConflict: { logicalBlockId: 'block-id' } },
    });

    routeState.error = new DraftServiceError();
    await expect(
      executeProjectOperation({} as never, requestId, { operation: 'draft-no-details' } as never),
    ).resolves.toEqual({
      ok: false,
      operation: 'draft-no-details',
      errorCode: 'COMMON_INTERNAL_999',
    });
  });
});
