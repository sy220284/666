import { z } from 'zod';

import {
  ModelSupportProfileSchema,
  ModelSupportStatusSchema,
  PromptIdSchema,
  PromptOutputModeSchema,
  PromptTaskTypeSchema,
} from './ai-output-protocol.js';
import { ProviderConfigIdSchema, ProviderConfigSchema } from './app-data.js';
import { DraftContentHashValueSchema, DraftEntityIdSchema } from './draft.js';
import { ErrorCodeSchema } from './error-codes.js';
import { GenerationScopeTypeSchema } from './generation-scope.js';
import { IdeaDepthLevelSchema, IdeaDivergenceLevelSchema, IdeaKindSchema } from './idea-capsule.js';
import { ResearchReferencesSchema } from './research.js';
import {
  GenerationResultRefSchema,
  ProjectIdSchema,
  TASK_PROTOCOL_VERSION,
  TaskIdSchema,
} from './task-protocol.js';

export const GENERATION_IPC_CHANNELS = {
  start: 'worldforge:generation:start',
  getRun: 'worldforge:generation:get-run',
  listRuns: 'worldforge:generation:list-runs',
  cancel: 'worldforge:generation:cancel',
  savePartial: 'worldforge:generation:save-partial',
  discardPartial: 'worldforge:generation:discard-partial',
  getModelSupport: 'worldforge:generation:get-model-support',
} as const;

export const GENERATION_COMMANDS = {
  start: 'ai.startGeneration',
  getRun: 'ai.getRun',
  listRuns: 'ai.listRuns',
  cancel: 'ai.cancelGeneration',
  savePartial: 'ai.savePartialCandidate',
  discardPartial: 'ai.discardPartial',
  getModelSupport: 'ai.getModelSupport',
} as const;

export const GenerationRunTypeSchema = PromptTaskTypeSchema;
export const GenerationRunStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);
export const GenerationRunStageSchema = z.enum([
  'queued',
  'assembling_constraints',
  'calling_model',
  'receiving_output',
  'parsing_output',
  'saving_candidate',
  'validating_candidate',
  'completed',
  'failed',
  'cancelled',
]);
export const GenerationPartialStatusSchema = z.enum([
  'unavailable',
  'available',
  'saved',
  'discarded',
]);

export const ChapterGenerationSourceSchema = z.discriminatedUnion('sourceType', [
  z.strictObject({
    sourceType: z.literal('skeleton_candidate'),
    selectedSkeletonCandidateId: DraftEntityIdSchema,
    acknowledgeStaleSource: z.boolean().default(false),
  }),
  z.strictObject({
    sourceType: z.literal('canonical_scene_beats'),
    sceneBeatIds: z.array(DraftEntityIdSchema).min(1).max(256),
  }),
  z.strictObject({
    sourceType: z.literal('direct_chapter_goal'),
    chapterGoal: z.string().trim().min(1).max(32_768),
  }),
]);

export const RewriteSelectionAnchorSchema = z
  .strictObject({
    projectId: ProjectIdSchema,
    chapterId: DraftEntityIdSchema,
    draftId: DraftEntityIdSchema,
    baseRevision: z.number().int().nonnegative(),
    logicalBlockId: DraftEntityIdSchema,
    expectedBlockHash: DraftContentHashValueSchema,
    selectionStart: z.number().int().nonnegative(),
    selectionEnd: z.number().int().positive(),
    selectedTextHash: DraftContentHashValueSchema,
  })
  .refine((anchor) => anchor.selectionEnd > anchor.selectionStart, {
    path: ['selectionEnd'],
    message: 'Rewrite selection end must be after its start.',
  });

export const MergeRangeAnchorSchema = z
  .strictObject({
    logicalBlockId: DraftEntityIdSchema,
    expectedBlockHash: DraftContentHashValueSchema,
    selectionStart: z.number().int().nonnegative(),
    selectionEnd: z.number().int().positive(),
    selectedTextHash: DraftContentHashValueSchema,
  })
  .refine((anchor) => anchor.selectionEnd > anchor.selectionStart, {
    path: ['selectionEnd'],
    message: 'Merge range end must be after its start.',
  });

export const BeatSourceMappingUnitSchema = z
  .strictObject({
    sceneBeatId: DraftEntityIdSchema,
    sourceCandidateId: DraftEntityIdSchema.nullable(),
    sourceBlockIds: z.array(DraftEntityIdSchema).max(10_000),
    keepCurrentDraft: z.boolean(),
  })
  .superRefine((unit, context) => {
    if (unit.keepCurrentDraft === (unit.sourceCandidateId !== null)) {
      context.addIssue({
        code: 'custom',
        message: 'Choose exactly one Candidate source or the current Draft.',
      });
    }
    if (!unit.keepCurrentDraft && unit.sourceBlockIds.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['sourceBlockIds'],
        message: 'Candidate-backed beat mappings require source blocks.',
      });
    }
  });

export const SegmentSourceMappingUnitSchema = z.discriminatedUnion('sourceType', [
  z.strictObject({
    segmentId: DraftEntityIdSchema,
    sourceType: z.literal('candidate'),
    candidateId: DraftEntityIdSchema,
    sourceBlockIds: z.array(DraftEntityIdSchema).min(1).max(10_000),
    order: z.number().int().positive(),
    rangeAnchor: MergeRangeAnchorSchema.optional(),
  }),
  z.strictObject({
    segmentId: DraftEntityIdSchema,
    sourceType: z.literal('current_draft'),
    sourceBlockIds: z.array(DraftEntityIdSchema).min(1).max(10_000),
    order: z.number().int().positive(),
    rangeAnchor: MergeRangeAnchorSchema.optional(),
  }),
]);

export const MergeSourceMappingSchema = z.discriminatedUnion('mappingType', [
  z.strictObject({
    mappingType: z.literal('beat'),
    units: z.array(BeatSourceMappingUnitSchema).min(1).max(256),
  }),
  z.strictObject({
    mappingType: z.literal('segment'),
    units: z.array(SegmentSourceMappingUnitSchema).min(2).max(1_000),
  }),
]);

const generationIntentSchemas = [
  z.strictObject({
    runType: z.literal('skeleton'),
    chapterGoal: z.string().trim().min(1).max(32_768),
    tendency: z.string().trim().min(1).max(512),
    targetLanguage: z.string().min(2).max(32).default('zh-CN'),
    candidateCount: z.number().int().min(1).max(5).default(3),
    requiredSceneBeatIds: z.array(DraftEntityIdSchema).max(256).default([]),
  }),
  z.strictObject({
    runType: z.literal('chapter'),
    source: ChapterGenerationSourceSchema,
    targetLanguage: z.string().min(2).max(32).default('zh-CN'),
    targetCharacters: z.number().int().min(100).max(200_000),
    styleInstructions: z.array(z.string().trim().min(1).max(2_000)).max(32).default([]),
  }),
  z.strictObject({
    runType: z.literal('rewrite'),
    scope: z.discriminatedUnion('scopeType', [
      z.strictObject({
        scopeType: z.literal('selection'),
        anchor: RewriteSelectionAnchorSchema,
      }),
      z
        .strictObject({
          scopeType: z.literal('blocks'),
          logicalBlockIds: z.array(DraftEntityIdSchema).min(1).max(500),
          expectedBlockHashes: z.array(DraftContentHashValueSchema).min(1).max(500),
        })
        .superRefine((scope, context) => {
          if (scope.logicalBlockIds.length !== scope.expectedBlockHashes.length) {
            context.addIssue({
              code: 'custom',
              path: ['expectedBlockHashes'],
              message: 'Every rewrite block requires one expected content hash.',
            });
          }
          if (new Set(scope.logicalBlockIds).size !== scope.logicalBlockIds.length) {
            context.addIssue({
              code: 'custom',
              path: ['logicalBlockIds'],
              message: 'Rewrite logicalBlockIds must be unique.',
            });
          }
        }),
    ]),
    instruction: z.string().trim().min(1).max(8_000),
    targetLanguage: z.string().min(2).max(32).default('zh-CN'),
  }),
  z.strictObject({
    runType: z.literal('merge'),
    mapping: MergeSourceMappingSchema,
    instruction: z.string().trim().min(1).max(8_000).optional(),
    targetLanguage: z.string().min(2).max(32).default('zh-CN'),
  }),
  z.strictObject({
    runType: z.literal('validate'),
    sourceVersionId: DraftEntityIdSchema,
  }),
  z.strictObject({
    runType: z.literal('state_extract'),
    sourceVersionId: DraftEntityIdSchema,
  }),
  z.strictObject({
    runType: z.literal('idea_explore'),
    ideaKind: IdeaKindSchema,
    divergenceLevel: IdeaDivergenceLevelSchema,
    depthLevel: IdeaDepthLevelSchema,
    authorInstruction: z.string().trim().min(1).max(32_768),
    count: z.number().int().min(1).max(8).default(4),
  }),
  z.strictObject({
    runType: z.literal('journal_summarize'),
    journalEntryId: DraftEntityIdSchema,
  }),
] as const;

export const GenerationIntentSchema = z.discriminatedUnion('runType', generationIntentSchemas);

const GenerationStartInputBaseSchema = z.strictObject({
  projectId: ProjectIdSchema,
  scopeType: GenerationScopeTypeSchema.default('chapter'),
  scopeId: DraftEntityIdSchema.nullable().default(null),
  chapterId: DraftEntityIdSchema.nullable().default(null),
  baseDraftId: DraftEntityIdSchema.nullable().default(null),
  baseDraftRevision: z.number().int().nonnegative().nullable().default(null),
  providerId: ProviderConfigIdSchema,
  continuationOfRunId: TaskIdSchema.nullable().default(null),
  researchReferences: ResearchReferencesSchema.default([]),
  intent: GenerationIntentSchema,
});

export const GenerationStartInputSchema = GenerationStartInputBaseSchema.superRefine(
  (input, context) => {
    const scopeId =
      input.scopeId ??
      (input.scopeType === 'chapter'
        ? input.chapterId
        : input.scopeType === 'project'
          ? input.projectId
          : null);
    if (scopeId === null) {
      context.addIssue({
        code: 'custom',
        path: ['scopeId'],
        message: 'Generation scopeId is required for this scope type.',
      });
    }
    if (input.scopeType === 'chapter' && input.chapterId !== scopeId) {
      context.addIssue({
        code: 'custom',
        path: ['chapterId'],
        message: 'Chapter generation scope must use the same chapterId and scopeId.',
      });
    }
    if (
      input.intent.runType !== 'idea_explore' &&
      input.intent.runType !== 'journal_summarize' &&
      input.chapterId === null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['chapterId'],
        message: 'Chapter generation workflows require a chapterId.',
      });
    }
    if (input.intent.runType === 'journal_summarize') {
      if (input.scopeType !== 'project' || scopeId !== input.projectId) {
        context.addIssue({
          code: 'custom',
          path: ['scopeType'],
          message: 'Journal generation must use the current project scope.',
        });
      }
      if (
        input.chapterId !== null ||
        input.baseDraftId !== null ||
        input.baseDraftRevision !== null ||
        input.continuationOfRunId !== null
      ) {
        context.addIssue({
          code: 'custom',
          path: ['intent'],
          message: 'Journal generation cannot bind chapter Draft or continuation state.',
        });
      }
    }
  },
).transform((input) => ({
  ...input,
  scopeId:
    input.scopeId ??
    (input.scopeType === 'chapter'
      ? (input.chapterId as string)
      : input.scopeType === 'project'
        ? input.projectId
        : input.scopeId),
}));

export const GenerationRunSchema = z.strictObject({
  runId: TaskIdSchema,
  requestId: TaskIdSchema,
  taskId: TaskIdSchema,
  projectId: ProjectIdSchema,
  scopeType: GenerationScopeTypeSchema,
  scopeId: DraftEntityIdSchema,
  chapterId: DraftEntityIdSchema.nullable(),
  baseDraftId: DraftEntityIdSchema.nullable(),
  baseDraftRevision: z.number().int().nonnegative().nullable(),
  runType: GenerationRunTypeSchema,
  promptId: PromptIdSchema,
  promptVersion: z.number().int().positive(),
  outputMode: PromptOutputModeSchema,
  providerId: ProviderConfigIdSchema,
  actualModel: z.string().min(1).max(256),
  supportStatus: ModelSupportStatusSchema,
  status: GenerationRunStatusSchema,
  stage: GenerationRunStageSchema,
  retryCount: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  errorCode: ErrorCodeSchema.nullable(),
  retryable: z.boolean().nullable(),
  partialStatus: GenerationPartialStatusSchema,
  resultRefs: z.array(GenerationResultRefSchema).max(1_000),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
});

export const GenerationRunListSchema = z.strictObject({
  runs: z.array(GenerationRunSchema).max(10_000),
});

export const GenerationGetRunInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  runId: TaskIdSchema,
});
export const GenerationListRunsInputSchema = z
  .strictObject({
    projectId: ProjectIdSchema,
    chapterId: DraftEntityIdSchema.nullable().default(null),
    scopeType: GenerationScopeTypeSchema.nullable().default(null),
    scopeId: DraftEntityIdSchema.nullable().default(null),
  })
  .superRefine((input, context) => {
    if ((input.scopeType === null) !== (input.scopeId === null)) {
      context.addIssue({
        code: 'custom',
        path: ['scopeId'],
        message: 'Generation scopeType and scopeId filters must be provided together.',
      });
    }
  });
export const GenerationCancelInputSchema = GenerationGetRunInputSchema;
export const GenerationPartialInputSchema = GenerationGetRunInputSchema;
export const GenerationModelSupportInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  providerId: ProviderConfigIdSchema,
  model: z.string().min(1).max(256),
  taskType: PromptTaskTypeSchema,
  promptId: PromptIdSchema,
  promptVersion: z.number().int().positive(),
});

const commandEnvelope = {
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: TaskIdSchema,
  sentAt: z.iso.datetime(),
};

export const GenerationStartCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(GENERATION_COMMANDS.start),
  payload: GenerationStartInputSchema,
});
export const GenerationGetRunCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(GENERATION_COMMANDS.getRun),
  payload: GenerationGetRunInputSchema,
});
export const GenerationListRunsCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(GENERATION_COMMANDS.listRuns),
  payload: GenerationListRunsInputSchema,
});
export const GenerationCancelCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(GENERATION_COMMANDS.cancel),
  payload: GenerationCancelInputSchema,
});
export const GenerationSavePartialCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(GENERATION_COMMANDS.savePartial),
  payload: GenerationPartialInputSchema,
});
export const GenerationDiscardPartialCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(GENERATION_COMMANDS.discardPartial),
  payload: GenerationPartialInputSchema,
});
export const GenerationGetModelSupportCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(GENERATION_COMMANDS.getModelSupport),
  payload: GenerationModelSupportInputSchema,
});

const failureSchema = z.strictObject({
  ok: z.literal(false),
  requestId: TaskIdSchema,
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
    z.strictObject({
      ok: z.literal(true),
      requestId: TaskIdSchema,
      data: schema,
    }),
    failureSchema,
  ]);

export const GenerationStartResultDataSchema = z.strictObject({
  run: GenerationRunSchema,
  taskId: TaskIdSchema,
});
export const GenerationPartialDecisionSchema = z.strictObject({
  run: GenerationRunSchema,
  candidateId: DraftEntityIdSchema.nullable(),
});
export const GenerationModelSupportResultSchema = z.strictObject({
  profile: ModelSupportProfileSchema,
});
export const GenerationStartResultSchema = resultSchema(GenerationStartResultDataSchema);
export const GenerationRunResultSchema = resultSchema(GenerationRunSchema);
export const GenerationRunListResultSchema = resultSchema(GenerationRunListSchema);
export const GenerationPartialDecisionResultSchema = resultSchema(GenerationPartialDecisionSchema);
export const GenerationModelSupportEnvelopeSchema = resultSchema(
  GenerationModelSupportResultSchema,
);

export const CoreGenerationOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal(GENERATION_COMMANDS.start),
    input: GenerationStartInputSchema,
    provider: ProviderConfigSchema,
    credential: z.string().min(1).max(32_768).nullable(),
  }),
  z.strictObject({
    operation: z.literal(GENERATION_COMMANDS.getRun),
    input: GenerationGetRunInputSchema,
  }),
  z.strictObject({
    operation: z.literal(GENERATION_COMMANDS.listRuns),
    input: GenerationListRunsInputSchema,
  }),
  z.strictObject({
    operation: z.literal(GENERATION_COMMANDS.cancel),
    input: GenerationCancelInputSchema,
  }),
  z.strictObject({
    operation: z.literal(GENERATION_COMMANDS.savePartial),
    input: GenerationPartialInputSchema,
  }),
  z.strictObject({
    operation: z.literal(GENERATION_COMMANDS.discardPartial),
    input: GenerationPartialInputSchema,
  }),
  z.strictObject({
    operation: z.literal(GENERATION_COMMANDS.getModelSupport),
    input: GenerationModelSupportInputSchema,
  }),
]);

export const CoreGenerationResultSchema = z.union([
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(GENERATION_COMMANDS.start),
    data: GenerationStartResultDataSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(GENERATION_COMMANDS.getRun),
    data: GenerationRunSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(GENERATION_COMMANDS.listRuns),
    data: GenerationRunListSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(GENERATION_COMMANDS.cancel),
    data: GenerationRunSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.enum([GENERATION_COMMANDS.savePartial, GENERATION_COMMANDS.discardPartial]),
    data: GenerationPartialDecisionSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(GENERATION_COMMANDS.getModelSupport),
    data: GenerationModelSupportResultSchema,
  }),
  z.strictObject({
    ok: z.literal(false),
    operation: z.enum(GENERATION_COMMANDS),
    errorCode: ErrorCodeSchema,
  }),
]);

export type ChapterGenerationSource = z.infer<typeof ChapterGenerationSourceSchema>;
export type RewriteSelectionAnchor = z.infer<typeof RewriteSelectionAnchorSchema>;
export type MergeRangeAnchor = z.infer<typeof MergeRangeAnchorSchema>;
export type MergeSourceMapping = z.infer<typeof MergeSourceMappingSchema>;
export type GenerationIntent = z.infer<typeof GenerationIntentSchema>;
export type GenerationStartInput = z.input<typeof GenerationStartInputSchema>;
export type GenerationStart = z.output<typeof GenerationStartInputSchema>;
export type GenerationRunType = z.infer<typeof GenerationRunTypeSchema>;
export type GenerationRunStatus = z.infer<typeof GenerationRunStatusSchema>;
export type GenerationRunStage = z.infer<typeof GenerationRunStageSchema>;
export type GenerationPartialStatus = z.infer<typeof GenerationPartialStatusSchema>;
export type GenerationRun = z.infer<typeof GenerationRunSchema>;
export type GenerationGetRunInput = z.infer<typeof GenerationGetRunInputSchema>;
export type GenerationListRunsInput = z.input<typeof GenerationListRunsInputSchema>;
export type GenerationCancelInput = z.infer<typeof GenerationCancelInputSchema>;
export type GenerationPartialInput = z.infer<typeof GenerationPartialInputSchema>;
export type GenerationModelSupportInput = z.infer<typeof GenerationModelSupportInputSchema>;
export type CoreGenerationOperation = z.infer<typeof CoreGenerationOperationSchema>;
export type CoreGenerationResult = z.infer<typeof CoreGenerationResultSchema>;
