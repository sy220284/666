import {
  ExportVersionListCommandSchema,
  ExportVersionsCommandSchema,
  ImportCommitCommandSchema,
  ImportPreviewCommandSchema,
  IPC_CHANNELS,
  RECOVERY_COMMANDS,
  RecoveryCleanupApplyCommandSchema,
  RecoveryCleanupPreviewCommandSchema,
  RecoveryCreateCommandSchema,
  RecoveryDailyBackupCommandSchema,
  RecoveryExportCommandSchema,
  RecoveryNamedSnapshotCommandSchema,
  RecoveryOverviewCommandSchema,
  RecoveryPolicyUpdateCommandSchema,
  RecoveryProtectionCommandSchema,
  RecoveryRestoreCommandSchema,
  TEXT_IO_COMMANDS,
} from '@worldforge/contracts';

import type { IpcHandlerContext } from './handler-guard.js';

export function registerRecoveryIpcHandlers(context: IpcHandlerContext): void {
  const {
    options,
    register,
    rejectUntrusted,
    invalidRequest,
    appDataFailure,
    cancelledSelection,
    invokeProject,
  } = context;

  register(IPC_CHANNELS.createCheckpoint, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = RecoveryCreateCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    if (parsed.data.payload.operation !== 'manual-protection') return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: RECOVERY_COMMANDS.createCheckpoint,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.createDailyBackup, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = RecoveryDailyBackupCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: RECOVERY_COMMANDS.createDailyBackup,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.createNamedSnapshot, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = RecoveryNamedSnapshotCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: RECOVERY_COMMANDS.createNamedSnapshot,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.getOverview, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = RecoveryOverviewCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: RECOVERY_COMMANDS.getOverview,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.updatePolicy, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = RecoveryPolicyUpdateCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: RECOVERY_COMMANDS.updatePolicy,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.setProtection, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = RecoveryProtectionCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: RECOVERY_COMMANDS.setProtection,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.previewCleanup, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = RecoveryCleanupPreviewCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: RECOVERY_COMMANDS.previewCleanup,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.applyCleanup, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = RecoveryCleanupApplyCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: RECOVERY_COMMANDS.applyCleanup,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.restoreCheckpoint, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = RecoveryRestoreCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    let targetParentDirectory: string | null;
    try {
      targetParentDirectory = await options.chooseRecoveryRestoreParent();
    } catch {
      return appDataFailure(parsed.data.requestId, 'COMMON_INTERNAL_999');
    }
    if (!targetParentDirectory) return cancelledSelection(parsed.data.requestId);
    return invokeProject(parsed.data.requestId, {
      operation: RECOVERY_COMMANDS.restoreCheckpoint,
      input: parsed.data.payload,
      targetParentDirectory,
    });
  });

  register(IPC_CHANNELS.exportVersion, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = RecoveryExportCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    let targetDirectory: string | null;
    try {
      targetDirectory = await options.chooseRecoveryExportDirectory();
    } catch {
      return appDataFailure(parsed.data.requestId, 'COMMON_INTERNAL_999');
    }
    if (!targetDirectory) return cancelledSelection(parsed.data.requestId);
    return invokeProject(parsed.data.requestId, {
      operation: RECOVERY_COMMANDS.exportVersion,
      input: parsed.data.payload,
      targetDirectory,
    });
  });

  register(IPC_CHANNELS.previewImport, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ImportPreviewCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    let sourcePath: string | null;
    try {
      sourcePath = await options.chooseTextImportFile();
    } catch {
      return appDataFailure(parsed.data.requestId, 'COMMON_INTERNAL_999');
    }
    if (!sourcePath) return cancelledSelection(parsed.data.requestId);
    return invokeProject(parsed.data.requestId, {
      operation: TEXT_IO_COMMANDS.previewImport,
      input: parsed.data.payload,
      sourcePath,
    });
  });

  register(IPC_CHANNELS.commitImport, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ImportCommitCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: TEXT_IO_COMMANDS.commitImport,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.listExportVersions, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ExportVersionListCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: TEXT_IO_COMMANDS.listExportVersions,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.exportVersions, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ExportVersionsCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    let targetDirectory: string | null;
    try {
      targetDirectory = await options.chooseTextExportDirectory();
    } catch {
      return appDataFailure(parsed.data.requestId, 'COMMON_INTERNAL_999');
    }
    if (!targetDirectory) return cancelledSelection(parsed.data.requestId);
    return invokeProject(parsed.data.requestId, {
      operation: TEXT_IO_COMMANDS.exportVersions,
      input: parsed.data.payload,
      targetDirectory,
    });
  });
}
