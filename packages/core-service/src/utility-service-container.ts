import { openAppRuntime } from './app-runtime.js';
import { CheckpointAwareRecoveryService } from './checkpoint-aware-recovery.js';
import type { ProjectTaskProtocol } from './project-task-protocol.js';
import { ProjectWorkspaceService } from './project-workspace.js';
import { createUtilityGenerationServiceContainer } from './utility-generation-service-container.js';
import { createUtilityProjectServiceContainer } from './utility-project-service-container.js';

interface UtilityStartupArguments {
  requiredArgument(name: string): string;
  requiredAbsolutePath(name: string): string;
}

export interface UtilityServiceContainerOptions extends UtilityStartupArguments {
  readonly taskProtocol: ProjectTaskProtocol;
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
    taskDrain: options.taskProtocol,
  });
  const recovery = new CheckpointAwareRecoveryService(projectWorkspace, {
    backupRootDirectory: options.requiredAbsolutePath('project-operation-recovery'),
  });
  const { generationRuns, candidates, generationServices } =
    createUtilityGenerationServiceContainer(projectWorkspace, options.taskProtocol);
  const services = createUtilityProjectServiceContainer({
    projectWorkspace,
    recovery,
    candidates,
    checkpointRequestId: options.checkpointRequestId,
  });

  return {
    appRuntime,
    projectWorkspace,
    generationRuns,
    generationServices,
    services,
  };
}

export type UtilityServiceContainer = Awaited<ReturnType<typeof openUtilityServiceContainer>>;
