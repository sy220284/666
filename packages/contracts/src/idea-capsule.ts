import { z } from 'zod';

import { ConstraintHashSchema } from './ai-output-protocol.js';
import { DraftEntityIdSchema } from './draft.js';
import { GenerationScopeTypeSchema } from './generation-scope.js';
import { ProjectIdSchema, TaskIdSchema } from './task-protocol.js';

export const IdeaKindSchema = z.enum([
  'new_book',
  'character',
  'plot',
  'worldbuilding',
  'foreshadowing',
  'twist',
  'relationship',
  'ending',
  'custom',
]);
export const IdeaDivergenceLevelSchema = z.enum(['safe', 'different', 'wild']);
export const IdeaDepthLevelSchema = z.enum(['spark', 'expand', 'deep']);
export const IdeaStatusSchema = z.enum(['active', 'favorite', 'converted', 'discarded']);
export const IdeaConversionStatusSchema = z.enum(['applied', 'target_missing', 'target_stale']);
export const IdeaConversionTargetTypeSchema = z.enum([
  'project_brief',
  'plot_node',
  'scene_beat',
  'entity',
  'canon_fact',
  'timeline_event',
  'character_relationship',
  'foreshadowing',
  'character_arc',
]);

export const IdeaSourceContextSchema = z.strictObject({
  scopeType: GenerationScopeTypeSchema,
  scopeId: DraftEntityIdSchema,
  chapterId: DraftEntityIdSchema.nullable(),
  label: z.string().trim().min(1).max(512).optional(),
});

export const IdeaCardSchema = z.strictObject({
  id: DraftEntityIdSchema,
  projectId: ProjectIdSchema,
  ideaKind: IdeaKindSchema,
  title: z.string().trim().min(1).max(512),
  summary: z.string().trim().min(1).max(8_000),
  content: z.string().trim().min(1).max(200_000),
  divergenceLevel: IdeaDivergenceLevelSchema,
  depthLevel: IdeaDepthLevelSchema,
  sourceContext: IdeaSourceContextSchema,
  generationRunId: TaskIdSchema.nullable(),
  status: IdeaStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const IdeaConversionSchema = z.strictObject({
  id: DraftEntityIdSchema,
  projectId: ProjectIdSchema,
  ideaId: DraftEntityIdSchema,
  targetType: IdeaConversionTargetTypeSchema,
  targetId: DraftEntityIdSchema,
  status: IdeaConversionStatusSchema,
  createdAt: z.iso.datetime(),
});

export const IdeaExplorePromptInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  scopeType: GenerationScopeTypeSchema,
  scopeId: DraftEntityIdSchema,
  chapterId: DraftEntityIdSchema.nullable(),
  ideaKind: IdeaKindSchema,
  divergenceLevel: IdeaDivergenceLevelSchema,
  depthLevel: IdeaDepthLevelSchema,
  authorInstruction: z.string().trim().min(1).max(32_768),
  context: z.string().max(2_000_000),
  constraintHash: ConstraintHashSchema,
  count: z.number().int().min(1).max(8).default(4),
});

export const IdeaExploreOutputItemSchema = z.strictObject({
  title: z.string().trim().min(1).max(512),
  summary: z.string().trim().min(1).max(8_000),
  content: z.string().trim().min(1).max(200_000),
});
export const IdeaExploreOutputSchema = z.strictObject({
  ideas: z.array(IdeaExploreOutputItemSchema).min(1).max(8),
});
export const IdeaExploreOutputJsonSchema = z.toJSONSchema(IdeaExploreOutputSchema);

export type IdeaKind = z.infer<typeof IdeaKindSchema>;
export type IdeaDivergenceLevel = z.infer<typeof IdeaDivergenceLevelSchema>;
export type IdeaDepthLevel = z.infer<typeof IdeaDepthLevelSchema>;
export type IdeaStatus = z.infer<typeof IdeaStatusSchema>;
export type IdeaConversionStatus = z.infer<typeof IdeaConversionStatusSchema>;
export type IdeaConversionTargetType = z.infer<typeof IdeaConversionTargetTypeSchema>;
export type IdeaSourceContext = z.infer<typeof IdeaSourceContextSchema>;
export type IdeaCard = z.infer<typeof IdeaCardSchema>;
export type IdeaConversion = z.infer<typeof IdeaConversionSchema>;
export type IdeaExplorePromptInput = z.input<typeof IdeaExplorePromptInputSchema>;
export type IdeaExploreOutputItem = z.infer<typeof IdeaExploreOutputItemSchema>;
export type IdeaExploreOutput = z.infer<typeof IdeaExploreOutputSchema>;
