import type {
  BackupCleanupPreview,
  BackupPolicy,
  BackupRecord,
  RecoveryCleanupApplyInput,
  RecoveryCleanupResult,
  RecoveryCreateInput,
  RecoveryDailyBackupInput,
  RecoveryExportInput,
  RecoveryNamedSnapshotInput,
  RecoveryOverview,
  RecoveryPolicyUpdateInput,
  RecoveryProtectionInput,
  RecoveryRestoreInput,
  RecoveryRestoredProject,
  RecoveryVersionExport,
} from '@worldforge/contracts';

import type { ProjectWorkspaceService } from '../project-workspace.js';
import { stableJson } from '../stable-json.js';
import { BackupCreateOperations } from './backup-create.js';
import { BackupRestoreOperations } from './backup-restore.js';
import {
  RecoveryServiceError,
  createRecoveryRuntime,
  type RecoveryServiceErrorCode,
  type RecoveryServiceOptions,
} from './backup-manifest.js';
import { IdempotentBackupCleanupOperations } from './idempotent-cleanup.js';
import { VersionExportOperations } from './version-export.js';

export { RecoveryServiceError };
export type { RecoveryServiceErrorCode, RecoveryServiceOptions };

interface RecoveryCommandEntry {
  readonly fingerprint: string;
  readonly promise: Promise<unknown>;
  settled: boolean;
}

const MAXIMUM_RETAINED_RECOVERY_COMMANDS = 1_000;

export class RecoveryService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #create: BackupCreateOperations;
  readonly #cleanup: IdempotentBackupCleanupOperations;
  readonly #restore: BackupRestoreOperations;
  readonly #versionExport: VersionExportOperations;
  readonly #commands = new Map<string, RecoveryCommandEntry>();

  constructor(workspace: ProjectWorkspaceService, options: RecoveryServiceOptions) {
    this.#workspace = workspace;
    const runtime = createRecoveryRuntime(workspace, options);
    this.#create = new BackupCreateOperations(runtime);
    this.#cleanup = new IdempotentBackupCleanupOperations(runtime);
    this.#restore = new BackupRestoreOperations(runtime);
    this.#versionExport = new VersionExportOperations(runtime);
  }

  createOperationCheckpoint(requestId: string, raw: RecoveryCreateInput): Promise<BackupRecord> {
    return this.#share('create-checkpoint', requestId, raw, 'BACKUP_CREATE_FAILED', () =>
      this.#create.createOperationCheckpoint(requestId, raw),
    );
  }

  createDailyBackup(requestId: string, raw: RecoveryDailyBackupInput): Promise<BackupRecord> {
    return this.#share('create-daily', requestId, raw, 'BACKUP_CREATE_FAILED', () =>
      this.#create.createDailyBackup(requestId, raw),
    );
  }

  createNamedSnapshot(requestId: string, raw: RecoveryNamedSnapshotInput): Promise<BackupRecord> {
    return this.#share('create-named', requestId, raw, 'BACKUP_CREATE_FAILED', () =>
      this.#create.createNamedSnapshot(requestId, raw),
    );
  }

  getOverview(projectId: string): Promise<RecoveryOverview> {
    const project = this.#workspace.assertActiveProject(projectId);
    if (project.databaseMode === 'read-write') {
      this.#workspace.readProject(projectId, (database) => {
        database.prepare('SELECT 1 FROM backup_failures LIMIT 1').get();
        database.prepare('SELECT 1 FROM versions LIMIT 1').get();
        database.prepare('SELECT 1 FROM backup_policies LIMIT 1').get();
      });
    }
    return this.#cleanup.getOverview(projectId);
  }

  updatePolicy(requestId: string, raw: RecoveryPolicyUpdateInput): Promise<BackupPolicy> {
    return this.#share('update-policy', requestId, raw, 'BACKUP_CLEANUP_STALE', () =>
      this.#cleanup.updatePolicy(requestId, raw),
    );
  }

  setProtection(requestId: string, raw: RecoveryProtectionInput): Promise<BackupRecord> {
    return this.#share('set-protection', requestId, raw, 'BACKUP_CLEANUP_STALE', () =>
      this.#cleanup.setProtection(requestId, raw),
    );
  }

  previewCleanup(projectId: string): Promise<BackupCleanupPreview> {
    return this.#cleanup.previewCleanup(projectId);
  }

  applyCleanup(requestId: string, raw: RecoveryCleanupApplyInput): Promise<RecoveryCleanupResult> {
    return this.#share('apply-cleanup', requestId, raw, 'BACKUP_CLEANUP_STALE', () =>
      this.#cleanup.applyCleanup(requestId, raw),
    );
  }

  restoreCheckpoint(
    requestId: string,
    raw: RecoveryRestoreInput,
    targetParentDirectory: string,
  ): Promise<RecoveryRestoredProject> {
    return this.#share(
      'restore-checkpoint',
      requestId,
      { raw, targetParentDirectory },
      'RESTORE_TARGET_CONFLICT',
      () => this.#restore.restoreCheckpoint(requestId, raw, targetParentDirectory),
    );
  }

  exportVersion(raw: RecoveryExportInput, targetDirectory: string): Promise<RecoveryVersionExport> {
    return this.#versionExport.exportVersion(raw, targetDirectory);
  }

  #share<T>(
    operation: string,
    requestId: string,
    input: unknown,
    conflictCode: RecoveryServiceErrorCode,
    execute: () => Promise<T>,
  ): Promise<T> {
    const key = `${operation}:${requestId}`;
    const fingerprint = stableJson(input);
    const existing = this.#commands.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return Promise.reject(
          new RecoveryServiceError(
            conflictCode,
            'The requestId was already used with different recovery command input.',
          ),
        );
      }
      return existing.promise as Promise<T>;
    }

    const promise = Promise.resolve().then(execute);
    const entry: RecoveryCommandEntry = { fingerprint, promise, settled: false };
    this.#commands.set(key, entry);
    void promise.then(
      () => {
        if (this.#commands.get(key) !== entry) return;
        entry.settled = true;
        this.#trimSettledCommands();
      },
      () => {
        if (this.#commands.get(key) === entry) this.#commands.delete(key);
      },
    );
    this.#trimSettledCommands();
    return promise;
  }

  #trimSettledCommands(): void {
    while (this.#commands.size > MAXIMUM_RETAINED_RECOVERY_COMMANDS) {
      const settled = [...this.#commands.entries()].find(([, entry]) => entry.settled);
      if (!settled) return;
      this.#commands.delete(settled[0]);
    }
  }
}
