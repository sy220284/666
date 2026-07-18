import { z } from 'zod';

import { ErrorCodeSchema } from './error-codes.js';
import { ProjectIdSchema, TASK_PROTOCOL_VERSION } from './task-protocol.js';

export const RECOVERY_IPC_CHANNELS = {
  createCheckpoint: 'worldforge:recovery:create-checkpoint',
  getOverview: 'worldforge:recovery:get-overview',
  restoreCheckpoint: 'worldforge:recovery:restore-checkpoint',
  exportVersion: 'worldforge:recovery:export-version',
} as const;

export const RECOVERY_COMMANDS = {
  createCheckpoint: 'recovery.createCheckpoint',
  getOverview: 'recovery.getOverview',
  restoreCheckpoint: 'recovery.restoreCheckpoint',
  exportVersion: 'recovery.exportVersion',
} as const;

export const RecoveryOperationSchema = z.enum([
  'manual-protection',
  'import',
  'replace',
  'split-chapter',
  'merge-chapter',
  'move-blocks',
  'permanent-delete',
  'migration',
]);

export const BackupRecordSchema = z.strictObject({
  backupId: z.uuid(),
  projectId: ProjectIdSchema,
  operation: RecoveryOperationSchema,
  backupFileName: z
    .string()
    .min(1)
    .max(512)
    .regex(/^[A-Za-z0-9._-]+\.sqlite$/),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.iso.datetime(),
  verifiedAt: z.iso.datetime(),
});

export const RecoveryVersionSummarySchema = z.strictObject({
  versionId: z.uuid(),
  chapterId: z.uuid(),
  chapterTitle: z.string().min(1).max(240),
  title: z.string().min(1).max(240),
  wordCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  finalized: z.boolean(),
});

export const RecoveryOverviewSchema = z.strictObject({
  projectId: ProjectIdSchema,
  databaseMode: z.enum(['read-write', 'read-only']),
  readOnlyReason: z
    .enum([
      'current',
      'migrated',
      'migration-failed',
      'future-schema',
      'checksum-mismatch',
      'integrity-failed',
    ])
    .nullable(),
  checkpoints: z.array(BackupRecordSchema),
  exportableVersions: z.array(RecoveryVersionSummarySchema),
});

export const RecoveryRestoredProjectSchema = z.strictObject({
  projectId: ProjectIdSchema,
  sourceProjectId: ProjectIdSchema,
  backupId: z.uuid(),
  name: z.string().trim().min(1).max(240),
  channel: z.string().trim().min(1).max(120),
  workspacePath: z.string().min(1).max(32_768),
  schemaVersion: z.number().int().nonnegative(),
  databaseMode: z.literal('read-write'),
  compatibility: z.enum(['current', 'migrated']),
  readOnlyReason: z.null(),
  createdAt: z.iso.datetime(),
});

export const RecoveryVersionExportSchema = z.strictObject({
  projectId: ProjectIdSchema,
  versionId: z.uuid(),
  fileName: z.string().min(1).max(512),
  filePath: z.string().min(1).max(32_768),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const RecoveryCreateInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  operation: RecoveryOperationSchema,
});
export const RecoveryProjectInputSchema = z.strictObject({ projectId: ProjectIdSchema });
export const RecoveryRestoreInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  backupId: z.uuid(),
});
export const RecoveryExportInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  versionId: z.uuid(),
});

const envelope = {
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: z.uuid(),
  sentAt: z.iso.datetime(),
};

export const RecoveryCreateCommandSchema = z.strictObject({
  ...envelope,
  command: z.literal(RECOVERY_COMMANDS.createCheckpoint),
  payload: RecoveryCreateInputSchema,
});
export const RecoveryOverviewCommandSchema = z.strictObject({
  ...envelope,
  command: z.literal(RECOVERY_COMMANDS.getOverview),
  payload: RecoveryProjectInputSchema,
});
export const RecoveryRestoreCommandSchema = z.strictObject({
  ...envelope,
  command: z.literal(RECOVERY_COMMANDS.restoreCheckpoint),
  payload: RecoveryRestoreInputSchema,
});
export const RecoveryExportCommandSchema = z.strictObject({
  ...envelope,
  command: z.literal(RECOVERY_COMMANDS.exportVersion),
  payload: RecoveryExportInputSchema,
});

const failureSchema = z.strictObject({
  ok: z.literal(false),
  requestId: z.uuid(),
  error: z.strictObject({
    code: ErrorCodeSchema,
    message: z.string().min(1).max(512),
    retryable: z.boolean(),
    userAction: z.string().min(1).max(512).optional(),
    diagnosticId: z.string().min(1).max(128).optional(),
  }),
});
const resultSchema = <Schema extends z.ZodType>(schema: Schema) =>
  z.union([
    z.strictObject({ ok: z.literal(true), requestId: z.uuid(), data: schema }),
    failureSchema,
  ]);

export const RecoveryCheckpointResultSchema = resultSchema(BackupRecordSchema);
export const RecoveryOverviewResultSchema = resultSchema(RecoveryOverviewSchema);
export const RecoveryRestoreResultSchema = resultSchema(RecoveryRestoredProjectSchema);
export const RecoveryExportResultSchema = resultSchema(RecoveryVersionExportSchema);

export const CoreRecoveryOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal(RECOVERY_COMMANDS.createCheckpoint),
    input: RecoveryCreateInputSchema,
  }),
  z.strictObject({
    operation: z.literal(RECOVERY_COMMANDS.getOverview),
    input: RecoveryProjectInputSchema,
  }),
  z.strictObject({
    operation: z.literal(RECOVERY_COMMANDS.restoreCheckpoint),
    input: RecoveryRestoreInputSchema,
    targetParentDirectory: z.string().min(1).max(32_768),
  }),
  z.strictObject({
    operation: z.literal(RECOVERY_COMMANDS.exportVersion),
    input: RecoveryExportInputSchema,
    targetDirectory: z.string().min(1).max(32_768),
  }),
]);

export const CoreRecoveryResultSchema = z.union([
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(RECOVERY_COMMANDS.createCheckpoint),
    data: BackupRecordSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(RECOVERY_COMMANDS.getOverview),
    data: RecoveryOverviewSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(RECOVERY_COMMANDS.restoreCheckpoint),
    data: RecoveryRestoredProjectSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(RECOVERY_COMMANDS.exportVersion),
    data: RecoveryVersionExportSchema,
  }),
  z.strictObject({
    ok: z.literal(false),
    operation: z.enum(RECOVERY_COMMANDS),
    errorCode: ErrorCodeSchema,
  }),
]);

export type RecoveryOperation = z.infer<typeof RecoveryOperationSchema>;
export type BackupRecord = z.infer<typeof BackupRecordSchema>;
export type RecoveryVersionSummary = z.infer<typeof RecoveryVersionSummarySchema>;
export type RecoveryOverview = z.infer<typeof RecoveryOverviewSchema>;
export type RecoveryRestoredProject = z.infer<typeof RecoveryRestoredProjectSchema>;
export type RecoveryVersionExport = z.infer<typeof RecoveryVersionExportSchema>;
export type RecoveryCreateInput = z.infer<typeof RecoveryCreateInputSchema>;
export type RecoveryProjectInput = z.infer<typeof RecoveryProjectInputSchema>;
export type RecoveryRestoreInput = z.infer<typeof RecoveryRestoreInputSchema>;
export type RecoveryExportInput = z.infer<typeof RecoveryExportInputSchema>;
