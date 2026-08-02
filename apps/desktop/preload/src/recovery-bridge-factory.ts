import {
  APP_COMMANDS,
  ExportVersionCatalogResultSchema,
  ExportVersionListCommandSchema,
  ExportVersionsCommandSchema,
  ExportVersionsResultEnvelopeSchema,
  IPC_CHANNELS,
  ImportCommitCommandSchema,
  ImportCommitResultEnvelopeSchema,
  ImportPlanResultSchema,
  ImportPreviewCommandSchema,
  RecoveryCheckpointResultSchema,
  RecoveryCleanupApplyCommandSchema,
  RecoveryCleanupApplyResultSchema,
  RecoveryCleanupPreviewCommandSchema,
  RecoveryCleanupPreviewResultSchema,
  RecoveryCreateCommandSchema,
  RecoveryDailyBackupCommandSchema,
  RecoveryExportCommandSchema,
  RecoveryExportResultSchema,
  RecoveryNamedSnapshotCommandSchema,
  RecoveryOverviewCommandSchema,
  RecoveryOverviewResultSchema,
  RecoveryPolicyResultSchema,
  RecoveryPolicyUpdateCommandSchema,
  RecoveryProtectionCommandSchema,
  RecoveryProtectionResultSchema,
  RecoveryRestoreCommandSchema,
  RecoveryRestoreResultSchema,
  type WorldforgeBridge,
} from '@worldforge/contracts';
import { envelope, invoke } from './bridge-runtime.js';

export function createRecoveryBridge(): Pick<WorldforgeBridge, 'recovery' | 'textIo'> {
  return {
    recovery: {
      createCheckpoint: (input) =>
        invoke(
          IPC_CHANNELS.createCheckpoint,
          RecoveryCreateCommandSchema.parse(envelope(APP_COMMANDS.createCheckpoint, input)),
          RecoveryCheckpointResultSchema,
        ),
      createDailyBackup: (input) =>
        invoke(
          IPC_CHANNELS.createDailyBackup,
          RecoveryDailyBackupCommandSchema.parse(envelope(APP_COMMANDS.createDailyBackup, input)),
          RecoveryCheckpointResultSchema,
        ),
      createNamedSnapshot: (input) =>
        invoke(
          IPC_CHANNELS.createNamedSnapshot,
          RecoveryNamedSnapshotCommandSchema.parse(
            envelope(APP_COMMANDS.createNamedSnapshot, input),
          ),
          RecoveryCheckpointResultSchema,
        ),
      getOverview: (projectId) =>
        invoke(
          IPC_CHANNELS.getOverview,
          RecoveryOverviewCommandSchema.parse(envelope(APP_COMMANDS.getOverview, { projectId })),
          RecoveryOverviewResultSchema,
        ),
      updatePolicy: (input) =>
        invoke(
          IPC_CHANNELS.updatePolicy,
          RecoveryPolicyUpdateCommandSchema.parse(envelope(APP_COMMANDS.updatePolicy, input)),
          RecoveryPolicyResultSchema,
        ),
      setProtection: (input) =>
        invoke(
          IPC_CHANNELS.setProtection,
          RecoveryProtectionCommandSchema.parse(envelope(APP_COMMANDS.setProtection, input)),
          RecoveryProtectionResultSchema,
        ),
      previewCleanup: (projectId) =>
        invoke(
          IPC_CHANNELS.previewCleanup,
          RecoveryCleanupPreviewCommandSchema.parse(
            envelope(APP_COMMANDS.previewCleanup, { projectId }),
          ),
          RecoveryCleanupPreviewResultSchema,
        ),
      applyCleanup: (input) =>
        invoke(
          IPC_CHANNELS.applyCleanup,
          RecoveryCleanupApplyCommandSchema.parse(envelope(APP_COMMANDS.applyCleanup, input)),
          RecoveryCleanupApplyResultSchema,
        ),
      restoreCheckpoint: (input) =>
        invoke(
          IPC_CHANNELS.restoreCheckpoint,
          RecoveryRestoreCommandSchema.parse(envelope(APP_COMMANDS.restoreCheckpoint, input)),
          RecoveryRestoreResultSchema,
        ),
      exportVersion: (input) =>
        invoke(
          IPC_CHANNELS.exportVersion,
          RecoveryExportCommandSchema.parse(envelope(APP_COMMANDS.exportVersion, input)),
          RecoveryExportResultSchema,
        ),
    },
    textIo: {
      previewImport: (input) =>
        invoke(
          IPC_CHANNELS.previewImport,
          ImportPreviewCommandSchema.parse(envelope(APP_COMMANDS.previewImport, input)),
          ImportPlanResultSchema,
        ),
      commitImport: (input) =>
        invoke(
          IPC_CHANNELS.commitImport,
          ImportCommitCommandSchema.parse(envelope(APP_COMMANDS.commitImport, input)),
          ImportCommitResultEnvelopeSchema,
        ),
      listExportVersions: (projectId) =>
        invoke(
          IPC_CHANNELS.listExportVersions,
          ExportVersionListCommandSchema.parse(
            envelope(APP_COMMANDS.listExportVersions, { projectId }),
          ),
          ExportVersionCatalogResultSchema,
        ),
      exportVersions: (input) =>
        invoke(
          IPC_CHANNELS.exportVersions,
          ExportVersionsCommandSchema.parse(envelope(APP_COMMANDS.exportVersions, input)),
          ExportVersionsResultEnvelopeSchema,
        ),
    },
  };
}
