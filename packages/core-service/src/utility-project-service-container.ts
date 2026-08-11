import { CandidateApplyService } from './candidate-apply.js';
import type { CandidateService } from './candidate.js';
import { ContinuityService } from './continuity.js';
import { CoordinatedImportExportService } from './coordinated-import-export.js';
import { DraftService } from './draft.js';
import { EntityCanonService } from './entity-canon.js';
import { ProjectContinuationService } from './project-continuation.js';
import { ProjectPlanningService } from './project-planning.js';
import { ProjectStructureService } from './project-structure.js';
import type { ProjectWorkspaceService } from './project-workspace.js';
import { ReferenceAwareStructureOperationService } from './reference-aware-structure-operations.js';
import type { RecoveryService } from './recovery.js';
import { RhythmService } from './rhythm.js';
import { SceneBeatService } from './scene-beat.js';
import { SearchToolsService } from './search-tools.js';
import { StoryKnowledgeProjectionService } from './story-knowledge-service.js';
import type { UtilityProjectServices } from './utility-project-services.js';
import { VersionService } from './version.js';

export interface UtilityProjectServiceContainerOptions {
  readonly projectWorkspace: ProjectWorkspaceService;
  readonly recovery: RecoveryService;
  readonly candidates: CandidateService;
  readonly checkpointRequestId: (requestId: string) => string;
}

export function createUtilityProjectServiceContainer(
  options: UtilityProjectServiceContainerOptions,
): UtilityProjectServices {
  const { projectWorkspace, recovery, candidates, checkpointRequestId } = options;
  const searchTools = new SearchToolsService(projectWorkspace, recovery, checkpointRequestId);

  return {
    projectWorkspace,
    projectContinuation: new ProjectContinuationService(projectWorkspace),
    recovery,
    projectStructure: new ProjectStructureService(projectWorkspace),
    projectPlanning: new ProjectPlanningService(projectWorkspace),
    sceneBeats: new SceneBeatService(projectWorkspace),
    entityCanon: new EntityCanonService(projectWorkspace),
    continuity: new ContinuityService(projectWorkspace),
    storyKnowledge: new StoryKnowledgeProjectionService(projectWorkspace),
    structureOperations: new ReferenceAwareStructureOperationService(projectWorkspace),
    drafts: new DraftService(projectWorkspace),
    candidates,
    candidateApply: new CandidateApplyService(projectWorkspace),
    versions: new VersionService(projectWorkspace),
    textIo: new CoordinatedImportExportService(projectWorkspace, recovery),
    searchTools,
    rhythm: new RhythmService(projectWorkspace),
    checkpointRequestId,
  };
}
