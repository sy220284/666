import { createHash } from 'node:crypto';
import path from 'node:path';

import {
  CoreAppDataResultSchema,
  CoreControlMessageSchema,
  CoreProjectResultSchema,
  PROTOCOL_VERSION,
  type CoreEvent,
} from '@worldforge/contracts';

import { openAppRuntime } from './app-runtime.js';
import { CandidateApplyService } from './candidate-apply.js';
import { CandidateService } from './candidate.js';
import { CheckpointAwareRecoveryService } from './checkpoint-aware-recovery.js';
import { ContinuityService } from './continuity.js';
import { CoordinatedImportExportService } from './coordinated-import-export.js';
import { DraftService } from './draft.js';
import { EntityCanonService } from './entity-canon.js';
import { ProjectPlanningService } from './project-planning.js';
import { ProjectStructureService } from './project-structure.js';
import { ProjectWorkspaceService } from './project-workspace.js';
import { ReferenceAwareStructureOperationService } from './reference-aware-structure-operations.js';
import { SceneBeatService } from './scene-beat.js';
import { TaskCommandRouter, TaskProtocol, type TaskMessagePort } from './task-protocol.js';
import { executeAppDataOperation } from './utility-app-data-router.js';
import { windowPreferencesError } from './utility-errors.js';
import { executeProjectOperation } from './utility-project-router.js';
import type { UtilityProjectServices } from './utility-project-services.js';
import { VersionService } from './version.js';

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

const parentPortCandidate = (process as UtilityProcess).parentPort;
if (!parentPortCandidate) throw new Error('CORE_PARENT_PORT_UNAVAILABLE');
const parentPort: UtilityParentPort = parentPortCandidate;

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

function checkpointRequestId(requestId: string): string {
  const hex = createHash('sha256')
    .update(`${requestId}:checkpoint`, 'utf8')
    .digest('hex')
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function send(message: CoreEvent): void {
  parentPort.postMessage(message);
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

function track(operation: Promise<void>): void {
  activeAppDataOperations.add(operation);
  void operation.finally(() => activeAppDataOperations.delete(operation));
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
const recovery = new CheckpointAwareRecoveryService(projectWorkspace, {
  backupRootDirectory: requiredAbsolutePath('project-operation-recovery'),
});
const services: UtilityProjectServices = {
  projectWorkspace,
  recovery,
  projectStructure: new ProjectStructureService(projectWorkspace),
  projectPlanning: new ProjectPlanningService(projectWorkspace),
  sceneBeats: new SceneBeatService(projectWorkspace),
  entityCanon: new EntityCanonService(projectWorkspace),
  continuity: new ContinuityService(projectWorkspace),
  structureOperations: new ReferenceAwareStructureOperationService(projectWorkspace),
  drafts: new DraftService(projectWorkspace),
  candidates: new CandidateService(projectWorkspace),
  candidateApply: new CandidateApplyService(projectWorkspace),
  versions: new VersionService(projectWorkspace),
  textIo: new CoordinatedImportExportService(projectWorkspace, recovery),
  checkpointRequestId,
};

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
      track(
        executeAppDataOperation(appRuntime, requestId, operation).then((result) => {
          send({
            type: 'core.app-data.result',
            protocolVersion: PROTOCOL_VERSION,
            requestId,
            result,
          });
        }),
      );
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
      track(
        executeProjectOperation(services, requestId, operation).then((result) => {
          send({
            type: 'core.project.result',
            protocolVersion: PROTOCOL_VERSION,
            requestId,
            result,
          });
        }),
      );
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
