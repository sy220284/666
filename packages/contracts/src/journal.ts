import { z } from 'zod';

import { ErrorCodeSchema } from './error-codes.js';
import { ProjectIdSchema, TASK_PROTOCOL_VERSION } from './task-protocol.js';

export const JOURNAL_IPC_CHANNELS = {
  list: 'worldforge:journal:list',
  preview: 'worldforge:journal:preview',
  generate: 'worldforge:journal:generate',
  updateNote: 'worldforge:journal:update-note',
  updatePreferences: 'worldforge:journal:update-preferences',
  catchUp: 'worldforge:journal:catch-up',
  markAiFailed: 'worldforge:journal:mark-ai-failed',
} as const;

export const JOURNAL_COMMANDS = {
  list: 'journal.list',
  preview: 'journal.preview',
  generate: 'journal.generate',
  updateNote: 'journal.updateNote',
  updatePreferences: 'journal.updatePreferences',
  catchUp: 'journal.catchUp',
  markAiFailed: 'journal.markAiFailed',
} as const;

export const JournalPeriodTypeSchema = z.enum(['manual', 'daily', 'weekly']);
export const JournalScheduleSchema = z.enum(['off', 'daily', 'weekly']);
export const JournalEntryStatusSchema = z.enum([
  'deterministic',
  'ai_pending',
  'ready',
  'ai_failed',
]);

const JournalCountSchema = z.number().int().nonnegative();

export const JournalDigestReferenceSchema = z.strictObject({
  scopeType: z.enum(['chapter', 'volume', 'project']),
  scopeId: z.string().min(1).max(256),
  sourceHash: z.string().regex(/^[0-9a-f]{64}$/u),
  freshness: z.enum(['fresh', 'stale']),
  semanticRevision: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
});

export const JournalNavigationReferenceSchema = z.discriminatedUnion('targetType', [
  z.strictObject({
    targetType: z.literal('chapter'),
    targetId: z.uuid(),
    label: z.string().trim().min(1).max(512),
  }),
  z.strictObject({
    targetType: z.literal('version'),
    targetId: z.uuid(),
    chapterId: z.uuid(),
    label: z.string().trim().min(1).max(512),
  }),
  z.strictObject({
    targetType: z.literal('entity'),
    targetId: z.uuid(),
    label: z.string().trim().min(1).max(512),
  }),
  z.strictObject({
    targetType: z.literal('validation'),
    targetId: z.uuid(),
    chapterId: z.uuid().nullable(),
    versionId: z.uuid().nullable(),
    logicalBlockId: z.uuid().nullable(),
    label: z.string().trim().min(1).max(512),
  }),
  z.strictObject({
    targetType: z.literal('idea'),
    targetId: z.uuid(),
    label: z.string().trim().min(1).max(512),
  }),
]);

export const JournalDeterministicSummarySchema = z.strictObject({
  periodStart: z.iso.datetime(),
  periodEnd: z.iso.datetime(),
  writing: z.strictObject({
    sessions: JournalCountSchema,
    netCharacters: z.number().int(),
    activeSeconds: JournalCountSchema,
    touchedChapters: JournalCountSchema,
  }),
  versions: z.strictObject({
    created: JournalCountSchema,
    finalized: JournalCountSchema,
  }),
  generation: z.strictObject({
    started: JournalCountSchema,
    succeeded: JournalCountSchema,
    failed: JournalCountSchema,
    cancelled: JournalCountSchema,
    acceptedCandidates: JournalCountSchema,
  }),
  review: z.strictObject({
    stateProposalsResolved: JournalCountSchema,
    validationIssuesCreated: JournalCountSchema,
    validationIssuesResolved: JournalCountSchema,
    todosCreated: JournalCountSchema,
    todosCompleted: JournalCountSchema,
    commentsCreated: JournalCountSchema,
    commentsResolved: JournalCountSchema,
  }),
  ideas: z.strictObject({
    created: JournalCountSchema,
    converted: JournalCountSchema,
  }),
  knowledge: z.strictObject({
    relationshipChanges: JournalCountSchema,
    timelineChanges: JournalCountSchema,
    foreshadowingChanges: JournalCountSchema,
    arcChanges: JournalCountSchema,
  }),
  recovery: z.strictObject({
    backupsCreated: JournalCountSchema,
  }),
  navigationReferences: z.array(JournalNavigationReferenceSchema).max(100),
  digestReferences: z.array(JournalDigestReferenceSchema).max(10_000),
});

export const JournalAiSummaryOutputSchema = z.strictObject({
  summary: z.string().trim().min(1).max(40_000),
  highlights: z.array(z.string().trim().min(1).max(2_000)).max(20).default([]),
  nextFocus: z.array(z.string().trim().min(1).max(2_000)).max(20).default([]),
});

export const JournalAiSummaryOutputJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'highlights', 'nextFocus'],
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: 40000 },
    highlights: {
      type: 'array',
      maxItems: 20,
      items: { type: 'string', minLength: 1, maxLength: 2000 },
    },
    nextFocus: {
      type: 'array',
      maxItems: 20,
      items: { type: 'string', minLength: 1, maxLength: 2000 },
    },
  },
} as const;

export const JournalAiPromptInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  journalEntryId: z.uuid(),
  periodType: JournalPeriodTypeSchema,
  deterministicSummary: JournalDeterministicSummarySchema,
  projectDigest: z.string().max(12_000).nullable(),
  constraintHash: z.string().regex(/^[0-9a-f]{64}$/u),
});

export const JournalEntrySchema = z.strictObject({
  id: z.uuid(),
  projectId: ProjectIdSchema,
  periodType: JournalPeriodTypeSchema,
  periodStart: z.iso.datetime(),
  periodEnd: z.iso.datetime(),
  sourceRevision: z.number().int().nonnegative(),
  sourceHash: z.string().regex(/^[0-9a-f]{64}$/u),
  deterministicSummary: JournalDeterministicSummarySchema,
  aiSummary: z.string().max(40_000).nullable(),
  authorNote: z.string().max(20_000).nullable(),
  generationRunId: z.uuid().nullable(),
  status: JournalEntryStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const JournalPreferencesSchema = z.strictObject({
  projectId: ProjectIdSchema,
  schedule: JournalScheduleSchema,
  updatedAt: z.iso.datetime(),
});

export const JournalCatalogSchema = z.strictObject({
  projectId: ProjectIdSchema,
  entries: z.array(JournalEntrySchema).max(500),
  preferences: JournalPreferencesSchema,
  nextCursor: z.string().min(1).max(256).nullable(),
});

export const JournalListInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  limit: z.number().int().min(1).max(100).default(30),
  before: z.iso.datetime().nullable().default(null),
});

export const JournalWindowInputSchema = z
  .strictObject({
    projectId: ProjectIdSchema,
    periodType: JournalPeriodTypeSchema,
    periodStart: z.iso.datetime(),
    periodEnd: z.iso.datetime(),
  })
  .refine((input) => Date.parse(input.periodStart) < Date.parse(input.periodEnd), {
    path: ['periodEnd'],
    message: 'Journal period end must be after period start.',
  });

export const JournalPreviewSchema = z.strictObject({
  projectId: ProjectIdSchema,
  periodType: JournalPeriodTypeSchema,
  sourceRevision: z.number().int().nonnegative(),
  sourceHash: z.string().regex(/^[0-9a-f]{64}$/u),
  deterministicSummary: JournalDeterministicSummarySchema,
});

export const JournalUpdateNoteInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  entryId: z.uuid(),
  expectedUpdatedAt: z.iso.datetime(),
  authorNote: z.string().max(20_000).nullable(),
});

export const JournalUpdatePreferencesInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  schedule: JournalScheduleSchema,
});

export const JournalCatchUpInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  now: z.iso.datetime().optional(),
});

export const JournalMarkAiFailedInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  entryId: z.uuid(),
  generationRunId: z.uuid().nullable().default(null),
});

const commandEnvelope = {
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: z.uuid(),
  sentAt: z.iso.datetime(),
};

export const JournalListCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(JOURNAL_COMMANDS.list),
  payload: JournalListInputSchema,
});
export const JournalPreviewCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(JOURNAL_COMMANDS.preview),
  payload: JournalWindowInputSchema,
});
export const JournalGenerateCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(JOURNAL_COMMANDS.generate),
  payload: JournalWindowInputSchema,
});
export const JournalUpdateNoteCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(JOURNAL_COMMANDS.updateNote),
  payload: JournalUpdateNoteInputSchema,
});
export const JournalUpdatePreferencesCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(JOURNAL_COMMANDS.updatePreferences),
  payload: JournalUpdatePreferencesInputSchema,
});
export const JournalCatchUpCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(JOURNAL_COMMANDS.catchUp),
  payload: JournalCatchUpInputSchema,
});
export const JournalMarkAiFailedCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(JOURNAL_COMMANDS.markAiFailed),
  payload: JournalMarkAiFailedInputSchema,
});

const journalFailureSchema = z.strictObject({
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

export const JournalCatalogResultSchema = z.union([
  z.strictObject({
    ok: z.literal(true),
    requestId: z.uuid(),
    data: JournalCatalogSchema,
  }),
  journalFailureSchema,
]);

export const JournalPreviewResultSchema = z.union([
  z.strictObject({
    ok: z.literal(true),
    requestId: z.uuid(),
    data: JournalPreviewSchema,
  }),
  journalFailureSchema,
]);

const catalogSuccess = (operation: (typeof JOURNAL_COMMANDS)[keyof typeof JOURNAL_COMMANDS]) =>
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(operation),
    data: JournalCatalogSchema,
  });

export const CoreJournalOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal(JOURNAL_COMMANDS.list), input: JournalListInputSchema }),
  z.strictObject({
    operation: z.literal(JOURNAL_COMMANDS.preview),
    input: JournalWindowInputSchema,
  }),
  z.strictObject({
    operation: z.literal(JOURNAL_COMMANDS.generate),
    input: JournalWindowInputSchema,
  }),
  z.strictObject({
    operation: z.literal(JOURNAL_COMMANDS.updateNote),
    input: JournalUpdateNoteInputSchema,
  }),
  z.strictObject({
    operation: z.literal(JOURNAL_COMMANDS.updatePreferences),
    input: JournalUpdatePreferencesInputSchema,
  }),
  z.strictObject({
    operation: z.literal(JOURNAL_COMMANDS.catchUp),
    input: JournalCatchUpInputSchema,
  }),
  z.strictObject({
    operation: z.literal(JOURNAL_COMMANDS.markAiFailed),
    input: JournalMarkAiFailedInputSchema,
  }),
]);

export const CoreJournalResultSchema = z.union([
  catalogSuccess(JOURNAL_COMMANDS.list),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(JOURNAL_COMMANDS.preview),
    data: JournalPreviewSchema,
  }),
  catalogSuccess(JOURNAL_COMMANDS.generate),
  catalogSuccess(JOURNAL_COMMANDS.updateNote),
  catalogSuccess(JOURNAL_COMMANDS.updatePreferences),
  catalogSuccess(JOURNAL_COMMANDS.catchUp),
  catalogSuccess(JOURNAL_COMMANDS.markAiFailed),
  z.strictObject({
    ok: z.literal(false),
    operation: z.enum(JOURNAL_COMMANDS),
    errorCode: ErrorCodeSchema,
  }),
]);

export type JournalCatalogResult = z.infer<typeof JournalCatalogResultSchema>;
export type JournalPreviewResult = z.infer<typeof JournalPreviewResultSchema>;

export interface JournalBridge {
  readonly list: (input: JournalListInput) => Promise<JournalCatalogResult>;
  readonly preview: (input: JournalWindowInput) => Promise<JournalPreviewResult>;
  readonly generate: (input: JournalWindowInput) => Promise<JournalCatalogResult>;
  readonly updateNote: (input: JournalUpdateNoteInput) => Promise<JournalCatalogResult>;
  readonly updatePreferences: (
    input: JournalUpdatePreferencesInput,
  ) => Promise<JournalCatalogResult>;
  readonly catchUp: (input: JournalCatchUpInput) => Promise<JournalCatalogResult>;
  readonly markAiFailed: (input: JournalMarkAiFailedInput) => Promise<JournalCatalogResult>;
}

export type JournalPeriodType = z.infer<typeof JournalPeriodTypeSchema>;
export type JournalSchedule = z.infer<typeof JournalScheduleSchema>;
export type JournalEntryStatus = z.infer<typeof JournalEntryStatusSchema>;
export type JournalNavigationReference = z.infer<typeof JournalNavigationReferenceSchema>;
export type JournalDeterministicSummary = z.infer<typeof JournalDeterministicSummarySchema>;
export type JournalAiSummaryOutput = z.infer<typeof JournalAiSummaryOutputSchema>;
export type JournalAiPromptInput = z.infer<typeof JournalAiPromptInputSchema>;
export type JournalEntry = z.infer<typeof JournalEntrySchema>;
export type JournalPreferences = z.infer<typeof JournalPreferencesSchema>;
export type JournalCatalog = z.infer<typeof JournalCatalogSchema>;
export type JournalListInput = z.input<typeof JournalListInputSchema>;
export type JournalWindowInput = z.infer<typeof JournalWindowInputSchema>;
export type JournalPreview = z.infer<typeof JournalPreviewSchema>;
export type JournalUpdateNoteInput = z.infer<typeof JournalUpdateNoteInputSchema>;
export type JournalUpdatePreferencesInput = z.infer<typeof JournalUpdatePreferencesInputSchema>;
export type JournalCatchUpInput = z.input<typeof JournalCatchUpInputSchema>;
export type JournalMarkAiFailedInput = z.input<typeof JournalMarkAiFailedInputSchema>;
export type CoreJournalOperation = z.infer<typeof CoreJournalOperationSchema>;
export type CoreJournalResult = z.infer<typeof CoreJournalResultSchema>;
