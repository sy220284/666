import type { CandidateApplyService } from './candidate-apply.js';
import type { CandidateService } from './candidate.js';
import type { ContinuityService } from './continuity.js';
import type { DraftService } from './draft.js';
import type { EntityCanonService } from './entity-canon.js';
import type { ImportExportService } from './import-export.js';
import type { NarrativePlanningService } from './narrative-planning.js';
import type { ProjectPlanningService } from './project-planning.js';
import type { ProjectStructureService } from './project-structure.js';
import type { ProjectWorkspaceService } from './project-workspace.js';
import type { RecoveryService } from './recovery.js';
import type { SceneBeatService } from './scene-beat.js';
import type { StructureOperationService } from './structure-operations.js';
import type { VersionService } from './version.js';

export interface UtilityProjectServices {
  readonly projectWorkspace: ProjectWorkspaceService;
  readonly projectStructure: ProjectStructureService;
  readonly projectPlanning: ProjectPlanningService;
  readonly sceneBeats: SceneBeatService;
  readonly entityCanon: EntityCanonService;
  readonly continuity: ContinuityService;
  readonly narrativePlanning: NarrativePlanningService;
  readonly structureOperations: StructureOperationService;
  readonly drafts: DraftService;
  readonly candidates: CandidateService;
  readonly candidateApply: CandidateApplyService;
  readonly versions: VersionService;
  readonly recovery: RecoveryService;
  readonly textIo: ImportExportService;
  readonly checkpointRequestId: (requestId: string) => string;
}
