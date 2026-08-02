import { openAppRuntime } from './app-runtime.js';
import { CandidateApplyService } from './candidate-apply.js';
import { CandidateService } from './candidate.js';
import { CheckpointAwareRecoveryService } from './checkpoint-aware-recovery.js';
import { ContinuityService } from './continuity.js';
import { HardenedConstraintPackageService } from './constraint-package-hardening.js';
import { CoordinatedImportExportService } from './coordinated-import-export.js';
import { DraftService } from './draft.js';
import { EntityCanonService } from './entity-canon.js';
import { GenerationRunService } from './generation-run.js';
import { GenerationRuntime } from './generation-runtime.js';
import { GenerationSourceResolver } from './generation-source-resolver.js';
import { ProjectContinuationService } from './project-continuation.js';
import { ProjectPlanningService } from './project-planning.js';
import { ProjectStructureService } from './project-structure.js';
import { ProjectWorkspaceService } from './project-workspace.js';
import { ReferenceAwareStructureOperationService } from './reference-aware-structure-operations.js';
import { RhythmService } from './rhythm.js';
import { SceneBeatService } from './scene-beat.js';
import { SearchToolsService } from './search-tools.js';
import { StateProposalService } from './state-proposal.js';
import type { TaskProtocol } from './task-protocol.js';
import type { UtilityGenerationServices } from './utility-generation-router.js';
import type { UtilityProjectServices } from './utility-project-services.js';
import { ValidationService } from './validation.js';
import { VersionService } from './version.js';

interface UtilityStartupArguments {
  requiredArgument(name: string): string;
  requiredAbsolutePath(name: string): string;
}

export interface UtilityServiceContainerOptions extends UtilityStartupArguments {
  readonly taskProtocol: TaskProtocol;
  readonly checkpointRequestId: (requestId: string) => string;
}

export async function openUtilityServiceContainer(options: UtilityServiceContainerOptions) {
  const appRuntime = await openAppRuntime({
    databasePath: options.requiredAbsolutePath('app-database'),
    migrationsDirectory: options.requiredAbsolutePath('app-migrations'),
    recoveryDirectory: options.requiredAbsolutePath('app-recovery'),
    appVersion: options.requiredArgument('app-version'),
  });
  const projectWorkspace = new ProjectWorkspaceService({
    projectMigrationsDirectory: options.requiredAbsolutePath('project-migrations'),
    projectMigrationRecoveryDirectory: options.requiredAbsolutePath('project-migration-recovery'),
    appVersion: options.requiredArgument('app-version'),
    recentProjects: appRuntime.recentProjects,
  });
  const recovery = new CheckpointAwareRecoveryService(projectWorkspace, {
    backupRootDirectory: options.requiredAbsolutePath('project-operation-recovery'),
  });
  const generationRuns = new GenerationRunService(projectWorkspace);
  const generationRuntime = new GenerationRuntime(generationRuns, options.taskProtocol);
  const candidates = new CandidateService(projectWorkspace);
  const stateProposals = new StateProposalService(projectWorkspace);
  const validation = new ValidationService(projectWorkspace);
  const searchTools = new SearchToolsService(
    projectWorkspace,
    recovery,
    options.checkpointRequestId,
  );
  const generationServices: UtilityGenerationServices = {
    constraints: new HardenedConstraintPackageService(projectWorkspace),
    runs: generationRuns,
    runtime: generationRuntime,
    sources: new GenerationSourceResolver(projectWorkspace, candidates),
    stateProposals,
    validation,
  };
  const services: UtilityProjectServices = {
    projectWorkspace,
    projectContinuation: new ProjectContinuationService(projectWorkspace),
    recovery,
    projectStructure: new ProjectStructureService(projectWorkspace),
    projectPlanning: new ProjectPlanningService(projectWorkspace),
    sceneBeats: new SceneBeatService(projectWorkspace),
    entityCanon: new EntityCanonService(projectWorkspace),
    continuity: new ContinuityService(projectWorkspace),
    structureOperations: new ReferenceAwareStructureOperationService(projectWorkspace),
    drafts: new DraftService(projectWorkspace),
    candidates,
    candidateApply: new CandidateApplyService(projectWorkspace),
    versions: new VersionService(projectWorkspace),
    textIo: new CoordinatedImportExportService(projectWorkspace, recovery),
    searchTools,
    rhythm: new RhythmService(projectWorkspace),
    checkpointRequestId: options.checkpointRequestId,
  };

  return {
    appRuntime,
    projectWorkspace,
    generationRuns,
    generationServices,
    services,
  };
}

export type UtilityServiceContainer = Awaited<ReturnType<typeof openUtilityServiceContainer>>;
