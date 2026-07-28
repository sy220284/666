import { z } from 'zod';

import { BackupRecordSchema } from './recovery.js';
import {
  ProjectDictionaryDeleteInputSchema,
  ProjectDictionaryListInputSchema,
  ProjectDictionaryListSchema,
  ProjectDictionaryUpsertInputSchema,
  SearchIndexRebuildResultSchema,
  SearchIndexStateSchema,
  SearchProjectInputSchema,
  SearchProjectResultSchema,
} from './search-index.js';
import { DraftContentHashValueSchema, DraftEntityIdSchema } from './draft.js';
import { ErrorCodeSchema } from './error-codes.js';
import { ProjectIdSchema, TASK_PROTOCOL_VERSION } from './task-protocol.js';

export const SEARCH_TOOLS_IPC_CHANNELS = {
  search: 'worldforge:search:project',
  getIndexState: 'worldforge:search:index-state',
  rebuildIndex: 'worldforge:search:rebuild-index',
  previewReplace: 'worldforge:search:preview-replace',
  applyReplace: 'worldforge:search:apply-replace',
  listDictionary: 'worldforge:search:list-dictionary',
  upsertDictionary: 'worldforge:search:upsert-dictionary',
  deleteDictionary: 'worldforge:search:delete-dictionary',
} as const;

export const SEARCH_TOOLS_COMMANDS = {
  search: 'search.project',
  getIndexState: 'search.getIndexState',
  rebuildIndex: 'search.rebuildIndex',
  previewReplace: 'search.previewReplace',
  applyReplace: 'search.applyReplace',
  listDictionary: 'search.listDictionary',
  upsertDictionary: 'search.upsertDictionary',
  deleteDictionary: 'search.deleteDictionary',
} as const;

export const ReplacePlanItemSchema = z.strictObject({
  planItemId: DraftEntityIdSchema,
  projectId: ProjectIdSchema,
  chapterId: DraftEntityIdSchema,
  draftId: DraftEntityIdSchema,
  logicalBlockId: DraftEntityIdSchema,
  baseRevision: z.number().int().nonnegative(),
  expectedBlockHash: DraftContentHashValueSchema,
  matchedText: z.string().min(1).max(500),
  matchStart: z.number().int().nonnegative(),
  matchEnd: z.number().int().positive(),
  replacement: z.string().max(2_000),
  locked: z.boolean(),
});

export const ReplacePlanSchema = z.strictObject({
  planId: DraftEntityIdSchema,
  projectId: ProjectIdSchema,
  query: z.string().min(1).max(500),
  replacement: z.string().max(2_000),
  matchCase: z.boolean(),
  status: z.enum(['preview', 'applied', 'stale']),
  itemCount: z.number().int().nonnegative(),
  eligibleCount: z.number().int().nonnegative(),
  lockedCount: z.number().int().nonnegative(),
  checkpointId: DraftEntityIdSchema.nullable(),
  items: z.array(ReplacePlanItemSchema).max(5_000),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  appliedAt: z.iso.datetime().nullable(),
});

export const ReplacePreviewInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  query: z.string().min(1).max(500),
  replacement: z.string().max(2_000),
  matchCase: z.boolean().default(true),
  maxMatches: z.number().int().min(1).max(5_000).default(2_000),
});
export const ReplaceApplyInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  planId: DraftEntityIdSchema,
});
export const ReplaceApplyResultSchema = z.strictObject({
  plan: ReplacePlanSchema,
  checkpoint: BackupRecordSchema,
  changedDrafts: z.array(
    z.strictObject({
      draftId: DraftEntityIdSchema,
      chapterId: DraftEntityIdSchema,
      previousRevision: z.number().int().nonnegative(),
      committedRevision: z.number().int().positive(),
      replacementCount: z.number().int().positive(),
    }),
  ),
  skippedLockedCount: z.number().int().nonnegative(),
});

const commandEnvelope = {
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: z.uuid(),
  sentAt: z.iso.datetime(),
};
const command = <Name extends string, Payload extends z.ZodType>(name: Name, payload: Payload) =>
  z.strictObject({ ...commandEnvelope, command: z.literal(name), payload });

export const SearchProjectCommandSchema = command(
  SEARCH_TOOLS_COMMANDS.search,
  SearchProjectInputSchema,
);
export const SearchIndexStateCommandSchema = command(
  SEARCH_TOOLS_COMMANDS.getIndexState,
  z.strictObject({ projectId: ProjectIdSchema }),
);
export const SearchIndexRebuildCommandSchema = command(
  SEARCH_TOOLS_COMMANDS.rebuildIndex,
  z.strictObject({ projectId: ProjectIdSchema }),
);
export const ReplacePreviewCommandSchema = command(
  SEARCH_TOOLS_COMMANDS.previewReplace,
  ReplacePreviewInputSchema,
);
export const ReplaceApplyCommandSchema = command(
  SEARCH_TOOLS_COMMANDS.applyReplace,
  ReplaceApplyInputSchema,
);
export const ProjectDictionaryListCommandSchema = command(
  SEARCH_TOOLS_COMMANDS.listDictionary,
  ProjectDictionaryListInputSchema,
);
export const ProjectDictionaryUpsertCommandSchema = command(
  SEARCH_TOOLS_COMMANDS.upsertDictionary,
  ProjectDictionaryUpsertInputSchema,
);
export const ProjectDictionaryDeleteCommandSchema = command(
  SEARCH_TOOLS_COMMANDS.deleteDictionary,
  ProjectDictionaryDeleteInputSchema,
);

export const CoreSearchToolsOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal(SEARCH_TOOLS_COMMANDS.search),
    input: SearchProjectInputSchema,
  }),
  z.strictObject({
    operation: z.literal(SEARCH_TOOLS_COMMANDS.getIndexState),
    input: z.strictObject({ projectId: ProjectIdSchema }),
  }),
  z.strictObject({
    operation: z.literal(SEARCH_TOOLS_COMMANDS.rebuildIndex),
    input: z.strictObject({ projectId: ProjectIdSchema }),
  }),
  z.strictObject({
    operation: z.literal(SEARCH_TOOLS_COMMANDS.previewReplace),
    input: ReplacePreviewInputSchema,
  }),
  z.strictObject({
    operation: z.literal(SEARCH_TOOLS_COMMANDS.applyReplace),
    input: ReplaceApplyInputSchema,
  }),
  z.strictObject({
    operation: z.literal(SEARCH_TOOLS_COMMANDS.listDictionary),
    input: ProjectDictionaryListInputSchema,
  }),
  z.strictObject({
    operation: z.literal(SEARCH_TOOLS_COMMANDS.upsertDictionary),
    input: ProjectDictionaryUpsertInputSchema,
  }),
  z.strictObject({
    operation: z.literal(SEARCH_TOOLS_COMMANDS.deleteDictionary),
    input: ProjectDictionaryDeleteInputSchema,
  }),
]);

const coreFailure = z.strictObject({
  ok: z.literal(false),
  operation: z.enum(SEARCH_TOOLS_COMMANDS),
  errorCode: ErrorCodeSchema,
});
const coreSuccess = <Name extends string, Data extends z.ZodType>(operation: Name, data: Data) =>
  z.strictObject({ ok: z.literal(true), operation: z.literal(operation), data });
export const CoreSearchToolsResultSchema = z.union([
  coreSuccess(SEARCH_TOOLS_COMMANDS.search, SearchProjectResultSchema),
  coreSuccess(SEARCH_TOOLS_COMMANDS.getIndexState, SearchIndexStateSchema),
  coreSuccess(SEARCH_TOOLS_COMMANDS.rebuildIndex, SearchIndexRebuildResultSchema),
  coreSuccess(SEARCH_TOOLS_COMMANDS.previewReplace, ReplacePlanSchema),
  coreSuccess(SEARCH_TOOLS_COMMANDS.applyReplace, ReplaceApplyResultSchema),
  coreSuccess(SEARCH_TOOLS_COMMANDS.listDictionary, ProjectDictionaryListSchema),
  coreSuccess(SEARCH_TOOLS_COMMANDS.upsertDictionary, ProjectDictionaryListSchema),
  coreSuccess(SEARCH_TOOLS_COMMANDS.deleteDictionary, ProjectDictionaryListSchema),
  coreFailure,
]);

const commandFailure = z.strictObject({
  ok: z.literal(false),
  requestId: z.uuid(),
  error: z.strictObject({
    code: ErrorCodeSchema,
    message: z.string().min(1).max(512),
    retryable: z.boolean(),
  }),
});
const result = <Data extends z.ZodType>(data: Data) =>
  z.union([z.strictObject({ ok: z.literal(true), requestId: z.uuid(), data }), commandFailure]);
export const SearchProjectCommandResultSchema = result(SearchProjectResultSchema);
export const SearchIndexStateCommandResultSchema = result(SearchIndexStateSchema);
export const SearchIndexRebuildCommandResultSchema = result(SearchIndexRebuildResultSchema);
export const ReplacePreviewCommandResultSchema = result(ReplacePlanSchema);
export const ReplaceApplyCommandResultSchema = result(ReplaceApplyResultSchema);
export const ProjectDictionaryCommandResultSchema = result(ProjectDictionaryListSchema);

export interface SearchToolsBridge {
  readonly search: (
    input: z.input<typeof SearchProjectInputSchema>,
  ) => Promise<z.infer<typeof SearchProjectCommandResultSchema>>;
  readonly getIndexState: (input: {
    readonly projectId: string;
  }) => Promise<z.infer<typeof SearchIndexStateCommandResultSchema>>;
  readonly rebuildIndex: (input: {
    readonly projectId: string;
  }) => Promise<z.infer<typeof SearchIndexRebuildCommandResultSchema>>;
  readonly previewReplace: (
    input: z.input<typeof ReplacePreviewInputSchema>,
  ) => Promise<z.infer<typeof ReplacePreviewCommandResultSchema>>;
  readonly applyReplace: (
    input: z.infer<typeof ReplaceApplyInputSchema>,
  ) => Promise<z.infer<typeof ReplaceApplyCommandResultSchema>>;
  readonly listDictionary: (
    input: z.input<typeof ProjectDictionaryListInputSchema>,
  ) => Promise<z.infer<typeof ProjectDictionaryCommandResultSchema>>;
  readonly upsertDictionary: (
    input: z.input<typeof ProjectDictionaryUpsertInputSchema>,
  ) => Promise<z.infer<typeof ProjectDictionaryCommandResultSchema>>;
  readonly deleteDictionary: (
    input: z.infer<typeof ProjectDictionaryDeleteInputSchema>,
  ) => Promise<z.infer<typeof ProjectDictionaryCommandResultSchema>>;
}

export type ReplacePlan = z.infer<typeof ReplacePlanSchema>;
export type ReplacePreviewInput = z.input<typeof ReplacePreviewInputSchema>;
export type ReplaceApplyInput = z.infer<typeof ReplaceApplyInputSchema>;
export type ReplaceApplyResult = z.infer<typeof ReplaceApplyResultSchema>;
