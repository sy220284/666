import { z } from 'zod';

import { ErrorCodeSchema } from './error-codes.js';
import { ProjectIdSchema, TASK_PROTOCOL_VERSION } from './task-protocol.js';

export const RECOVERY_IPC_CHANNELS = {
  createCheckpoint: 'worldforge:recovery:create-checkpoint',
  createDailyBackup: 'worldforge:recovery:create-daily-backup',
  createNamedSnapshot: 'worldforge:recovery:create-named-snapshot',
  getOverview: 'worldforge:recovery:get-overview',
  updatePolicy: 'worldforge:recovery:update-policy',
  setProtection: 'worldforge:recovery:set-protection',
  previewCleanup: 'worldforge:recovery:preview-cleanup',
  applyCleanup: 'worldforge:recovery:apply-cleanup',
  restoreCheckpoint: 'worldforge:recovery:restore-checkpoint',
  exportVersion: 'worldforge:recovery:export-version',
} as const;

export const RECOVERY_COMMANDS = {
  createCheckpoint: 'recovery.createCheckpoint',
  createDailyBackup: 'recovery.createDailyBackup',
  createNamedSnapshot: 'recovery.createNamedSnapshot',
  getOverview: 'recovery.getOverview',
  updatePolicy: 'recovery.updatePolicy',
  setProtection: 'recovery.setProtection',
  previewCleanup: 'recovery.previewCleanup',
  applyCleanup: 'recovery.applyCleanup',
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

export const BackupTrackSchema = z.enum(['daily', 'major', 'named']);
export const BackupFailureCodeSchema = z.enum([
  'BACKUP_CREATE_FAILED',
  'BACKUP_VERIFY_FAILED',
  'BACKUP_SPACE_LOW',
]);
export const BackupFailureRecordSchema = z.strictObject({
  failureId: z.uuid(),
  projectId: ProjectIdSchema,
  operation: RecoveryOperationSchema,
  track: BackupTrackSchema,
  errorCode: BackupFailureCodeSchema,
  occurredAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
});
export const BackupProtectionReasonSchema = z.enum([
  'author-protected',
  'migration-protected',
  'last-verified',
  'daily-retention',
  'major-retention',
  'within-quota',
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
  track: BackupTrackSchema.default('major'),
  displayName: z.string().trim().min(1).max(120).nullable().default(null),
  note: z.string().max(1000).nullable().default(null),
  authorProtected: z.boolean().default(false),
  migrationProtected: z.boolean().default(false),
  schemaVersion: z.number().int().nonnegative().default(0),
  protectionReasons: z.array(BackupProtectionReasonSchema).default([]),
});

export const BackupPolicySchema = z.strictObject({
  projectId: ProjectIdSchema,
  policyVersion: z.number().int().positive(),
  dailyRetentionCount: z.number().int().min(1).max(365),
  majorRetentionCount: z.number().int().min(1).max(500),
  majorRetentionDays: z.number().int().min(1).max(3650),
  quotaBytes: z
    .number()
    .int()
    .min(100 * 1024 * 1024)
    .max(1024 * 1024 * 1024 * 1024),
  updatedAt: z.iso.datetime(),
});

export const BackupSpaceSummarySchema = z.strictObject({
  totalBytes: z.number().int().nonnegative(),
  dailyBytes: z.number().int().nonnegative(),
  majorBytes: z.number().int().nonnegative(),
  namedBytes: z.number().int().nonnegative(),
  quotaBytes: z.number().int().positive(),
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
  backupFailures: z.array(BackupFailureRecordSchema),
  policy: BackupPolicySchema,
  space: BackupSpaceSummarySchema,
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
export const RecoveryDailyBackupInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
});
export const RecoveryNamedSnapshotInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  authority: z.literal('author'),
  name: z.string().trim().min(1).max(120),
  note: z.string().max(1000).nullable().optional(),
});
export const RecoveryProjectInputSchema = z.strictObject({ projectId: ProjectIdSchema });
export const RecoveryPolicyUpdateInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  authority: z.literal('author'),
  dailyRetentionCount: z.number().int().min(1).max(365),
  majorRetentionCount: z.number().int().min(1).max(500),
  majorRetentionDays: z.number().int().min(1).max(3650),
  quotaBytes: z
    .number()
    .int()
    .min(100 * 1024 * 1024)
    .max(1024 * 1024 * 1024 * 1024),
});
export const RecoveryProtectionInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  backupId: z.uuid(),
  authority: z.literal('author'),
  protected: z.boolean(),
  confirmationBackupId: z.uuid().nullable().optional(),
});
export const BackupCleanupItemSchema = z.strictObject({
  backupId: z.uuid(),
  track: BackupTrackSchema,
  action: z.enum(['delete', 'retain', 'protect']),
  reason: z.enum([
    'author-protected',
    'migration-protected',
    'last-verified',
    'daily-retention',
    'major-retention',
    'within-quota',
    'daily-over-limit',
    'major-over-limit',
    'major-expired',
    'quota-pressure',
  ]),
  sizeBytes: z.number().int().nonnegative(),
});
export const BackupCleanupPreviewSchema = z.strictObject({
  projectId: ProjectIdSchema,
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
  totalBytes: z.number().int().nonnegative(),
  reclaimableBytes: z.number().int().nonnegative(),
  remainingBytes: z.number().int().nonnegative(),
  items: z.array(BackupCleanupItemSchema),
});
export const RecoveryCleanupApplyInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  authority: z.literal('author'),
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export const RecoveryCleanupResultSchema = z.strictObject({
  projectId: ProjectIdSchema,
  deletedBackupIds: z.array(z.uuid()),
  releasedBytes: z.number().int().nonnegative(),
  remainingBytes: z.number().int().nonnegative(),
});
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
export const RecoveryDailyBackupCommandSchema = z.strictObject({
  ...envelope,
  command: z.literal(RECOVERY_COMMANDS.createDailyBackup),
  payload: RecoveryDailyBackupInputSchema,
});
export const RecoveryNamedSnapshotCommandSchema = z.strictObject({
  ...envelope,
  command: z.literal(RECOVERY_COMMANDS.createNamedSnapshot),
  payload: RecoveryNamedSnapshotInputSchema,
});
export const RecoveryOverviewCommandSchema = z.strictObject({
  ...envelope,
  command: z.literal(RECOVERY_COMMANDS.getOverview),
  payload: RecoveryProjectInputSchema,
});
export const RecoveryPolicyUpdateCommandSchema = z.strictObject({
  ...envelope,
  command: z.literal(RECOVERY_COMMANDS.updatePolicy),
  payload: RecoveryPolicyUpdateInputSchema,
});
export const RecoveryProtectionCommandSchema = z.strictObject({
  ...envelope,
  command: z.literal(RECOVERY_COMMANDS.setProtection),
  payload: RecoveryProtectionInputSchema,
});
export const RecoveryCleanupPreviewCommandSchema = z.strictObject({
  ...envelope,
  command: z.literal(RECOVERY_COMMANDS.previewCleanup),
  payload: RecoveryProjectInputSchema,
});
export const RecoveryCleanupApplyCommandSchema = z.strictObject({
  ...envelope,
  command: z.literal(RECOVERY_COMMANDS.applyCleanup),
  payload: RecoveryCleanupApplyInputSchema,
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
export const RecoveryPolicyResultSchema = resultSchema(BackupPolicySchema);
export const RecoveryProtectionResultSchema = resultSchema(BackupRecordSchema);
export const RecoveryCleanupPreviewResultSchema = resultSchema(BackupCleanupPreviewSchema);
export const RecoveryCleanupApplyResultSchema = resultSchema(RecoveryCleanupResultSchema);
export const RecoveryRestoreResultSchema = resultSchema(RecoveryRestoredProjectSchema);
export const RecoveryExportResultSchema = resultSchema(RecoveryVersionExportSchema);

export const CoreRecoveryOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal(RECOVERY_COMMANDS.createCheckpoint),
    input: RecoveryCreateInputSchema,
  }),
  z.strictObject({
    operation: z.literal(RECOVERY_COMMANDS.createDailyBackup),
    input: RecoveryDailyBackupInputSchema,
  }),
  z.strictObject({
    operation: z.literal(RECOVERY_COMMANDS.createNamedSnapshot),
    input: RecoveryNamedSnapshotInputSchema,
  }),
  z.strictObject({
    operation: z.literal(RECOVERY_COMMANDS.getOverview),
    input: RecoveryProjectInputSchema,
  }),
  z.strictObject({
    operation: z.literal(RECOVERY_COMMANDS.updatePolicy),
    input: RecoveryPolicyUpdateInputSchema,
  }),
  z.strictObject({
    operation: z.literal(RECOVERY_COMMANDS.setProtection),
    input: RecoveryProtectionInputSchema,
  }),
  z.strictObject({
    operation: z.literal(RECOVERY_COMMANDS.previewCleanup),
    input: RecoveryProjectInputSchema,
  }),
  z.strictObject({
    operation: z.literal(RECOVERY_COMMANDS.applyCleanup),
    input: RecoveryCleanupApplyInputSchema,
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
    operation: z.literal(RECOVERY_COMMANDS.createDailyBackup),
    data: BackupRecordSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(RECOVERY_COMMANDS.createNamedSnapshot),
    data: BackupRecordSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(RECOVERY_COMMANDS.getOverview),
    data: RecoveryOverviewSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(RECOVERY_COMMANDS.updatePolicy),
    data: BackupPolicySchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(RECOVERY_COMMANDS.setProtection),
    data: BackupRecordSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(RECOVERY_COMMANDS.previewCleanup),
    data: BackupCleanupPreviewSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(RECOVERY_COMMANDS.applyCleanup),
    data: RecoveryCleanupResultSchema,
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
export type BackupTrack = z.infer<typeof BackupTrackSchema>;
export type BackupProtectionReason = z.infer<typeof BackupProtectionReasonSchema>;
export type BackupRecord = z.infer<typeof BackupRecordSchema>;
export type BackupFailureCode = z.infer<typeof BackupFailureCodeSchema>;
export type BackupFailureRecord = z.infer<typeof BackupFailureRecordSchema>;
export type BackupPolicy = z.infer<typeof BackupPolicySchema>;
export type BackupSpaceSummary = z.infer<typeof BackupSpaceSummarySchema>;
export type BackupCleanupItem = z.infer<typeof BackupCleanupItemSchema>;
export type BackupCleanupPreview = z.infer<typeof BackupCleanupPreviewSchema>;
export type RecoveryCleanupResult = z.infer<typeof RecoveryCleanupResultSchema>;
export type RecoveryVersionSummary = z.infer<typeof RecoveryVersionSummarySchema>;
export type RecoveryOverview = z.infer<typeof RecoveryOverviewSchema>;
export type RecoveryRestoredProject = z.infer<typeof RecoveryRestoredProjectSchema>;
export type RecoveryVersionExport = z.infer<typeof RecoveryVersionExportSchema>;
export type RecoveryCreateInput = z.infer<typeof RecoveryCreateInputSchema>;
export type RecoveryDailyBackupInput = z.infer<typeof RecoveryDailyBackupInputSchema>;
export type RecoveryNamedSnapshotInput = z.infer<typeof RecoveryNamedSnapshotInputSchema>;
export type RecoveryProjectInput = z.infer<typeof RecoveryProjectInputSchema>;
export type RecoveryPolicyUpdateInput = z.infer<typeof RecoveryPolicyUpdateInputSchema>;
export type RecoveryProtectionInput = z.infer<typeof RecoveryProtectionInputSchema>;
export type RecoveryCleanupApplyInput = z.infer<typeof RecoveryCleanupApplyInputSchema>;
export type RecoveryRestoreInput = z.infer<typeof RecoveryRestoreInputSchema>;
export type RecoveryExportInput = z.infer<typeof RecoveryExportInputSchema>;
