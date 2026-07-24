import { z } from 'zod';

import { SnapshotSourceSchema } from './state-proposal.js';
import { ProjectIdSchema } from './task-protocol.js';

export const ConstraintTaskTypeSchema = z.enum([
  'skeleton',
  'chapter',
  'rewrite',
  'merge',
  'validate',
  'state_extract',
]);
export const ConstraintPrioritySchema = z.enum(['P0', 'P1', 'P2', 'P3', 'P4']);
export const ConstraintSourceTypeSchema = z.enum([
  'project_brief',
  'chapter',
  'scene_beat',
  'ending_snapshot',
  'entity_state',
  'knowledge_state',
  'foreshadowing',
  'entity',
  'canon_fact',
  'character_arc',
  'current_draft',
  'supplemental_search',
]);
export const ConstraintTemporalStatusSchema = z.enum([
  'current',
  'historical',
  'upcoming',
  'snapshot',
]);
export const ConstraintPackageHashSchema = z.string().regex(/^[0-9a-f]{64}$/u);

export const ConstraintSourceSchema = z.strictObject({
  id: z.string().min(1).max(1_000),
  priority: ConstraintPrioritySchema,
  sourceType: ConstraintSourceTypeSchema,
  sourceId: z.string().min(1).max(500),
  sourceVersionId: z.uuid().nullable(),
  chapterId: z.uuid().nullable(),
  entityId: z.uuid().nullable(),
  semanticKey: z.string().min(1).max(500),
  label: z.string().min(1).max(500),
  content: z.string().min(1).max(200_000),
  relevance: z.number().finite().min(0).max(1),
  required: z.boolean(),
  temporalStatus: ConstraintTemporalStatusSchema,
  estimatedTokens: z.number().int().positive(),
  contentHash: ConstraintPackageHashSchema,
});

export const ConstraintConflictSchema = z.strictObject({
  semanticKey: z.string().min(1).max(500),
  sourceIds: z.array(z.string().min(1).max(1_000)).min(2),
  contentHashes: z.array(ConstraintPackageHashSchema).min(2),
});

export const ConstraintTrimEntrySchema = z.strictObject({
  sourceId: z.string().min(1).max(1_000),
  priority: ConstraintPrioritySchema,
  estimatedTokens: z.number().int().positive(),
  reason: z.literal('token_budget'),
});

export const ConstraintPackageBuildInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: z.uuid(),
  taskType: ConstraintTaskTypeSchema,
  query: z.string().trim().min(1).max(500).optional(),
  maxInputTokens: z.number().int().min(512).max(262_144).default(32_768),
  safetyMarginTokens: z.number().int().min(0).max(65_536).default(2_048),
  maxSupplementalResults: z.number().int().min(0).max(50).default(12),
});

export const ConstraintSectionsSchema = z.strictObject({
  P0: z.array(ConstraintSourceSchema),
  P1: z.array(ConstraintSourceSchema),
  P2: z.array(ConstraintSourceSchema),
  P3: z.array(ConstraintSourceSchema),
  P4: z.array(ConstraintSourceSchema),
});

export const ConstraintPackageSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: z.uuid(),
  taskType: ConstraintTaskTypeSchema,
  snapshotSource: SnapshotSourceSchema,
  sections: ConstraintSectionsSchema,
  sourceVersionIds: z.array(z.uuid()),
  estimatedTokens: z.number().int().nonnegative(),
  budget: z.strictObject({
    maxInputTokens: z.number().int().positive(),
    safetyMarginTokens: z.number().int().nonnegative(),
    usableTokens: z.number().int().positive(),
  }),
  contentHash: ConstraintPackageHashSchema,
  constraintHash: ConstraintPackageHashSchema,
  trimLog: z.array(ConstraintTrimEntrySchema),
  conflicts: z.array(ConstraintConflictSchema),
});

export type ConstraintTaskType = z.infer<typeof ConstraintTaskTypeSchema>;
export type ConstraintPriority = z.infer<typeof ConstraintPrioritySchema>;
export type ConstraintSourceType = z.infer<typeof ConstraintSourceTypeSchema>;
export type ConstraintTemporalStatus = z.infer<typeof ConstraintTemporalStatusSchema>;
export type ConstraintSource = z.infer<typeof ConstraintSourceSchema>;
export type ConstraintConflict = z.infer<typeof ConstraintConflictSchema>;
export type ConstraintTrimEntry = z.infer<typeof ConstraintTrimEntrySchema>;
export type ConstraintPackageBuildInput = z.input<typeof ConstraintPackageBuildInputSchema>;
export type ConstraintPackage = z.infer<typeof ConstraintPackageSchema>;
