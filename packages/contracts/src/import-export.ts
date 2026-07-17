import { z } from 'zod';

import { ErrorCodeSchema } from './error-codes.js';
import { DraftBlockTypeSchema } from './draft.js';
import { ProjectIdSchema, TASK_PROTOCOL_VERSION } from './task-protocol.js';

export const TEXT_IO_IPC_CHANNELS = {
  previewImport: 'worldforge:text-io:preview-import',
  commitImport: 'worldforge:text-io:commit-import',
  listExportVersions: 'worldforge:text-io:list-export-versions',
  exportVersions: 'worldforge:text-io:export-versions',
} as const;

export const TEXT_IO_COMMANDS = {
  previewImport: 'textIo.previewImport',
  commitImport: 'textIo.commitImport',
  listExportVersions: 'textIo.listExportVersions',
  exportVersions: 'textIo.exportVersions',
} as const;

export const TextImportEncodingSchema = z.enum([
  'auto',
  'utf-8',
  'utf-16le',
  'utf-16be',
  'gb18030',
]);
export const DetectedTextEncodingSchema = TextImportEncodingSchema.exclude(['auto']);
export const TextDocumentFormatSchema = z.enum(['txt', 'markdown']);
export const ImportConfidenceSchema = z.enum(['high', 'medium', 'low']);

export const ImportPlanBlockSchema = z.strictObject({
  blockType: DraftBlockTypeSchema,
  text: z.string().max(2_000_000),
});
export const ImportPlanChapterSchema = z.strictObject({
  planChapterId: z.uuid(),
  title: z.string().trim().min(1).max(240),
  blocks: z.array(ImportPlanBlockSchema).min(1).max(20_000),
});
export const ImportPlanSchema = z.strictObject({
  planId: z.uuid(),
  projectId: ProjectIdSchema,
  fileName: z.string().min(1).max(512),
  format: TextDocumentFormatSchema,
  detectedEncoding: DetectedTextEncodingSchema,
  confidence: ImportConfidenceSchema,
  encodingCandidates: z.array(DetectedTextEncodingSchema).min(1).max(4),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  chapters: z.array(ImportPlanChapterSchema).min(1).max(1_000),
  warnings: z.array(z.string().min(1).max(512)).max(20),
});

export const ImportPreviewInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  encoding: TextImportEncodingSchema.optional(),
});
export const ImportCommitInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  planId: z.uuid(),
  volumeTitle: z.string().trim().min(1).max(240),
  chapters: z.array(ImportPlanChapterSchema).min(1).max(1_000),
});
export const ImportCommitResultSchema = z.strictObject({
  projectId: ProjectIdSchema,
  checkpointId: z.uuid(),
  volumeId: z.uuid(),
  chapterIds: z.array(z.uuid()).min(1),
  draftIds: z.array(z.uuid()).min(1),
  versionIds: z.array(z.uuid()).min(1),
  importedChapterCount: z.number().int().positive(),
});

export const ExportVersionChoiceSchema = z.strictObject({
  versionId: z.uuid(),
  volumeId: z.uuid(),
  volumeTitle: z.string().min(1).max(240),
  chapterId: z.uuid(),
  chapterTitle: z.string().min(1).max(240),
  versionTitle: z.string().min(1).max(240),
  wordCount: z.number().int().nonnegative(),
  finalized: z.boolean(),
  createdAt: z.iso.datetime(),
});
export const ExportVersionCatalogSchema = z.strictObject({
  projectId: ProjectIdSchema,
  versions: z.array(ExportVersionChoiceSchema),
});
export const ExportVersionListInputSchema = z.strictObject({ projectId: ProjectIdSchema });
export const ExportVersionsInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  versionIds: z.array(z.uuid()).min(1).max(1_000),
  format: TextDocumentFormatSchema,
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(240)
    .refine(
      (value) =>
        value === value.split(/[\\/]/u).at(-1) &&
        !value.includes('..') &&
        !/[<>:"|?*\u0000-\u001f]/u.test(value),
      'The export file name must be a plain safe file name.',
    ),
});
export const ExportVersionsResultSchema = z.strictObject({
  projectId: ProjectIdSchema,
  versionIds: z.array(z.uuid()).min(1),
  format: TextDocumentFormatSchema,
  fileName: z.string().min(1).max(512),
  filePath: z.string().min(1).max(32_768),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

const envelope = {
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: z.uuid(),
  sentAt: z.iso.datetime(),
};
export const ImportPreviewCommandSchema = z.strictObject({
  ...envelope,
  command: z.literal(TEXT_IO_COMMANDS.previewImport),
  payload: ImportPreviewInputSchema,
});
export const ImportCommitCommandSchema = z.strictObject({
  ...envelope,
  command: z.literal(TEXT_IO_COMMANDS.commitImport),
  payload: ImportCommitInputSchema,
});
export const ExportVersionListCommandSchema = z.strictObject({
  ...envelope,
  command: z.literal(TEXT_IO_COMMANDS.listExportVersions),
  payload: ExportVersionListInputSchema,
});
export const ExportVersionsCommandSchema = z.strictObject({
  ...envelope,
  command: z.literal(TEXT_IO_COMMANDS.exportVersions),
  payload: ExportVersionsInputSchema,
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
export const ImportPlanResultSchema = resultSchema(ImportPlanSchema);
export const ImportCommitResultEnvelopeSchema = resultSchema(ImportCommitResultSchema);
export const ExportVersionCatalogResultSchema = resultSchema(ExportVersionCatalogSchema);
export const ExportVersionsResultEnvelopeSchema = resultSchema(ExportVersionsResultSchema);

export const CoreTextIoOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal(TEXT_IO_COMMANDS.previewImport),
    input: ImportPreviewInputSchema,
    sourcePath: z.string().min(1).max(32_768),
  }),
  z.strictObject({
    operation: z.literal(TEXT_IO_COMMANDS.commitImport),
    input: ImportCommitInputSchema,
  }),
  z.strictObject({
    operation: z.literal(TEXT_IO_COMMANDS.listExportVersions),
    input: ExportVersionListInputSchema,
  }),
  z.strictObject({
    operation: z.literal(TEXT_IO_COMMANDS.exportVersions),
    input: ExportVersionsInputSchema,
    targetDirectory: z.string().min(1).max(32_768),
  }),
]);
export const CoreTextIoResultSchema = z.union([
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(TEXT_IO_COMMANDS.previewImport),
    data: ImportPlanSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(TEXT_IO_COMMANDS.commitImport),
    data: ImportCommitResultSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(TEXT_IO_COMMANDS.listExportVersions),
    data: ExportVersionCatalogSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(TEXT_IO_COMMANDS.exportVersions),
    data: ExportVersionsResultSchema,
  }),
  z.strictObject({
    ok: z.literal(false),
    operation: z.enum(TEXT_IO_COMMANDS),
    errorCode: ErrorCodeSchema,
  }),
]);

export type TextImportEncoding = z.infer<typeof TextImportEncodingSchema>;
export type DetectedTextEncoding = z.infer<typeof DetectedTextEncodingSchema>;
export type TextDocumentFormat = z.infer<typeof TextDocumentFormatSchema>;
export type ImportPlanBlock = z.infer<typeof ImportPlanBlockSchema>;
export type ImportPlanChapter = z.infer<typeof ImportPlanChapterSchema>;
export type ImportPlan = z.infer<typeof ImportPlanSchema>;
export type ImportPreviewInput = z.infer<typeof ImportPreviewInputSchema>;
export type ImportCommitInput = z.infer<typeof ImportCommitInputSchema>;
export type ImportCommitResult = z.infer<typeof ImportCommitResultSchema>;
export type ExportVersionChoice = z.infer<typeof ExportVersionChoiceSchema>;
export type ExportVersionCatalog = z.infer<typeof ExportVersionCatalogSchema>;
export type ExportVersionListInput = z.infer<typeof ExportVersionListInputSchema>;
export type ExportVersionsInput = z.infer<typeof ExportVersionsInputSchema>;
export type ExportVersionsResult = z.infer<typeof ExportVersionsResultSchema>;
