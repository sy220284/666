import { z } from 'zod';

import { EvidenceAnchorSchema, EntityStateKeySchema } from './continuity.js';
import { ProjectIdSchema } from './task-protocol.js';
import {
  StateProposalBatchSchema,
  StateProposalSourceSchema,
  StateProposalStatusSchema,
} from './state-proposal.js';

export const ReviewProposalTypeSchema = z.enum(['entity_state', 'arc_milestone']);
export const ReviewProposalFreshnessSchema = z.enum(['current', 'stale']);
export const ReviewProposalActionabilitySchema = z.enum(['accept', 'reject_only']);
export const ReviewProposalConfidenceSchema = z.enum(['high', 'medium', 'low']);

export const ReviewProposalTargetSchema = z.discriminatedUnion('targetType', [
  z.strictObject({
    targetType: z.literal('entity_state'),
    entityId: z.uuid(),
    stateKey: EntityStateKeySchema,
    validUntilChapterId: z.uuid().nullable(),
  }),
  z.strictObject({
    targetType: z.literal('arc_milestone'),
    arcMilestoneId: z.uuid(),
  }),
]);

export const ReviewProposalSchema = z
  .strictObject({
    id: z.uuid(),
    batchId: z.uuid().nullable(),
    generationRunId: z.uuid().nullable(),
    projectId: ProjectIdSchema,
    chapterId: z.uuid(),
    sourceVersionId: z.uuid(),
    reviewType: ReviewProposalTypeSchema,
    source: StateProposalSourceSchema,
    target: ReviewProposalTargetSchema,
    currentValue: z.json().nullable(),
    proposedValue: z.json(),
    evidence: z.array(EvidenceAnchorSchema).min(1).max(100),
    confidence: z.number().finite().min(0).max(1),
    confidenceLevel: ReviewProposalConfidenceSchema,
    status: StateProposalStatusSchema,
    freshness: ReviewProposalFreshnessSchema,
    actionability: ReviewProposalActionabilitySchema,
    resolvedValue: z.json().nullable(),
    createdAt: z.iso.datetime(),
    resolvedAt: z.iso.datetime().nullable(),
  })
  .superRefine((proposal, context) => {
    if (proposal.reviewType !== proposal.target.targetType) {
      context.addIssue({
        code: 'custom',
        path: ['target'],
        message: 'AI review target must match its review type.',
      });
    }
  });

export const AIReviewSummarySchema = z.strictObject({
  total: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  resolved: z.number().int().nonnegative(),
  stale: z.number().int().nonnegative(),
});

export const AIReviewCatalogSchema = z.strictObject({
  projectId: ProjectIdSchema,
  batches: z.array(StateProposalBatchSchema),
  proposals: z.array(ReviewProposalSchema),
  summary: AIReviewSummarySchema,
});

export type ReviewProposalType = z.infer<typeof ReviewProposalTypeSchema>;
export type ReviewProposalTarget = z.infer<typeof ReviewProposalTargetSchema>;
export type ReviewProposal = z.infer<typeof ReviewProposalSchema>;
export type AIReviewSummary = z.infer<typeof AIReviewSummarySchema>;
export type AIReviewCatalog = z.infer<typeof AIReviewCatalogSchema>;
