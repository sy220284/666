import path from 'node:path';

import {
  APP_DATA_COMMANDS,
  DRAFT_COMMANDS,
  CANDIDATE_COMMANDS,
  VERSION_COMMANDS,
  RECOVERY_COMMANDS,
  TEXT_IO_COMMANDS,
  PROJECT_STRUCTURE_COMMANDS,
  PROJECT_WORKSPACE_COMMANDS,
  CoreAppDataResultSchema,
  CoreControlMessageSchema,
  CoreProjectResultSchema,
  PROTOCOL_VERSION,
  type CoreEvent,
  type CoreAppDataOperation,
  type CoreAppDataResult,
  type CoreProjectOperation,
  type CoreProjectResult,
  type ErrorCode,
} from '@worldforge/contracts';

import { DatabaseFoundationError } from './database/index.js';
import { openAppRuntime } from './app-runtime.js';
import { AppDataRepositoryError } from './app-data-errors.js';
import { CandidateService, CandidateServiceError } from './candidate.js';
import { DraftService, DraftServiceError } from './draft.js';
import { VersionService, VersionServiceError } from './version.js';
import { RecoveryService, RecoveryServiceError } from './recovery.js';
import { ImportExportService, ImportExportServiceError } from './import-export.js';
import { ProjectWorkspaceError, ProjectWorkspaceService } from './project-workspace.js';
import { ProjectStructureError, ProjectStructureService } from './project-structure.js';
import { TaskCommandRouter, TaskProtocol, type TaskMessagePort } from './task-protocol.js';

interface TransferredPort {
  postMessage(message: unknown): void;
  on(event: 'message', listener: (event: { readonly data: unknown }) => void): void;
  on(event: 'close', listener: () => void): void;
  off(event: 'message', listener: (event: { readonly data: unknown }) => void): void;
  off(event: 'close', listener: () => void): void;
  start(): void;
  close(): void;
}

interface UtilityParentPort {
  on(
    event: 'message',
    listener: (event: {
      readonly data: unknown;
      readonly ports: readonly TransferredPort[];
    }) => void,
  ): void;
  postMessage(message: CoreEvent): void;
}

type UtilityProcess = NodeJS.Process & { readonly parentPort?: UtilityParentPort };

const parentPort = (process as UtilityProcess).parentPort;

if (!parentPort) {
  throw new Error('CORE_PARENT_PORT_UNAVAILABLE');
}

const startedAt = Date.now();
const taskProtocol = new TaskProtocol();
const taskCommands = new TaskCommandRouter(taskProtocol);
let shuttingDown = false;
let acceptingAppDataOperations = true;
const activeAppDataOperations = new Set<Promise<void>>();

function requiredArgument(name: string): string {
  const prefix = `--${name}=`;
  const value = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  if (!value) throw new Error(`CORE_ARGUMENT_MISSING_${name.toUpperCase().replaceAll('-', '_')}`);
  return value;
}

function requiredAbsolutePath(name: string): string {
  const value = requiredArgument(name);
  if (!path.isAbsolute(value)) throw new Error(`CORE_ARGUMENT_PATH_INVALID_${name.toUpperCase()}`);
  return value;
}

const appRuntime = await openAppRuntime({
  databasePath: requiredAbsolutePath('app-database'),
  migrationsDirectory: requiredAbsolutePath('app-migrations'),
  recoveryDirectory: requiredAbsolutePath('app-recovery'),
  appVersion: requiredArgument('app-version'),
});
const projectWorkspace = new ProjectWorkspaceService({
  projectMigrationsDirectory: requiredAbsolutePath('project-migrations'),
  projectMigrationRecoveryDirectory: requiredAbsolutePath('project-migration-recovery'),
  appVersion: requiredArgument('app-version'),
  recentProjects: appRuntime.recentProjects,
});
const recovery = new RecoveryService(projectWorkspace, {
  backupRootDirectory: requiredAbsolutePath('project-operation-recovery'),
});
const projectStructure = new ProjectStructureService(projectWorkspace);
const drafts = new DraftService(projectWorkspace);
const candidates = new CandidateService(projectWorkspace);
const versions = new VersionService(projectWorkspace);
const textIo = new ImportExportService(projectWorkspace, recovery);

function send(message: CoreEvent): void {
  parentPort?.postMessage(message);
}

function adaptPort(port: TransferredPort): TaskMessagePort {
  port.start();
  return {
    postMessage: (message) => port.postMessage(message),
    onMessage: (listener) => {
      const handleMessage = (event: { readonly data: unknown }) => listener(event.data);
      port.on('message', handleMessage);
      return () => port.off('message', handleMessage);
    },
    onClose: (listener) => {
      port.on('close', listener);
      return () => port.off('close', listener);
    },
    close: () => port.close(),
  };
}

function windowPreferencesError(error: unknown): ErrorCode {
  if (error instanceof DatabaseFoundationError) {
    if (error.code === 'DATABASE_READ_ONLY') return 'PROJECT_READ_ONLY_005';
    if (error.code === 'DATABASE_INTEGRITY_FAILED') return 'DB_INTEGRITY_FAILED_003';
    if (error.code === 'MIGRATION_FAILED') return 'DB_MIGRATION_FAILED_005';
    if (error.code === 'MIGRATION_CHECKSUM_MISMATCH') return 'DB_MIGRATION_CHECKSUM_006';
    if (error.code === 'DATABASE_FUTURE_SCHEMA') return 'DB_SCHEMA_UNSUPPORTED_007';
    if (error.code === 'WRITE_QUEUE_CLOSED') return 'DB_WRITE_QUEUE_STOPPED_008';
    if (error.code === 'DATABASE_WRITE_FAILED') return 'DB_BUSY_TIMEOUT_002';
  }
  return 'DB_OPEN_FAILED_001';
}

function appDataError(error: unknown): ErrorCode {
  if (error instanceof AppDataRepositoryError) {
    if (error.code === 'RECENT_PROJECT_NOT_FOUND') return 'COMMON_NOT_FOUND_002';
    if (error.code === 'RECENT_PROJECT_PATH_MISSING') return 'PROJECT_PATH_MISSING_002';
    if (error.code === 'RECENT_PROJECT_PATH_CONFLICT') return 'COMMON_CONFLICT_003';
  }
  if (error instanceof DatabaseFoundationError && error.code === 'REQUEST_ID_INVALID') {
    return 'COMMON_INVALID_INPUT_001';
  }
  if (error instanceof Error && error.name === 'ZodError') return 'COMMON_INVALID_INPUT_001';
  return windowPreferencesError(error);
}

function projectWorkspaceError(error: unknown): ErrorCode {
  if (error instanceof ImportExportServiceError) {
    switch (error.code) {
      case 'IMPORT_FORMAT_UNSUPPORTED':
        return 'IMPORT_FORMAT_UNSUPPORTED_001';
      case 'IMPORT_ENCODING_UNCERTAIN':
        return 'IMPORT_ENCODING_UNCERTAIN_002';
      case 'IMPORT_ARCHIVE_LIMIT':
        return 'IMPORT_ARCHIVE_LIMIT_003';
      case 'IMPORT_CONTENT_EMPTY':
        return 'IMPORT_CONTENT_EMPTY_004';
      case 'IMPORT_PLAN_STALE':
        return 'IMPORT_PLAN_STALE_005';
      case 'IMPORT_COMMIT_FAILED':
        return 'IMPORT_COMMIT_FAILED_006';
      case 'EXPORT_VERSION_REQUIRED':
        return 'EXPORT_VERSION_REQUIRED_001';
      case 'EXPORT_TARGET_EXISTS':
        return 'EXPORT_TARGET_EXISTS_002';
      case 'EXPORT_WRITE_FAILED':
        return 'EXPORT_WRITE_FAILED_003';
    }
  }
  if (error instanceof RecoveryServiceError) {
    switch (error.code) {
      case 'BACKUP_CREATE_FAILED':
        return 'BACKUP_CREATE_FAILED_001';
      case 'BACKUP_VERIFY_FAILED':
        return 'BACKUP_VERIFY_FAILED_002';
      case 'BACKUP_SPACE_LOW':
        return 'BACKUP_SPACE_LOW_003';
      case 'BACKUP_NOT_FOUND':
      case 'RESTORE_SOURCE_INVALID':
        return 'RESTORE_SOURCE_INVALID_001';
      case 'RESTORE_TARGET_CONFLICT':
        return 'RESTORE_TARGET_CONFLICT_002';
      case 'RESTORE_VERIFY_FAILED':
        return 'RESTORE_VERIFY_FAILED_003';
      case 'EXPORT_VERSION_REQUIRED':
        return 'EXPORT_VERSION_REQUIRED_001';
      case 'EXPORT_TARGET_EXISTS':
        return 'EXPORT_TARGET_EXISTS_002';
      case 'EXPORT_WRITE_FAILED':
        return 'EXPORT_WRITE_FAILED_003';
    }
  }
  if (error instanceof CandidateServiceError) {
    switch (error.code) {
      case 'CANDIDATE_NOT_FOUND':
      case 'CANDIDATE_DRAFT_NOT_FOUND':
        return 'COMMON_NOT_FOUND_002';
      case 'CANDIDATE_REVISION_CONFLICT':
      case 'CANDIDATE_SOURCE_CONFLICT':
        return 'CANDIDATE_BASE_CONFLICT_002';
      case 'CANDIDATE_STATUS_CONFLICT':
        return 'CANDIDATE_ALREADY_RESOLVED_001';
      case 'CANDIDATE_INVALID':
        return 'COMMON_INVALID_INPUT_001';
    }
  }
  if (error instanceof VersionServiceError) {
    if (error.code === 'VERSION_NOT_FOUND' || error.code === 'VERSION_DRAFT_NOT_FOUND')
      return 'COMMON_NOT_FOUND_002';
    if (error.code === 'VERSION_REVISION_CONFLICT') return 'DRAFT_REVISION_CONFLICT_001';
    if (error.code === 'VERSION_TITLE_CONFLICT' || error.code === 'VERSION_CHAPTER_MISMATCH')
      return 'COMMON_CONFLICT_003';
  }
  if (error instanceof DraftServiceError) {
    switch (error.code) {
      case 'DRAFT_NOT_FOUND':
        return 'DRAFT_NO_ACTIVE_005';
      case 'DRAFT_BLOCK_NOT_FOUND':
        return 'COMMON_NOT_FOUND_002';
      case 'DRAFT_REVISION_CONFLICT':
        return 'DRAFT_REVISION_CONFLICT_001';
      case 'DRAFT_BLOCK_HASH_CONFLICT':
        return 'DRAFT_BLOCK_HASH_CONFLICT_002';
      case 'DRAFT_PATCH_INVALID':
        return 'DRAFT_PATCH_INVALID_004';
      case 'DRAFT_INVARIANT_FAILED':
        return 'COMMON_CONFLICT_003';
    }
  }
  if (error instanceof ProjectStructureError) {
    if (error.code === 'STRUCTURE_NOT_FOUND') return 'COMMON_NOT_FOUND_002';
    if (error.code === 'STRUCTURE_CONFLICT') return 'COMMON_CONFLICT_003';
    return 'COMMON_INVALID_INPUT_001';
  }
  if (error instanceof ProjectWorkspaceError) {
    switch (error.code) {
      case 'PROJECT_ALREADY_ACTIVE':
        return 'PROJECT_ALREADY_OPEN_001';
      case 'PROJECT_PATH_MISSING':
        return 'PROJECT_PATH_MISSING_002';
      case 'PROJECT_PATH_OUTSIDE_SCOPE':
        return 'PROJECT_PATH_OUTSIDE_SCOPE_003';
      case 'PROJECT_ID_MISMATCH':
        return 'PROJECT_ID_MISMATCH_004';
      case 'PROJECT_READ_ONLY':
      case 'PROJECT_DIRECTORY_READ_ONLY':
        return 'PROJECT_READ_ONLY_005';
      case 'PROJECT_MOVE_FAILED':
        return 'PROJECT_MOVE_FAILED_006';
      case 'PROJECT_TARGET_CONFLICT':
        return 'COMMON_CONFLICT_003';
      case 'PROJECT_MANIFEST_INVALID':
      case 'PROJECT_OPEN_FAILED':
      case 'PROJECT_CREATE_FAILED':
        return 'DB_OPEN_FAILED_001';
    }
  }
  if (error instanceof Error && error.name === 'ZodError') return 'COMMON_INVALID_INPUT_001';
  return windowPreferencesError(error);
}

async function executeAppDataOperation(
  requestId: string,
  operation: CoreAppDataOperation,
): Promise<CoreAppDataResult> {
  try {
    switch (operation.operation) {
      case APP_DATA_COMMANDS.settingsGet:
        return CoreAppDataResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: appRuntime.appSettings.get(),
        });
      case APP_DATA_COMMANDS.settingsSet:
        return CoreAppDataResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await appRuntime.appSettings.update(requestId, operation.settings),
        });
      case APP_DATA_COMMANDS.settingsReset:
        return CoreAppDataResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await appRuntime.appSettings.reset(requestId),
        });
      case APP_DATA_COMMANDS.projectListRecent:
        return CoreAppDataResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: { projects: await appRuntime.recentProjects.list(requestId) },
        });
      case APP_DATA_COMMANDS.projectRelocateRecent:
        return CoreAppDataResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await appRuntime.recentProjects.relocate(
            requestId,
            operation.projectId,
            operation.workspacePath,
          ),
        });
      case APP_DATA_COMMANDS.projectRemoveRecent:
        return CoreAppDataResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: {
            removed: await appRuntime.recentProjects.remove(requestId, operation.projectId),
          },
        });
    }
  } catch (error) {
    return CoreAppDataResultSchema.parse({
      ok: false,
      operation: operation.operation,
      errorCode: appDataError(error),
    });
  }
}

async function executeProjectOperation(
  requestId: string,
  operation: CoreProjectOperation,
): Promise<CoreProjectResult> {
  try {
    switch (operation.operation) {
      case PROJECT_WORKSPACE_COMMANDS.getActive:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: projectWorkspace.activeProject,
        });
      case PROJECT_WORKSPACE_COMMANDS.create:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await projectWorkspace.create(
            requestId,
            operation.input,
            operation.parentDirectory,
          ),
        });
      case PROJECT_WORKSPACE_COMMANDS.openSelected:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await projectWorkspace.open(requestId, {
            workspacePath: operation.workspacePath,
          }),
        });
      case PROJECT_WORKSPACE_COMMANDS.openRecent:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await projectWorkspace.open(requestId, {
            recentProjectId: operation.projectId,
          }),
        });
      case PROJECT_WORKSPACE_COMMANDS.close:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await projectWorkspace.close(requestId, operation.projectId),
        });
      case PROJECT_WORKSPACE_COMMANDS.move:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await projectWorkspace.move(
            requestId,
            operation.projectId,
            operation.targetParentDirectory,
          ),
        });
      case PROJECT_STRUCTURE_COMMANDS.listStructure:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: projectStructure.list(operation.projectId),
        });
      case PROJECT_STRUCTURE_COMMANDS.createVolume:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await projectStructure.createVolume(requestId, operation.input),
        });
      case PROJECT_STRUCTURE_COMMANDS.updateVolume:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await projectStructure.updateVolume(requestId, operation.input),
        });
      case PROJECT_STRUCTURE_COMMANDS.moveVolume:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await projectStructure.moveVolume(requestId, operation.input),
        });
      case PROJECT_STRUCTURE_COMMANDS.deleteVolume:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await projectStructure.deleteVolume(requestId, operation.input),
        });
      case PROJECT_STRUCTURE_COMMANDS.createChapter:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await projectStructure.createChapter(requestId, operation.input),
        });
      case PROJECT_STRUCTURE_COMMANDS.updateChapter:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await projectStructure.updateChapter(requestId, operation.input),
        });
      case PROJECT_STRUCTURE_COMMANDS.moveChapter:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await projectStructure.moveChapter(requestId, operation.input),
        });
      case PROJECT_STRUCTURE_COMMANDS.deleteChapter:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await projectStructure.deleteChapter(requestId, operation.input),
        });
      case PROJECT_STRUCTURE_COMMANDS.listTrash:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: projectStructure.listTrash(operation.projectId),
        });
      case PROJECT_STRUCTURE_COMMANDS.restoreTrashEntry:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await projectStructure.restoreTrashEntry(requestId, operation.input),
        });
      case DRAFT_COMMANDS.openDraft:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await drafts.open(requestId, operation.input),
        });
      case DRAFT_COMMANDS.applyPatch:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await drafts.applyPatch(requestId, operation.input),
        });
      case CANDIDATE_COMMANDS.createFixtureCandidate:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await candidates.createFixture(requestId, operation.input),
        });
      case CANDIDATE_COMMANDS.listCandidates:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: candidates.list(operation.input),
        });
      case CANDIDATE_COMMANDS.getCandidate:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: candidates.get(operation.input),
        });
      case CANDIDATE_COMMANDS.discardCandidate:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await candidates.discard(requestId, operation.input),
        });
      case VERSION_COMMANDS.createVersion:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await versions.create(requestId, operation.input),
        });
      case VERSION_COMMANDS.listVersions:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: versions.list(operation.input),
        });
      case VERSION_COMMANDS.getVersion:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: versions.get(operation.input),
        });
      case VERSION_COMMANDS.setFinalVersion:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await versions.setFinal(requestId, operation.input),
        });
      case VERSION_COMMANDS.restoreVersion:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await versions.restore(requestId, operation.input),
        });
      case RECOVERY_COMMANDS.createCheckpoint:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await recovery.createOperationCheckpoint(requestId, operation.input),
        });
      case RECOVERY_COMMANDS.getOverview:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await recovery.getOverview(operation.input.projectId),
        });
      case RECOVERY_COMMANDS.restoreCheckpoint:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await recovery.restoreCheckpoint(
            requestId,
            operation.input,
            operation.targetParentDirectory,
          ),
        });
      case RECOVERY_COMMANDS.exportVersion:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await recovery.exportVersion(operation.input, operation.targetDirectory),
        });
      case TEXT_IO_COMMANDS.previewImport:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await textIo.previewImport(operation.input, operation.sourcePath),
        });
      case TEXT_IO_COMMANDS.commitImport:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await textIo.commitImport(requestId, operation.input),
        });
      case TEXT_IO_COMMANDS.listExportVersions:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: textIo.listExportVersions(operation.input.projectId),
        });
      case TEXT_IO_COMMANDS.exportVersions:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await textIo.exportVersions(operation.input, operation.targetDirectory),
        });
    }
  } catch (error) {
    return CoreProjectResultSchema.parse({
      ok: false,
      operation: operation.operation,
      errorCode: projectWorkspaceError(error),
    });
  }
}

parentPort.on('message', ({ data, ports }) => {
  const parsed = CoreControlMessageSchema.safeParse(data);
  if (!parsed.success) return;

  switch (parsed.data.type) {
    case 'core.ping':
      send({
        type: 'core.health',
        protocolVersion: PROTOCOL_VERSION,
        requestId: parsed.data.requestId,
        status: 'healthy',
        uptimeMs: Math.max(0, Date.now() - startedAt),
      });
      break;
    case 'core.command':
      send({
        type: 'core.command-result',
        protocolVersion: PROTOCOL_VERSION,
        requestId: parsed.data.requestId,
        result: taskCommands.execute(parsed.data.envelope),
      });
      break;
    case 'core.attach-task-port': {
      const port = ports[0];
      if (!port || ports.length !== 1) return;
      taskProtocol.attachPort(adaptPort(port), parsed.data.connection.projectId);
      break;
    }
    case 'core.window-preferences.get':
      try {
        send({
          type: 'core.window-preferences-result',
          protocolVersion: PROTOCOL_VERSION,
          requestId: parsed.data.requestId,
          result: { ok: true, preferences: appRuntime.windowPreferences.get() },
        });
      } catch (error) {
        send({
          type: 'core.window-preferences-result',
          protocolVersion: PROTOCOL_VERSION,
          requestId: parsed.data.requestId,
          result: { ok: false, errorCode: windowPreferencesError(error) },
        });
      }
      break;
    case 'core.window-preferences.set': {
      const requestId = parsed.data.requestId;
      void appRuntime.windowPreferences
        .save(requestId, parsed.data.preferences)
        .then((preferences) => {
          send({
            type: 'core.window-preferences-result',
            protocolVersion: PROTOCOL_VERSION,
            requestId,
            result: { ok: true, preferences },
          });
        })
        .catch((error: unknown) => {
          send({
            type: 'core.window-preferences-result',
            protocolVersion: PROTOCOL_VERSION,
            requestId,
            result: { ok: false, errorCode: windowPreferencesError(error) },
          });
        });
      break;
    }
    case 'core.app-data.command': {
      const requestId = parsed.data.requestId;
      const operation = parsed.data.operation;
      if (!acceptingAppDataOperations) {
        send({
          type: 'core.app-data.result',
          protocolVersion: PROTOCOL_VERSION,
          requestId,
          result: CoreAppDataResultSchema.parse({
            ok: false,
            operation: operation.operation,
            errorCode: 'COMMON_CANCELLED_004',
          }),
        });
        break;
      }
      const active = executeAppDataOperation(requestId, operation)
        .then((result) => {
          send({
            type: 'core.app-data.result',
            protocolVersion: PROTOCOL_VERSION,
            requestId,
            result,
          });
        })
        .finally(() => activeAppDataOperations.delete(active));
      activeAppDataOperations.add(active);
      break;
    }
    case 'core.project.command': {
      const requestId = parsed.data.requestId;
      const operation = parsed.data.operation;
      if (!acceptingAppDataOperations) {
        send({
          type: 'core.project.result',
          protocolVersion: PROTOCOL_VERSION,
          requestId,
          result: CoreProjectResultSchema.parse({
            ok: false,
            operation: operation.operation,
            errorCode: 'COMMON_CANCELLED_004',
          }),
        });
        break;
      }
      const active = executeProjectOperation(requestId, operation)
        .then((result) => {
          send({
            type: 'core.project.result',
            protocolVersion: PROTOCOL_VERSION,
            requestId,
            result,
          });
        })
        .finally(() => activeAppDataOperations.delete(active));
      activeAppDataOperations.add(active);
      break;
    }
    case 'core.drain': {
      acceptingAppDataOperations = false;
      const requestId = parsed.data.requestId;
      void Promise.all([taskProtocol.beginDrain(), ...activeAppDataOperations]).then(() => {
        send({
          type: 'core.drained',
          protocolVersion: PROTOCOL_VERSION,
          requestId,
          pendingTasks: 0,
        });
      });
      break;
    }
    case 'core.shutdown': {
      if (
        taskProtocol.accepting ||
        taskProtocol.activeTaskCount > 0 ||
        acceptingAppDataOperations ||
        activeAppDataOperations.size > 0 ||
        shuttingDown
      ) {
        return;
      }
      shuttingDown = true;
      taskProtocol.close();
      const requestId = parsed.data.requestId;
      void projectWorkspace
        .shutdown()
        .then(() => appRuntime.close())
        .then(() => {
          send({
            type: 'core.shutdown-complete',
            protocolVersion: PROTOCOL_VERSION,
            requestId,
          });
          setImmediate(() => process.exit(0));
        })
        .catch(() => process.exit(1));
      break;
    }
  }
});

send({
  type: 'core.ready',
  protocolVersion: PROTOCOL_VERSION,
  startedAt: new Date(startedAt).toISOString(),
});
