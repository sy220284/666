import { z } from 'zod';

import { ErrorCodeSchema } from './error-codes.js';
import { ProjectIdSchema, TASK_PROTOCOL_VERSION } from './task-protocol.js';

export const RESEARCH_IPC_CHANNELS = {
  list: 'worldforge:research:list',
  createNote: 'worldforge:research:create-note',
  updateNote: 'worldforge:research:update-note',
  setNoteStatus: 'worldforge:research:set-note-status',
  deleteNote: 'worldforge:research:delete-note',
  importAttachment: 'worldforge:research:import-attachment',
  previewAttachment: 'worldforge:research:preview-attachment',
  deleteAttachment: 'worldforge:research:delete-attachment',
  addLink: 'worldforge:research:add-link',
  removeLink: 'worldforge:research:remove-link',
} as const;

export const RESEARCH_COMMANDS = {
  list: 'research.list',
  createNote: 'research.createNote',
  updateNote: 'research.updateNote',
  setNoteStatus: 'research.setNoteStatus',
  deleteNote: 'research.deleteNote',
  importAttachment: 'research.importAttachment',
  previewAttachment: 'research.previewAttachment',
  deleteAttachment: 'research.deleteAttachment',
  addLink: 'research.addLink',
  removeLink: 'research.removeLink',
} as const;

export const ResearchNoteStatusSchema = z.enum(['active', 'archived']);
export const ResearchSourceTypeSchema = z.enum(['note', 'attachment']);
export const ResearchNoteSourceTypeSchema = z.string().trim().min(1).max(80).nullable();
export const ResearchTargetTypeSchema = z.enum([
  'chapter',
  'volume',
  'entity',
  'relationship',
  'timeline',
  'foreshadowing',
  'arc',
  'milestone',
  'idea',
]);
export const ResearchTagSchema = z.string().trim().min(1).max(80);
export const ResearchTagsSchema = z.array(ResearchTagSchema).max(50);

export const ResearchNoteSchema = z.strictObject({
  id: z.uuid(),
  projectId: ProjectIdSchema,
  title: z.string().trim().min(1).max(240),
  body: z.string().max(500_000),
  sourceType: ResearchNoteSourceTypeSchema,
  sourceLabel: z.string().trim().min(1).max(240).nullable(),
  sourceUri: z.string().trim().max(4_096).nullable(),
  tags: ResearchTagsSchema,
  status: ResearchNoteStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  archivedAt: z.iso.datetime().nullable(),
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

export const ResearchAttachmentPreviewSchema = z.strictObject({
  projectId: ProjectIdSchema,
  attachmentId: z.uuid(),
  displayName: z.string().trim().min(1).max(240),
  mediaType: z.enum(['text/plain', 'text/markdown', 'application/json']),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/u),
  text: z.string().max(262_144),
  truncated: z.boolean(),
});

export const ResearchListInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  includeArchived: z.boolean().default(false),
  query: z.string().trim().max(500).optional(),
  tags: ResearchTagsSchema.optional(),
  noteSourceType: ResearchNoteSourceTypeSchema.optional(),
  targetType: ResearchTargetTypeSchema.optional(),
  targetId: z.uuid().optional(),
});

export const ResearchNoteCreateInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  title: z.string().trim().min(1).max(240),
  body: z.string().max(500_000).default(''),
  sourceType: ResearchNoteSourceTypeSchema.default(null),
  sourceLabel: z.string().trim().min(1).max(240).nullable().default(null),
  sourceUri: z.string().trim().max(4_096).nullable().default(null),
  tags: ResearchTagsSchema.default([]),
});

export const ResearchNoteUpdateInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  noteId: z.uuid(),
  expectedUpdatedAt: z.iso.datetime(),
  title: z.string().trim().min(1).max(240),
  body: z.string().max(500_000),
  sourceType: ResearchNoteSourceTypeSchema.default(null),
  sourceLabel: z.string().trim().min(1).max(240).nullable().default(null),
  sourceUri: z.string().trim().max(4_096).nullable(),
  tags: ResearchTagsSchema,
});

export const ResearchNoteStatusInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  noteId: z.uuid(),
  expectedUpdatedAt: z.iso.datetime(),
  status: ResearchNoteStatusSchema,
});

export const ResearchNoteDeleteInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  noteId: z.uuid(),
  expectedUpdatedAt: z.iso.datetime(),
});

export const ResearchAttachmentImportInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  noteId: z.uuid().nullable().default(null),
});

export const ResearchAttachmentPreviewInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  attachmentId: z.uuid(),
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
export const ResearchDeleteNoteCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(RESEARCH_COMMANDS.deleteNote),
  payload: ResearchNoteDeleteInputSchema,
});
export const ResearchImportAttachmentCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(RESEARCH_COMMANDS.importAttachment),
  payload: ResearchAttachmentImportInputSchema,
});
export const ResearchPreviewAttachmentCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(RESEARCH_COMMANDS.previewAttachment),
  payload: ResearchAttachmentPreviewInputSchema,
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
  z.strictObject({
    ok: z.literal(true),
    requestId: z.uuid(),
    data: ResearchCatalogSchema,
  }),
  researchFailureSchema,
]);

export const ResearchAttachmentPreviewResultSchema = z.union([
  z.strictObject({
    ok: z.literal(true),
    requestId: z.uuid(),
    data: ResearchAttachmentPreviewSchema,
  }),
  researchFailureSchema,
]);

const catalogSuccess = (operation: (typeof RESEARCH_COMMANDS)[keyof typeof RESEARCH_COMMANDS]) =>
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(operation),
    data: ResearchCatalogSchema,
  });

export const CoreResearchOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal(RESEARCH_COMMANDS.list),
    input: ResearchListInputSchema,
  }),
  z.strictObject({
    operation: z.literal(RESEARCH_COMMANDS.createNote),
    input: ResearchNoteCreateInputSchema,
  }),
  z.strictObject({
    operation: z.literal(RESEARCH_COMMANDS.updateNote),
    input: ResearchNoteUpdateInputSchema,
  }),
  z.strictObject({
    operation: z.literal(RESEARCH_COMMANDS.setNoteStatus),
    input: ResearchNoteStatusInputSchema,
  }),
  z.strictObject({
    operation: z.literal(RESEARCH_COMMANDS.deleteNote),
    input: ResearchNoteDeleteInputSchema,
  }),
  z.strictObject({
    operation: z.literal(RESEARCH_COMMANDS.importAttachment),
    input: ResearchAttachmentImportInputSchema,
    sourcePath: z.string().min(1).max(32_768),
  }),
  z.strictObject({
    operation: z.literal(RESEARCH_COMMANDS.previewAttachment),
    input: ResearchAttachmentPreviewInputSchema,
  }),
  z.strictObject({
    operation: z.literal(RESEARCH_COMMANDS.deleteAttachment),
    input: ResearchAttachmentDeleteInputSchema,
  }),
  z.strictObject({
    operation: z.literal(RESEARCH_COMMANDS.addLink),
    input: ResearchLinkAddInputSchema,
  }),
  z.strictObject({
    operation: z.literal(RESEARCH_COMMANDS.removeLink),
    input: ResearchLinkRemoveInputSchema,
  }),
]);

export const CoreResearchResultSchema = z.union([
  catalogSuccess(RESEARCH_COMMANDS.list),
  catalogSuccess(RESEARCH_COMMANDS.createNote),
  catalogSuccess(RESEARCH_COMMANDS.updateNote),
  catalogSuccess(RESEARCH_COMMANDS.setNoteStatus),
  catalogSuccess(RESEARCH_COMMANDS.deleteNote),
  catalogSuccess(RESEARCH_COMMANDS.importAttachment),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(RESEARCH_COMMANDS.previewAttachment),
    data: ResearchAttachmentPreviewSchema,
  }),
  catalogSuccess(RESEARCH_COMMANDS.deleteAttachment),
  catalogSuccess(RESEARCH_COMMANDS.addLink),
  catalogSuccess(RESEARCH_COMMANDS.removeLink),
  z.strictObject({
    ok: z.literal(false),
    operation: z.enum(RESEARCH_COMMANDS),
    errorCode: ErrorCodeSchema,
  }),
]);

export type ResearchCatalogResult = z.infer<typeof ResearchCatalogResultSchema>;
export type ResearchAttachmentPreviewResult = z.infer<typeof ResearchAttachmentPreviewResultSchema>;

export interface ResearchBridge {
  readonly list: (input: ResearchListInput) => Promise<ResearchCatalogResult>;
  readonly createNote: (input: ResearchNoteCreateInput) => Promise<ResearchCatalogResult>;
  readonly updateNote: (input: ResearchNoteUpdateInput) => Promise<ResearchCatalogResult>;
  readonly setNoteStatus: (input: ResearchNoteStatusInput) => Promise<ResearchCatalogResult>;
  readonly deleteNote: (input: ResearchNoteDeleteInput) => Promise<ResearchCatalogResult>;
  readonly importAttachment: (
    input: ResearchAttachmentImportInput,
  ) => Promise<ResearchCatalogResult>;
  readonly previewAttachment: (
    input: ResearchAttachmentPreviewInput,
  ) => Promise<ResearchAttachmentPreviewResult>;
  readonly deleteAttachment: (
    input: ResearchAttachmentDeleteInput,
  ) => Promise<ResearchCatalogResult>;
  readonly addLink: (input: ResearchLinkAddInput) => Promise<ResearchCatalogResult>;
  readonly removeLink: (input: ResearchLinkRemoveInput) => Promise<ResearchCatalogResult>;
}

export type ResearchNoteStatus = z.infer<typeof ResearchNoteStatusSchema>;
export type ResearchSourceType = z.infer<typeof ResearchSourceTypeSchema>;
export type ResearchNoteSourceType = z.infer<typeof ResearchNoteSourceTypeSchema>;
export type ResearchTargetType = z.infer<typeof ResearchTargetTypeSchema>;
export type ResearchNote = z.infer<typeof ResearchNoteSchema>;
export type ResearchAttachment = z.infer<typeof ResearchAttachmentSchema>;
export type ResearchLink = z.infer<typeof ResearchLinkSchema>;
export type ResearchCatalog = z.infer<typeof ResearchCatalogSchema>;
export type ResearchAttachmentPreview = z.infer<typeof ResearchAttachmentPreviewSchema>;
export type ResearchListInput = z.input<typeof ResearchListInputSchema>;
export type ResearchNoteCreateInput = z.input<typeof ResearchNoteCreateInputSchema>;
export type ResearchNoteUpdateInput = z.input<typeof ResearchNoteUpdateInputSchema>;
export type ResearchNoteStatusInput = z.infer<typeof ResearchNoteStatusInputSchema>;
export type ResearchNoteDeleteInput = z.infer<typeof ResearchNoteDeleteInputSchema>;
export type ResearchAttachmentImportInput = z.input<typeof ResearchAttachmentImportInputSchema>;
export type ResearchAttachmentPreviewInput = z.infer<typeof ResearchAttachmentPreviewInputSchema>;
export type ResearchAttachmentDeleteInput = z.infer<typeof ResearchAttachmentDeleteInputSchema>;
export type ResearchLinkAddInput = z.infer<typeof ResearchLinkAddInputSchema>;
export type ResearchLinkRemoveInput = z.infer<typeof ResearchLinkRemoveInputSchema>;
export type ResearchReference = z.infer<typeof ResearchReferenceSchema>;
export type CoreResearchOperation = z.infer<typeof CoreResearchOperationSchema>;
export type CoreResearchResult = z.infer<typeof CoreResearchResultSchema>;
