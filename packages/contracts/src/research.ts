import { z } from 'zod';

import { ErrorCodeSchema } from './error-codes.js';
import { ProjectIdSchema, TASK_PROTOCOL_VERSION } from './task-protocol.js';
import type { CommandResult } from './app-runtime-contracts.js';

export const RESEARCH_IPC_CHANNELS = {
  list: 'worldforge:research:list',
  createNote: 'worldforge:research:create-note',
  updateNote: 'worldforge:research:update-note',
  setNoteStatus: 'worldforge:research:set-note-status',
  importAttachment: 'worldforge:research:import-attachment',
  deleteAttachment: 'worldforge:research:delete-attachment',
  addLink: 'worldforge:research:add-link',
  removeLink: 'worldforge:research:remove-link',
} as const;

export const RESEARCH_COMMANDS = {
  list: 'research.list',
  createNote: 'research.createNote',
  updateNote: 'research.updateNote',
  setNoteStatus: 'research.setNoteStatus',
  importAttachment: 'research.importAttachment',
  deleteAttachment: 'research.deleteAttachment',
  addLink: 'research.addLink',
  removeLink: 'research.removeLink',
} as const;

export const ResearchNoteStatusSchema = z.enum(['active', 'archived']);
export const ResearchSourceTypeSchema = z.enum(['note', 'attachment']);
export const ResearchTargetTypeSchema = z.enum([
  'chapter',
  'entity',
  'relationship',
  'timeline',
  'foreshadowing',
  'arc',
  'idea',
]);
export const ResearchTagSchema = z.string().trim().min(1).max(80);
export const ResearchTagsSchema = z.array(ResearchTagSchema).max(50);

export const ResearchNoteSchema = z.strictObject({
  id: z.uuid(),
  projectId: ProjectIdSchema,
  title: z.string().trim().min(1).max(240),
  body: z.string().max(500_000),
  sourceUri: z.string().trim().max(4_096).nullable(),
  tags: ResearchTagsSchema,
  status: ResearchNoteStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const ResearchAttachmentSchema = z.strictObject({
  id: z.uuid(),
  projectId: ProjectIdSchema,
  noteId: z.uuid().nullable(),
  displayName: z.string().trim().min(1).max(240),
  mediaType: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().nonnegative().max(268_435_456),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/u),
  managedRelativePath: z.string().min(1).max(1_024),
  createdAt: z.iso.datetime(),
});

export const ResearchLinkSchema = z.strictObject({
  id: z.uuid(),
  projectId: ProjectIdSchema,
  sourceType: ResearchSourceTypeSchema,
  sourceId: z.uuid(),
  targetType: ResearchTargetTypeSchema,
  targetId: z.uuid(),
  createdAt: z.iso.datetime(),
});

export const ResearchCatalogSchema = z.strictObject({
  projectId: ProjectIdSchema,
  notes: z.array(ResearchNoteSchema),
  attachments: z.array(ResearchAttachmentSchema),
  links: z.array(ResearchLinkSchema),
});

export const ResearchListInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  includeArchived: z.boolean().default(false),
  query: z.string().trim().max(500).optional(),
  tags: ResearchTagsSchema.optional(),
});

export const ResearchNoteCreateInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  title: z.string().trim().min(1).max(240),
  body: z.string().max(500_000).default(''),
  sourceUri: z.string().trim().max(4_096).nullable().default(null),
  tags: ResearchTagsSchema.default([]),
});

export const ResearchNoteUpdateInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  noteId: z.uuid(),
  expectedUpdatedAt: z.iso.datetime(),
  title: z.string().trim().min(1).max(240),
  body: z.string().max(500_000),
  sourceUri: z.string().trim().max(4_096).nullable(),
  tags: ResearchTagsSchema,
});

export const ResearchNoteStatusInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  noteId: z.uuid(),
  expectedUpdatedAt: z.iso.datetime(),
  status: ResearchNoteStatusSchema,
});

export const ResearchAttachmentImportInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  noteId: z.uuid().nullable().default(null),
});

export const ResearchAttachmentDeleteInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  attachmentId: z.uuid(),
});

export const ResearchLinkAddInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  sourceType: ResearchSourceTypeSchema,
  sourceId: z.uuid(),
  targetType: ResearchTargetTypeSchema,
  targetId: z.uuid(),
});

export const ResearchLinkRemoveInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  linkId: z.uuid(),
});

export const ResearchReferenceSchema = z.strictObject({
  sourceType: ResearchSourceTypeSchema,
  sourceId: z.uuid(),
});
export const ResearchReferencesSchema = z.array(ResearchReferenceSchema).max(20);

const commandEnvelope = {
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: z.uuid(),
  sentAt: z.iso.datetime(),
};

export const ResearchListCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(RESEARCH_COMMANDS.list),
  payload: ResearchListInputSchema,
});
export const ResearchCreateNoteCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(RESEARCH_COMMANDS.createNote),
  payload: ResearchNoteCreateInputSchema,
});
export const ResearchUpdateNoteCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(RESEARCH_COMMANDS.updateNote),
  payload: ResearchNoteUpdateInputSchema,
});
export const ResearchSetNoteStatusCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(RESEARCH_COMMANDS.setNoteStatus),
  payload: ResearchNoteStatusInputSchema,
});
export const ResearchImportAttachmentCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(RESEARCH_COMMANDS.importAttachment),
  payload: ResearchAttachmentImportInputSchema,
});
export const ResearchDeleteAttachmentCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(RESEARCH_COMMANDS.deleteAttachment),
  payload: ResearchAttachmentDeleteInputSchema,
});
export const ResearchAddLinkCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(RESEARCH_COMMANDS.addLink),
  payload: ResearchLinkAddInputSchema,
});
export const ResearchRemoveLinkCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(RESEARCH_COMMANDS.removeLink),
  payload: ResearchLinkRemoveInputSchema,
});

const researchFailureSchema = z.strictObject({
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

export const ResearchCatalogResultSchema = z.union([
  z.strictObject({ ok: z.literal(true), requestId: z.uuid(), data: ResearchCatalogSchema }),
  researchFailureSchema,
]);

const coreSuccess = (operation: (typeof RESEARCH_COMMANDS)[keyof typeof RESEARCH_COMMANDS]) =>
  z.strictObject({ ok: z.literal(true), operation: z.literal(operation), data: ResearchCatalogSchema });

export const CoreResearchOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal(RESEARCH_COMMANDS.list), input: ResearchListInputSchema }),
  z.strictObject({ operation: z.literal(RESEARCH_COMMANDS.createNote), input: ResearchNoteCreateInputSchema }),
  z.strictObject({ operation: z.literal(RESEARCH_COMMANDS.updateNote), input: ResearchNoteUpdateInputSchema }),
  z.strictObject({ operation: z.literal(RESEARCH_COMMANDS.setNoteStatus), input: ResearchNoteStatusInputSchema }),
  z.strictObject({
    operation: z.literal(RESEARCH_COMMANDS.importAttachment),
    input: ResearchAttachmentImportInputSchema,
    sourcePath: z.string().min(1).max(32_768),
  }),
  z.strictObject({ operation: z.literal(RESEARCH_COMMANDS.deleteAttachment), input: ResearchAttachmentDeleteInputSchema }),
  z.strictObject({ operation: z.literal(RESEARCH_COMMANDS.addLink), input: ResearchLinkAddInputSchema }),
  z.strictObject({ operation: z.literal(RESEARCH_COMMANDS.removeLink), input: ResearchLinkRemoveInputSchema }),
]);

export const CoreResearchResultSchema = z.union([
  coreSuccess(RESEARCH_COMMANDS.list),
  coreSuccess(RESEARCH_COMMANDS.createNote),
  coreSuccess(RESEARCH_COMMANDS.updateNote),
  coreSuccess(RESEARCH_COMMANDS.setNoteStatus),
  coreSuccess(RESEARCH_COMMANDS.importAttachment),
  coreSuccess(RESEARCH_COMMANDS.deleteAttachment),
  coreSuccess(RESEARCH_COMMANDS.addLink),
  coreSuccess(RESEARCH_COMMANDS.removeLink),
  z.strictObject({
    ok: z.literal(false),
    operation: z.enum(RESEARCH_COMMANDS),
    errorCode: ErrorCodeSchema,
  }),
]);

export interface ResearchBridge {
  readonly list: (input: ResearchListInput) => Promise<CommandResult<ResearchCatalog>>;
  readonly createNote: (input: ResearchNoteCreateInput) => Promise<CommandResult<ResearchCatalog>>;
  readonly updateNote: (input: ResearchNoteUpdateInput) => Promise<CommandResult<ResearchCatalog>>;
  readonly setNoteStatus: (input: ResearchNoteStatusInput) => Promise<CommandResult<ResearchCatalog>>;
  readonly importAttachment: (input: ResearchAttachmentImportInput) => Promise<CommandResult<ResearchCatalog>>;
  readonly deleteAttachment: (input: ResearchAttachmentDeleteInput) => Promise<CommandResult<ResearchCatalog>>;
  readonly addLink: (input: ResearchLinkAddInput) => Promise<CommandResult<ResearchCatalog>>;
  readonly removeLink: (input: ResearchLinkRemoveInput) => Promise<CommandResult<ResearchCatalog>>;
}

export type ResearchNoteStatus = z.infer<typeof ResearchNoteStatusSchema>;
export type ResearchSourceType = z.infer<typeof ResearchSourceTypeSchema>;
export type ResearchTargetType = z.infer<typeof ResearchTargetTypeSchema>;
export type ResearchNote = z.infer<typeof ResearchNoteSchema>;
export type ResearchAttachment = z.infer<typeof ResearchAttachmentSchema>;
export type ResearchLink = z.infer<typeof ResearchLinkSchema>;
export type ResearchCatalog = z.infer<typeof ResearchCatalogSchema>;
export type ResearchListInput = z.input<typeof ResearchListInputSchema>;
export type ResearchNoteCreateInput = z.input<typeof ResearchNoteCreateInputSchema>;
export type ResearchNoteUpdateInput = z.infer<typeof ResearchNoteUpdateInputSchema>;
export type ResearchNoteStatusInput = z.infer<typeof ResearchNoteStatusInputSchema>;
export type ResearchAttachmentImportInput = z.input<typeof ResearchAttachmentImportInputSchema>;
export type ResearchAttachmentDeleteInput = z.infer<typeof ResearchAttachmentDeleteInputSchema>;
export type ResearchLinkAddInput = z.infer<typeof ResearchLinkAddInputSchema>;
export type ResearchLinkRemoveInput = z.infer<typeof ResearchLinkRemoveInputSchema>;
export type ResearchReference = z.infer<typeof ResearchReferenceSchema>;
export type CoreResearchOperation = z.infer<typeof CoreResearchOperationSchema>;
export type CoreResearchResult = z.infer<typeof CoreResearchResultSchema>;
