import { beforeEach, describe, expect, it, vi } from 'vitest';

const routeState = vi.hoisted(() => ({
  primary: null as unknown,
  narrative: null as unknown,
  structure: null as unknown,
  content: null as unknown,
  error: undefined as Error | undefined,
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
    if (routeState.error) throw routeState.error;
    return routeState.primary;
  },
}));
vi.mock('../../packages/core-service/src/utility-project-narrative-router.js', () => ({
  routeNarrativePlanningOperation: async () => routeState.narrative,
}));
vi.mock('../../packages/core-service/src/utility-project-structure-router.js', () => ({
  routeStructureProjectOperation: async () => routeState.structure,
}));
vi.mock('../../packages/core-service/src/utility-project-content-router.js', () => ({
  routeContentProjectOperation: async () => routeState.content,
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

function appRuntime() {
  return {
    appSettings: {
      get: vi.fn(() => ({ theme: 'dark' })),
      update: vi.fn(async () => ({ theme: 'light' })),
      reset: vi.fn(async () => ({ theme: 'system' })),
    },
    recentProjects: {
      list: vi.fn(async () => [{ projectId: 'project' }]),
      relocate: vi.fn(async () => ({ projectId: 'project' })),
      remove: vi.fn(async () => true),
    },
  };
}

function appOperation(name: string): never {
  return {
    operation: name,
    settings: { themeId: 'theme-a' },
    projectId: 'project-id',
    workspacePath: '/tmp/project',
  } as never;
}

function projectOperation(name = 'project.operation'): never {
  return { operation: name } as never;
}

describe('Core utility app-data router coverage', () => {
  it('routes every app-data operation', async () => {
    const runtime = appRuntime();
    for (const name of Object.values(APP_DATA_COMMANDS)) {
      await expect(
        executeAppDataOperation(runtime as never, 'request-id', appOperation(name)),
      ).resolves.toMatchObject({ ok: true, operation: name });
    }
    expect(runtime.appSettings.get).toHaveBeenCalled();
    expect(runtime.appSettings.update).toHaveBeenCalled();
    expect(runtime.appSettings.reset).toHaveBeenCalled();
    expect(runtime.recentProjects.list).toHaveBeenCalled();
    expect(runtime.recentProjects.relocate).toHaveBeenCalled();
    expect(runtime.recentProjects.remove).toHaveBeenCalled();
  });

  it('maps synchronous and asynchronous app-data failures', async () => {
    const synchronous = appRuntime();
    synchronous.appSettings.get.mockImplementationOnce(() => {
      throw new Error('get failed');
    });
    await expect(
      executeAppDataOperation(
        synchronous as never,
        'request-id',
        appOperation(APP_DATA_COMMANDS.settingsGet),
      ),
    ).resolves.toEqual({
      ok: false,
      operation: APP_DATA_COMMANDS.settingsGet,
      errorCode: 'COMMON_INTERNAL_999',
    });

    const asynchronous = appRuntime();
    asynchronous.recentProjects.remove.mockRejectedValueOnce(new Error('remove failed'));
    await expect(
      executeAppDataOperation(
        asynchronous as never,
        'request-id',
        appOperation(APP_DATA_COMMANDS.projectRemoveRecent),
      ),
    ).resolves.toMatchObject({ ok: false, errorCode: 'COMMON_INTERNAL_999' });
  });
});

describe('Core utility project router coverage', () => {
  beforeEach(() => {
    routeState.primary = null;
    routeState.narrative = null;
    routeState.structure = null;
    routeState.content = null;
    routeState.error = undefined;
  });

  it.each(['primary', 'narrative', 'structure', 'content'] as const)(
    'returns the first result from %s router',
    async (owner) => {
      routeState[owner] = { ok: true, operation: owner, data: { owner } };
      await expect(
        executeProjectOperation({} as never, 'request-id', projectOperation(owner)),
      ).resolves.toMatchObject({ ok: true, operation: owner });
    },
  );

  it('maps unrouted and thrown operations', async () => {
    await expect(
      executeProjectOperation({} as never, 'request-id', projectOperation('unrouted')),
    ).resolves.toEqual({
      ok: false,
      operation: 'unrouted',
      errorCode: 'COMMON_INTERNAL_999',
    });

    routeState.error = new Error('router failed');
    await expect(
      executeProjectOperation({} as never, 'request-id', projectOperation('thrown')),
    ).resolves.toMatchObject({ ok: false, operation: 'thrown' });
  });

  it('preserves Draft lock-conflict details only when present', async () => {
    routeState.error = new DraftServiceError({ logicalBlockId: 'block-id' });
    await expect(
      executeProjectOperation({} as never, 'request-id', projectOperation('locked')),
    ).resolves.toEqual({
      ok: false,
      operation: 'locked',
      errorCode: 'COMMON_INTERNAL_999',
      details: { lockConflict: { logicalBlockId: 'block-id' } },
    });

    routeState.error = new DraftServiceError();
    await expect(
      executeProjectOperation({} as never, 'request-id', projectOperation('draft-no-details')),
    ).resolves.toEqual({
      ok: false,
      operation: 'draft-no-details',
      errorCode: 'COMMON_INTERNAL_999',
    });
  });
});
