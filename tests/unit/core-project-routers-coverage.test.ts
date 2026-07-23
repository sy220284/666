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

const requestId = 'request-id';
const projectId = 'project-id';
const input = { projectId, chapterId: 'chapter-id', marker: 'input' };
const operationBase = {
  projectId,
  workspacePath: '/tmp/project',
  parentDirectory: '/tmp/parent',
  targetParentDirectory: '/tmp/target',
  targetDirectory: '/tmp/export',
  sourcePath: '/tmp/import.md',
  input,
};

type RecordedCall = { readonly key: string; readonly args: readonly unknown[] };

function createServices() {
  const calls: RecordedCall[] = [];
  const service = (serviceName: string): Record<string, unknown> =>
    new Proxy(
      {},
      {
        get(_target, property) {
          const key = `${serviceName}.${String(property)}`;
          if (property === 'activeProject') {
            calls.push({ key, args: [] });
            return { marker: key };
          }
          return (...args: unknown[]) => {
            calls.push({ key, args });
            if (key === 'recovery.createOperationCheckpoint') return { backupId: 'backup-id' };
            return { marker: key };
          };
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
      checkpointRequestId(value: string) {
        calls.push({ key: 'checkpointRequestId', args: [value] });
        return `${value}:checkpoint`;
      },
    },
  };
}

function operation(name: string): never {
  return { operation: name, ...operationBase } as never;
}

function call(key: string, ...args: unknown[]): RecordedCall {
  return { key, args };
}

const primaryCases: ReadonlyArray<readonly [string, readonly RecordedCall[]]> = [
  [PROJECT_WORKSPACE_COMMANDS.getActive, [call('projectWorkspace.activeProject')]],
  [
    PROJECT_WORKSPACE_COMMANDS.create,
    [call('projectWorkspace.create', requestId, input, '/tmp/parent')],
  ],
  [
    PROJECT_WORKSPACE_COMMANDS.openSelected,
    [call('projectWorkspace.open', requestId, { workspacePath: '/tmp/project' })],
  ],
  [
    PROJECT_WORKSPACE_COMMANDS.openRecent,
    [call('projectWorkspace.open', requestId, { recentProjectId: projectId })],
  ],
  [PROJECT_WORKSPACE_COMMANDS.close, [call('projectWorkspace.close', requestId, projectId)]],
  [
    PROJECT_WORKSPACE_COMMANDS.move,
    [call('projectWorkspace.move', requestId, projectId, '/tmp/target')],
  ],
  [PROJECT_PLANNING_COMMANDS.getBrief, [call('projectPlanning.getBrief', projectId)]],
  [PROJECT_PLANNING_COMMANDS.updateBrief, [call('projectPlanning.updateBrief', requestId, input)]],
  [PROJECT_PLANNING_COMMANDS.listPlotNodes, [call('projectPlanning.listPlotNodes', projectId)]],
  [
    PROJECT_PLANNING_COMMANDS.createPlotNode,
    [call('projectPlanning.createPlotNode', requestId, input)],
  ],
  [
    PROJECT_PLANNING_COMMANDS.updatePlotNode,
    [call('projectPlanning.updatePlotNode', requestId, input)],
  ],
  [
    PROJECT_PLANNING_COMMANDS.movePlotNode,
    [call('projectPlanning.movePlotNode', requestId, input)],
  ],
  [
    PROJECT_PLANNING_COMMANDS.deletePlotNode,
    [call('projectPlanning.deletePlotNode', requestId, input)],
  ],
  [SCENE_BEAT_COMMANDS.listSceneBeats, [call('sceneBeats.list', input)]],
  [SCENE_BEAT_COMMANDS.createSceneBeat, [call('sceneBeats.create', requestId, input)]],
  [SCENE_BEAT_COMMANDS.updateSceneBeat, [call('sceneBeats.update', requestId, input)]],
  [SCENE_BEAT_COMMANDS.moveSceneBeat, [call('sceneBeats.move', requestId, input)]],
  [SCENE_BEAT_COMMANDS.previewMoveSceneBeat, [call('sceneBeats.previewCrossChapterMove', input)]],
  [
    SCENE_BEAT_COMMANDS.moveSceneBeatAcrossChapters,
    [call('sceneBeats.moveAcrossChapters', requestId, input)],
  ],
  [SCENE_BEAT_COMMANDS.deleteSceneBeat, [call('sceneBeats.delete', requestId, input)]],
  [SCENE_BEAT_COMMANDS.restoreSceneBeat, [call('sceneBeats.restore', requestId, input)]],
  [
    SCENE_BEAT_COMMANDS.setSceneBeatBlockLinks,
    [call('sceneBeats.setBlockLinks', requestId, input)],
  ],
  [
    SCENE_BEAT_COMMANDS.convertBlocksToSceneBeat,
    [call('sceneBeats.convertBlocks', requestId, input)],
  ],
  [ENTITY_CANON_COMMANDS.listEntities, [call('entityCanon.list', input)]],
  [ENTITY_CANON_COMMANDS.createEntity, [call('entityCanon.create', requestId, input)]],
  [ENTITY_CANON_COMMANDS.updateEntity, [call('entityCanon.update', requestId, input)]],
  [ENTITY_CANON_COMMANDS.archiveEntity, [call('entityCanon.archive', requestId, input)]],
  [ENTITY_CANON_COMMANDS.setCanonFact, [call('entityCanon.setFact', requestId, input)]],
  [
    ENTITY_CANON_COMMANDS.linkSceneBeatEntity,
    [call('entityCanon.linkSceneBeat', requestId, input)],
  ],
  [ENTITY_CANON_COMMANDS.previewDeleteEntity, [call('entityCanon.previewDelete', input)]],
  [ENTITY_CANON_COMMANDS.deleteEntity, [call('entityCanon.delete', requestId, input)]],
  [CONTINUITY_COMMANDS.list, [call('continuity.list', input)]],
  [CONTINUITY_COMMANDS.setEntityState, [call('continuity.setEntityState', requestId, input)]],
  [
    CONTINUITY_COMMANDS.invalidateEntityState,
    [call('continuity.invalidateEntityState', requestId, input)],
  ],
  [CONTINUITY_COMMANDS.saveTimelineEvent, [call('continuity.saveTimelineEvent', requestId, input)]],
  [
    CONTINUITY_COMMANDS.archiveTimelineEvent,
    [call('continuity.archiveTimelineEvent', requestId, input)],
  ],
  [CONTINUITY_COMMANDS.setKnowledgeState, [call('continuity.setKnowledgeState', requestId, input)]],
  [
    CONTINUITY_COMMANDS.invalidateKnowledgeState,
    [call('continuity.invalidateKnowledgeState', requestId, input)],
  ],
];

const contentCases: ReadonlyArray<readonly [string, readonly RecordedCall[]]> = [
  [DRAFT_COMMANDS.openDraft, [call('drafts.open', requestId, input)]],
  [DRAFT_COMMANDS.applyPatch, [call('drafts.applyPatch', requestId, input)]],
  [CANDIDATE_COMMANDS.createFixtureCandidate, [call('candidates.createFixture', requestId, input)]],
  [CANDIDATE_COMMANDS.listCandidates, [call('candidates.list', input)]],
  [CANDIDATE_COMMANDS.getCandidate, [call('candidates.get', input)]],
  [CANDIDATE_COMMANDS.discardCandidate, [call('candidates.discard', requestId, input)]],
  [
    CANDIDATE_APPLY_COMMANDS.previewCandidate,
    [call('candidateApply.previewProgressively', requestId, input)],
  ],
  [CANDIDATE_APPLY_COMMANDS.cancelPreview, [call('candidateApply.cancelPreview', input)]],
  [CANDIDATE_APPLY_COMMANDS.applyCandidate, [call('candidateApply.apply', requestId, input)]],
  [CANDIDATE_APPLY_COMMANDS.previewUndo, [call('candidateApply.previewUndo', input)]],
  [CANDIDATE_APPLY_COMMANDS.undoApply, [call('candidateApply.undo', requestId, input)]],
  [CANDIDATE_APPLY_COMMANDS.findUndoRecord, [call('candidateApply.findUndoRecord', input)]],
  [VERSION_COMMANDS.createVersion, [call('versions.create', requestId, input)]],
  [VERSION_COMMANDS.listVersions, [call('versions.list', input)]],
  [VERSION_COMMANDS.getVersion, [call('versions.get', input)]],
  [VERSION_COMMANDS.setFinalVersion, [call('versions.setFinal', requestId, input)]],
  [VERSION_COMMANDS.restoreVersion, [call('versions.restore', requestId, input)]],
  [
    RECOVERY_COMMANDS.createCheckpoint,
    [call('recovery.createOperationCheckpoint', requestId, input)],
  ],
  [RECOVERY_COMMANDS.getOverview, [call('recovery.getOverview', projectId)]],
  [
    RECOVERY_COMMANDS.restoreCheckpoint,
    [call('recovery.restoreCheckpoint', requestId, input, '/tmp/target')],
  ],
  [RECOVERY_COMMANDS.exportVersion, [call('recovery.exportVersion', input, '/tmp/export')]],
  [TEXT_IO_COMMANDS.previewImport, [call('textIo.previewImport', input, '/tmp/import.md')]],
  [TEXT_IO_COMMANDS.commitImport, [call('textIo.commitImport', requestId, input)]],
  [TEXT_IO_COMMANDS.listExportVersions, [call('textIo.listExportVersions', projectId)]],
  [TEXT_IO_COMMANDS.exportVersions, [call('textIo.exportVersions', input, '/tmp/export')]],
];

const simpleStructureCases: ReadonlyArray<readonly [string, readonly RecordedCall[]]> = [
  [PROJECT_STRUCTURE_COMMANDS.listStructure, [call('projectStructure.list', projectId)]],
  [
    PROJECT_STRUCTURE_COMMANDS.createVolume,
    [call('projectStructure.createVolume', requestId, input)],
  ],
  [
    PROJECT_STRUCTURE_COMMANDS.updateVolume,
    [call('projectStructure.updateVolume', requestId, input)],
  ],
  [PROJECT_STRUCTURE_COMMANDS.moveVolume, [call('projectStructure.moveVolume', requestId, input)]],
  [
    PROJECT_STRUCTURE_COMMANDS.deleteVolume,
    [call('projectStructure.deleteVolume', requestId, input)],
  ],
  [
    PROJECT_STRUCTURE_COMMANDS.createChapter,
    [call('projectStructure.createChapter', requestId, input)],
  ],
  [
    PROJECT_STRUCTURE_COMMANDS.updateChapter,
    [call('projectStructure.updateChapter', requestId, input)],
  ],
  [
    PROJECT_STRUCTURE_COMMANDS.moveChapter,
    [call('projectStructure.moveChapter', requestId, input)],
  ],
  [
    PROJECT_STRUCTURE_COMMANDS.deleteChapter,
    [call('projectStructure.deleteChapter', requestId, input)],
  ],
  [PROJECT_STRUCTURE_COMMANDS.listTrash, [call('projectStructure.listTrash', projectId)]],
  [
    PROJECT_STRUCTURE_COMMANDS.restoreTrashEntry,
    [call('projectStructure.restoreTrashEntry', requestId, input)],
  ],
  [
    PROJECT_STRUCTURE_COMMANDS.previewPermanentDelete,
    [call('structureOperations.previewPermanentDelete', input)],
  ],
  [
    PROJECT_STRUCTURE_COMMANDS.previewSplitChapter,
    [call('structureOperations.previewSplit', input)],
  ],
  [
    PROJECT_STRUCTURE_COMMANDS.previewMergeChapters,
    [call('structureOperations.previewMerge', input)],
  ],
  [PROJECT_STRUCTURE_COMMANDS.previewMoveBlocks, [call('structureOperations.previewMove', input)]],
];

const destructiveStructureCases: ReadonlyArray<readonly [string, string, string, string]> = [
  [
    PROJECT_STRUCTURE_COMMANDS.permanentDelete,
    'assertPermanentDeleteExecutable',
    'permanent-delete',
    'permanentDelete',
  ],
  [
    PROJECT_STRUCTURE_COMMANDS.splitChapter,
    'assertSplitExecutable',
    'split-chapter',
    'executeSplit',
  ],
  [
    PROJECT_STRUCTURE_COMMANDS.mergeChapters,
    'assertMergeExecutable',
    'merge-chapter',
    'executeMerge',
  ],
  [PROJECT_STRUCTURE_COMMANDS.moveBlocks, 'assertMoveExecutable', 'move-blocks', 'executeMove'],
];

async function verifyCases(
  router: (services: never, requestId: string, operation: never) => Promise<unknown>,
  cases: ReadonlyArray<readonly [string, readonly RecordedCall[]]>,
): Promise<void> {
  for (const [name, expectedCalls] of cases) {
    const harness = createServices();
    const result = (await router(harness.services as never, requestId, operation(name))) as {
      ok: boolean;
      operation: string;
    };
    expect(result).toMatchObject({ ok: true, operation: name });
    expect(harness.calls, name).toEqual(expectedCalls);
  }
}

describe('Core project routers exact operation mapping', () => {
  it('maps every primary operation to one exact service method and argument list', async () => {
    await verifyCases(routePrimaryProjectOperation, primaryCases);
  });

  it('maps every content operation to one exact service method and argument list', async () => {
    await verifyCases(routeContentProjectOperation, contentCases);
  });

  it('maps simple structure operations exactly', async () => {
    await verifyCases(routeStructureProjectOperation, simpleStructureCases);
  });

  it.each(destructiveStructureCases)(
    'maps checkpointed structure operation %s in exact order',
    async (name, assertionMethod, checkpointOperation, executeMethod) => {
      const harness = createServices();
      const result = await routeStructureProjectOperation(
        harness.services as never,
        requestId,
        operation(name),
      );
      expect(result).toMatchObject({ ok: true, operation: name });
      expect(harness.calls).toEqual([
        call(`structureOperations.${assertionMethod}`, input),
        call('checkpointRequestId', requestId),
        call('recovery.createOperationCheckpoint', `${requestId}:checkpoint`, {
          projectId,
          operation: checkpointOperation,
        }),
        call(`structureOperations.${executeMethod}`, requestId, input, 'backup-id'),
      ]);
    },
  );

  it('returns null without touching services for unknown operations', async () => {
    for (const router of [
      routePrimaryProjectOperation,
      routeContentProjectOperation,
      routeStructureProjectOperation,
    ]) {
      const harness = createServices();
      await expect(
        router(harness.services as never, requestId, operation('unknown.operation')),
      ).resolves.toBeNull();
      expect(harness.calls).toEqual([]);
    }
  });
});
