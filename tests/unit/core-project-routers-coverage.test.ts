import { describe, expect, it, vi } from 'vitest';

vi.mock('@worldforge/contracts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    CoreProjectResultSchema: { parse: (input: unknown) => input },
  };
});

import {
  CANDIDATE_APPLY_COMMANDS,
  CANDIDATE_COMMANDS,
  CONTINUITY_COMMANDS,
  DRAFT_COMMANDS,
  ENTITY_CANON_COMMANDS,
  PROJECT_PLANNING_COMMANDS,
  PROJECT_STRUCTURE_COMMANDS,
  PROJECT_WORKSPACE_COMMANDS,
  RECOVERY_COMMANDS,
  SCENE_BEAT_COMMANDS,
  TEXT_IO_COMMANDS,
  VERSION_COMMANDS,
} from '@worldforge/contracts';
import { routeContentProjectOperation } from '../../packages/core-service/src/utility-project-content-router.js';
import { routePrimaryProjectOperation } from '../../packages/core-service/src/utility-project-primary-router.js';
import { routeStructureProjectOperation } from '../../packages/core-service/src/utility-project-structure-router.js';

interface ServiceHarness {
  readonly services: Record<string, unknown>;
  readonly calls: Map<string, ReturnType<typeof vi.fn>>;
}

function createServices(): ServiceHarness {
  const calls = new Map<string, ReturnType<typeof vi.fn>>();
  const service = (serviceName: string): Record<string, unknown> =>
    new Proxy(
      {},
      {
        get(_target, property) {
          if (property === 'activeProject') return { projectId: 'active-project' };
          const key = `${serviceName}.${String(property)}`;
          let fn = calls.get(key);
          if (!fn) {
            fn = vi.fn((..._arguments: unknown[]) =>
              property === 'createOperationCheckpoint'
                ? Promise.resolve({ backupId: 'backup-id' })
                : Promise.resolve({ key }),
            );
            calls.set(key, fn);
          }
          return fn;
        },
      },
    );
  return {
    calls,
    services: {
      projectWorkspace: service('projectWorkspace'),
      projectPlanning: service('projectPlanning'),
      sceneBeats: service('sceneBeats'),
      entityCanon: service('entityCanon'),
      continuity: service('continuity'),
      projectStructure: service('projectStructure'),
      structureOperations: service('structureOperations'),
      recovery: service('recovery'),
      drafts: service('drafts'),
      candidates: service('candidates'),
      candidateApply: service('candidateApply'),
      versions: service('versions'),
      textIo: service('textIo'),
      checkpointRequestId: vi.fn((requestId: string) => `${requestId}:checkpoint`),
    },
  };
}

function operation(name: string): never {
  return {
    operation: name,
    projectId: 'project-id',
    workspacePath: '/tmp/project',
    parentDirectory: '/tmp/parent',
    targetParentDirectory: '/tmp/target',
    targetDirectory: '/tmp/export',
    sourcePath: '/tmp/import.md',
    input: {
      projectId: 'project-id',
      chapterId: 'chapter-id',
      candidateId: 'candidate-id',
    },
  } as never;
}

async function expectRouted(
  router: (services: never, requestId: string, value: never) => Promise<unknown>,
  services: Record<string, unknown>,
  names: readonly string[],
): Promise<void> {
  for (const name of names) {
    const result = (await router(services as never, 'request-id', operation(name))) as {
      ok: boolean;
      operation: string;
    };
    expect(result).toMatchObject({ ok: true, operation: name });
  }
}

describe('Core project primary router coverage', () => {
  it('routes every workspace, planning, scene, entity and continuity operation', async () => {
    const harness = createServices();
    await expectRouted(routePrimaryProjectOperation, harness.services, [
      ...Object.values(PROJECT_WORKSPACE_COMMANDS),
      ...Object.values(PROJECT_PLANNING_COMMANDS),
      ...Object.values(SCENE_BEAT_COMMANDS),
      ...Object.values(ENTITY_CANON_COMMANDS),
      ...Object.values(CONTINUITY_COMMANDS),
    ]);
    expect(harness.calls.size).toBeGreaterThan(20);
  });

  it('returns null for an operation owned by another router', async () => {
    expect(
      await routePrimaryProjectOperation(
        createServices().services as never,
        'request-id',
        operation('unknown.operation'),
      ),
    ).toBeNull();
  });
});

describe('Core project content router coverage', () => {
  it('routes every draft, candidate, version, recovery and text-I/O operation', async () => {
    const harness = createServices();
    await expectRouted(routeContentProjectOperation, harness.services, [
      ...Object.values(DRAFT_COMMANDS),
      ...Object.values(CANDIDATE_COMMANDS),
      ...Object.values(CANDIDATE_APPLY_COMMANDS),
      ...Object.values(VERSION_COMMANDS),
      ...Object.values(RECOVERY_COMMANDS),
      ...Object.values(TEXT_IO_COMMANDS),
    ]);
    expect(harness.calls.size).toBeGreaterThan(12);
  });

  it('returns null for an operation owned by another router', async () => {
    expect(
      await routeContentProjectOperation(
        createServices().services as never,
        'request-id',
        operation('unknown.operation'),
      ),
    ).toBeNull();
  });
});

describe('Core project structure router coverage', () => {
  it('routes every structure operation including checkpointed destructive commands', async () => {
    const harness = createServices();
    await expectRouted(
      routeStructureProjectOperation,
      harness.services,
      Object.values(PROJECT_STRUCTURE_COMMANDS),
    );
    expect(harness.calls.get('recovery.createOperationCheckpoint')).toHaveBeenCalledTimes(4);
    expect(harness.calls.get('structureOperations.assertPermanentDeleteExecutable')).toHaveBeenCalled();
    expect(harness.calls.get('structureOperations.assertSplitExecutable')).toHaveBeenCalled();
    expect(harness.calls.get('structureOperations.assertMergeExecutable')).toHaveBeenCalled();
    expect(harness.calls.get('structureOperations.assertMoveExecutable')).toHaveBeenCalled();
  });

  it('returns null for an unknown operation', async () => {
    expect(
      await routeStructureProjectOperation(
        createServices().services as never,
        'request-id',
        operation('unknown.operation'),
      ),
    ).toBeNull();
  });
});
