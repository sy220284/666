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

import { BoundedIdempotentPromiseCache } from '../bounded-idempotent-promise-cache.js';
import type { ProjectWorkspaceService } from '../project-workspace.js';
import { stableJson } from '../stable-json.js';
import { BackupCleanupOperations } from './backup-cleanup.js';
import { BackupCreateOperations } from './backup-create.js';
import { BackupRestoreOperations } from './backup-restore.js';
import { createRecoveryRuntime, type RecoveryServiceOptions } from './backup-manifest.js';
import { VersionExportOperations } from './version-export.js';

export { RecoveryServiceError } from './backup-manifest.js';
export type { RecoveryServiceErrorCode, RecoveryServiceOptions } from './backup-manifest.js';

export class RecoveryService {
  readonly #create: BackupCreateOperations;
  readonly #cleanup: BackupCleanupOperations;
  readonly #restore: BackupRestoreOperations;
  readonly #versionExport: VersionExportOperations;
  readonly #commands = new BoundedIdempotentPromiseCache();

  constructor(workspace: ProjectWorkspaceService, options: RecoveryServiceOptions) {
    const runtime = createRecoveryRuntime(workspace, options);
    this.#create = new BackupCreateOperations(runtime);
    this.#cleanup = new BackupCleanupOperations(runtime);
    this.#restore = new BackupRestoreOperations(runtime);
    this.#versionExport = new VersionExportOperations(runtime);
  }

  createOperationCheckpoint(requestId: string, raw: RecoveryCreateInput): Promise<BackupRecord> {
    return this.#share('create-checkpoint', requestId, raw, () =>
      this.#create.createOperationCheckpoint(requestId, raw),
    );
  }

  createDailyBackup(requestId: string, raw: RecoveryDailyBackupInput): Promise<BackupRecord> {
    return this.#share('create-daily', requestId, raw, () =>
      this.#create.createDailyBackup(requestId, raw),
    );
  }

  createNamedSnapshot(requestId: string, raw: RecoveryNamedSnapshotInput): Promise<BackupRecord> {
    return this.#share('create-named', requestId, raw, () =>
      this.#create.createNamedSnapshot(requestId, raw),
    );
  }

  getOverview(projectId: string): Promise<RecoveryOverview> {
    return this.#cleanup.getOverview(projectId);
  }

  updatePolicy(requestId: string, raw: RecoveryPolicyUpdateInput): Promise<BackupPolicy> {
    return this.#share('update-policy', requestId, raw, () =>
      this.#cleanup.updatePolicy(requestId, raw),
    );
  }

  setProtection(requestId: string, raw: RecoveryProtectionInput): Promise<BackupRecord> {
    return this.#share('set-protection', requestId, raw, () =>
      this.#cleanup.setProtection(requestId, raw),
    );
  }

  previewCleanup(projectId: string): Promise<BackupCleanupPreview> {
    return this.#cleanup.previewCleanup(projectId);
  }

  applyCleanup(requestId: string, raw: RecoveryCleanupApplyInput): Promise<RecoveryCleanupResult> {
    return this.#share('apply-cleanup', requestId, raw, () =>
      this.#cleanup.applyCleanup(requestId, raw),
    );
  }

  restoreCheckpoint(
    requestId: string,
    raw: RecoveryRestoreInput,
    targetParentDirectory: string,
  ): Promise<RecoveryRestoredProject> {
    return this.#share('restore-checkpoint', requestId, { raw, targetParentDirectory }, () =>
      this.#restore.restoreCheckpoint(requestId, raw, targetParentDirectory),
    );
  }

  exportVersion(raw: RecoveryExportInput, targetDirectory: string): Promise<RecoveryVersionExport> {
    return this.#versionExport.exportVersion(raw, targetDirectory);
  }

  #share<T>(
    operation: string,
    requestId: string,
    input: unknown,
    execute: () => Promise<T>,
  ): Promise<T> {
    return this.#commands.remember(`${operation}:${requestId}:${stableJson(input)}`, execute());
  }
}
