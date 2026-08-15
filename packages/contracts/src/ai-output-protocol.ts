import { z } from 'zod';

import { StateProposalDraftSchema } from './state-proposal.js';
import { ProjectIdSchema } from './task-protocol.js';

export const PromptTaskTypeSchema = z.enum([
  'skeleton',
  'chapter',
  'rewrite',
  'merge',
  'validate',
  'state_extract',
  'idea_explore',
  'journal_summarize',
]);
export const PromptOutputModeSchema = z.enum(['structured', 'text']);
export const ProviderProtocolSchema = z.enum(['openai_compatible', 'anthropic', 'custom']);
export const PromptIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z][a-z0-9._-]*$/);
export const ConstraintHashSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const PromptMetadataSchema = z.strictObject({
  promptId: PromptIdSchema,
  promptVersion: z.number().int().positive(),
  taskType: PromptTaskTypeSchema,
  constraintHash: ConstraintHashSchema,
});

export const PromptMessageSchema = z.strictObject({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(2_000_000),
});

export const StructuredOutputRequestSchema = z.strictObject({
  name: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z][a-z0-9_]*$/),
  schema: z.record(z.string(), z.unknown()),
});

export const GenerationRequestSchema = z.strictObject({
  runId: z.uuid(),
  model: z.string().min(1).max(256),
  systemPrompt: z.string().min(1).max(2_000_000),
  messages: z.array(PromptMessageSchema).max(512),
  maxOutputTokens: z.number().int().positive().max(1_000_000),
  temperature: z.number().finite().min(0).max(2).optional(),
  structuredOutput: StructuredOutputRequestSchema.optional(),
  metadata: PromptMetadataSchema,
});

export const ProviderEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('connected') }),
  z.strictObject({ type: z.literal('delta'), text: z.string().min(1).max(65_536) }),
  z
    .strictObject({
      type: z.literal('usage'),
      inputTokens: z.number().int().nonnegative().optional(),
      outputTokens: z.number().int().nonnegative().optional(),
    })
    .refine((event) => event.inputTokens !== undefined || event.outputTokens !== undefined, {
      message: 'Usage requires at least one token count.',
    }),
  z.strictObject({
    type: z.literal('completed'),
    finishReason: z.string().min(1).max(128).optional(),
  }),
  z.strictObject({
    type: z.literal('warning'),
    code: z.string().min(1).max(128),
    message: z.string().min(1).max(512),
  }),
]);

export const CharacterIntentionSchema = z.strictObject({
  characterId: z.string().min(1).max(128),
  intention: z.string().min(1).max(4_096),
});

export const SkeletonBeatSchema = z.strictObject({
  beatId: z.string().min(1).max(128),
  order: z.number().int().positive(),
  event: z.string().min(1).max(16_384),
  cause: z.string().min(1).max(16_384),
  consequence: z.string().min(1).max(16_384),
  informationReleased: z.array(z.string().min(1).max(4_096)).max(256),
  characterIntentions: z.array(CharacterIntentionSchema).max(256),
  transitionToNext: z.string().min(1).max(4_096).optional(),
});

export const SkeletonCandidateOutputSchema = z
  .strictObject({
    titleSuggestion: z.string().min(1).max(512).optional(),
    tendency: z.string().min(1).max(512),
    beats: z.array(SkeletonBeatSchema).min(1).max(256),
    endingHook: z.string().min(1).max(16_384),
    risks: z.array(z.string().min(1).max(4_096)).max(256),
  })
  .superRefine((output, context) => {
    const beatIds = new Set<string>();
    const orders = new Set<number>();
    for (const beat of output.beats) {
      if (beatIds.has(beat.beatId)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate beatId: ${beat.beatId}`,
          path: ['beats'],
        });
      }
      if (orders.has(beat.order)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate beat order: ${beat.order}`,
          path: ['beats'],
        });
      }
      beatIds.add(beat.beatId);
      orders.add(beat.order);
    }
  });

export const SkeletonCandidateBatchOutputSchema = z.strictObject({
  candidates: z.array(SkeletonCandidateOutputSchema).min(1).max(5),
});

export const ChapterCandidateBlockSchema = z.strictObject({
  temporaryId: z.string().min(1).max(128),
  beatId: z.string().min(1).max(128).optional(),
  type: z.enum(['paragraph', 'dialogue', 'heading', 'separator']),
  content: z.string().min(1).max(200_000),
});

export const ChapterCandidateOutputSchema = z
  .strictObject({
    blocks: z.array(ChapterCandidateBlockSchema).min(1).max(10_000),
  })
  .superRefine((output, context) => {
    const temporaryIds = new Set<string>();
    for (const block of output.blocks) {
      if (temporaryIds.has(block.temporaryId)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate temporaryId: ${block.temporaryId}`,
          path: ['blocks'],
        });
      }
      temporaryIds.add(block.temporaryId);
    }
  });

export const SkeletonCandidateJsonSchema = z.toJSONSchema(SkeletonCandidateOutputSchema);
export const SkeletonCandidateBatchJsonSchema = z.toJSONSchema(SkeletonCandidateBatchOutputSchema);
export const ChapterCandidateJsonSchema = z.toJSONSchema(ChapterCandidateOutputSchema);

export const ModelSupportStatusSchema = z.enum(['verified', 'limited', 'unverified']);
const CanonicalModelSupportProfileSchema = z.strictObject({
  providerId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
  model: z.string().min(1).max(256),
  taskType: PromptTaskTypeSchema,
  promptId: PromptIdSchema,
  promptVersion: z.number().int().positive(),
  status: ModelSupportStatusSchema,
  evaluatedAt: z.iso.datetime().optional(),
  fixtureSetVersion: z.string().min(1).max(128).optional(),
  metrics: z.record(z.string(), z.number().finite()).optional(),
  limitations: z.array(z.string().min(1).max(4_096)).max(256),
});
export const ModelSupportProfileSchema = z.preprocess((input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const profile = input as Record<string, unknown>;
  return profile.status === 'untested' ? { ...profile, status: 'unverified' } : input;
}, CanonicalModelSupportProfileSchema);

export const RequiredBeatSchema = z.strictObject({
  beatId: z.string().min(1).max(128),
  event: z.string().min(1).max(16_384),
});

export const SkeletonPromptInputSchema = z.strictObject({
  constraintHash: ConstraintHashSchema,
  targetLanguage: z.string().min(2).max(32),
  chapterGoal: z.string().min(1).max(32_768),
  requiredBeats: z.array(RequiredBeatSchema).max(256),
  tendency: z.string().min(1).max(512),
});

export const ChapterPromptInputSchema = z.strictObject({
  projectId: ProjectIdSchema.optional(),
  constraintHash: ConstraintHashSchema,
  targetLanguage: z.string().min(2).max(32),
  chapterGoal: z.string().min(1).max(32_768),
  beats: z.array(RequiredBeatSchema).min(1).max(256),
  targetCharacters: z.number().int().positive().max(200_000),
  outputMode: PromptOutputModeSchema,
});

export const PromptConstraintContextSchema = z.string().min(1).max(2_000_000);
export const ProductionSkeletonPromptInputSchema = SkeletonPromptInputSchema.extend({
  constraintContext: PromptConstraintContextSchema,
  candidateCount: z.number().int().min(1).max(5).default(3),
}).strict();

export const ResolvedChapterGenerationSourceSchema = z.discriminatedUnion('sourceType', [
  z.strictObject({
    sourceType: z.literal('skeleton_candidate'),
    selectedSkeletonCandidateId: z.uuid(),
    beats: z.array(RequiredBeatSchema).min(1).max(256),
  }),
  z.strictObject({
    sourceType: z.literal('canonical_scene_beats'),
    sceneBeatIds: z.array(z.uuid()).min(1).max(256),
    beats: z.array(RequiredBeatSchema).min(1).max(256),
  }),
  z.strictObject({
    sourceType: z.literal('direct_chapter_goal'),
    chapterGoal: z.string().trim().min(1).max(32_768),
  }),
]);

export const ProductionChapterPromptInputSchema = z.strictObject({
  constraintHash: ConstraintHashSchema,
  constraintContext: PromptConstraintContextSchema,
  targetLanguage: z.string().min(2).max(32),
  source: ResolvedChapterGenerationSourceSchema,
  targetCharacters: z.number().int().positive().max(200_000),
  styleInstructions: z.array(z.string().trim().min(1).max(2_000)).max(32).default([]),
  outputMode: PromptOutputModeSchema,
  continuation: z
    .strictObject({
      originalRunId: z.uuid(),
      receivedText: z.string().min(1).max(2_000_000),
      originalPromptId: PromptIdSchema,
      originalPromptVersion: z.number().int().positive(),
      originalConstraintHash: ConstraintHashSchema,
    })
    .optional(),
});

export const RewritePromptInputSchema = z.strictObject({
  constraintHash: ConstraintHashSchema,
  constraintContext: PromptConstraintContextSchema,
  targetLanguage: z.string().min(2).max(32),
  instruction: z.string().trim().min(1).max(8_000),
  sourceText: z.string().min(1).max(200_000),
});
export const RewriteOutputSchema = z.strictObject({
  replacement: z.string().min(1).max(200_000),
  rationale: z.string().min(1).max(8_000).optional(),
});

export const MergePromptInputSchema = z.strictObject({
  constraintHash: ConstraintHashSchema,
  constraintContext: PromptConstraintContextSchema,
  targetLanguage: z.string().min(2).max(32),
  sources: z
    .array(
      z.strictObject({
        candidateId: z.uuid(),
        text: z.string().min(1).max(400_000),
      }),
    )
    .min(2)
    .max(20),
  instruction: z.string().trim().min(1).max(8_000).optional(),
});

export const PromptDocumentBlockSchema = z.strictObject({
  logicalBlockId: z.uuid(),
  content: z.string().max(200_000),
});
export const SemanticValidationPromptInputSchema = z.strictObject({
  constraintHash: ConstraintHashSchema,
  constraintContext: PromptConstraintContextSchema,
  versionId: z.uuid(),
  blocks: z.array(PromptDocumentBlockSchema).min(1).max(50_000),
});
export const SemanticValidationIssueSchema = z
  .strictObject({
    type: z.string().trim().min(1).max(120),
    severity: z.enum(['high', 'medium', 'low', 'info']),
    logicalBlockId: z.uuid().optional(),
    quote: z.string().min(1).max(2_000).optional(),
    rationale: z.string().trim().min(1).max(8_000),
    evidenceIds: z.array(z.string().trim().min(1).max(240)).max(100),
    suggestion: z.string().trim().min(1).max(8_000).optional(),
    confidence: z.number().finite().min(0).max(1),
  })
  .superRefine((issue, context) => {
    if (issue.severity === 'high' && issue.evidenceIds.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['evidenceIds'],
        message: 'High-severity semantic issues require evidence.',
      });
    }
  });
export const SemanticValidationOutputSchema = z.strictObject({
  issues: z.array(SemanticValidationIssueSchema).max(2_000),
});

export const StateExtractionPromptInputSchema = z.strictObject({
  constraintHash: ConstraintHashSchema,
  constraintContext: PromptConstraintContextSchema,
  finalVersionId: z.uuid(),
  blocks: z.array(PromptDocumentBlockSchema).min(1).max(50_000),
});
export const StateExtractionOutputSchema = z.strictObject({
  proposals: z.array(StateProposalDraftSchema).max(200),
});

export const RewriteOutputJsonSchema = z.toJSONSchema(RewriteOutputSchema);
export const SemanticValidationOutputJsonSchema = z.toJSONSchema(SemanticValidationOutputSchema);
export const StateExtractionOutputJsonSchema = z.toJSONSchema(StateExtractionOutputSchema);

export type ContractSchema<T> = z.ZodType<T>;
export type PromptTaskType = z.infer<typeof PromptTaskTypeSchema>;
export type PromptOutputMode = z.infer<typeof PromptOutputModeSchema>;
export type PromptMetadata = z.infer<typeof PromptMetadataSchema>;
export type GenerationRequest = z.infer<typeof GenerationRequestSchema>;
export type ProviderEvent = z.infer<typeof ProviderEventSchema>;
export type SkeletonCandidateOutput = z.infer<typeof SkeletonCandidateOutputSchema>;
export type SkeletonCandidateBatchOutput = z.infer<typeof SkeletonCandidateBatchOutputSchema>;
export type ChapterCandidateOutput = z.infer<typeof ChapterCandidateOutputSchema>;
export type ModelSupportProfile = z.infer<typeof ModelSupportProfileSchema>;
export type ModelSupportStatus = z.infer<typeof ModelSupportStatusSchema>;
export type SkeletonPromptInput = z.infer<typeof SkeletonPromptInputSchema>;
export type ChapterPromptInput = z.infer<typeof ChapterPromptInputSchema>;
export type ProductionSkeletonPromptInput = z.infer<typeof ProductionSkeletonPromptInputSchema>;
export type ProductionChapterPromptInput = z.infer<typeof ProductionChapterPromptInputSchema>;
export type RequiredBeat = z.infer<typeof RequiredBeatSchema>;
export type ResolvedChapterGenerationSource = z.infer<typeof ResolvedChapterGenerationSourceSchema>;
export type RewritePromptInput = z.infer<typeof RewritePromptInputSchema>;
export type RewriteOutput = z.infer<typeof RewriteOutputSchema>;
export type MergePromptInput = z.infer<typeof MergePromptInputSchema>;
export type SemanticValidationPromptInput = z.infer<typeof SemanticValidationPromptInputSchema>;
export type SemanticValidationOutput = z.infer<typeof SemanticValidationOutputSchema>;
export type StateExtractionPromptInput = z.infer<typeof StateExtractionPromptInputSchema>;
export type StateExtractionOutput = z.infer<typeof StateExtractionOutputSchema>;