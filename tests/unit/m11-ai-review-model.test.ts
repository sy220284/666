import { StateProposalCatalogSchema } from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';

import {
  filterAIReviewProposals,
  reviewConfidenceLabel,
  stateProposalCatalogToAIReviewCatalog,
} from '../../apps/desktop/renderer/src/features/canon/ai-review-model.js';

const projectId = '00000000-0000-4000-8000-000000000001';
const chapterId = '00000000-0000-4000-8000-000000000002';
const sourceVersionId = '00000000-0000-4000-8000-000000000003';
const batchId = '00000000-0000-4000-8000-000000000004';
const entityId = '00000000-0000-4000-8000-000000000005';
const milestoneId = '00000000-0000-4000-8000-000000000006';

function catalog() {
  return StateProposalCatalogSchema.parse({
    projectId,
    batches: [
      {
        batchId,
        projectId,
        chapterId,
        sourceVersionId,
        generationRunId: null,
        source: 'provider_stub',
        proposalCount: 3,
        status: 'mixed',
        createdAt: '2026-08-10T15:00:00.000Z',
      },
    ],
    proposals: [
      {
        id: '00000000-0000-4000-8000-000000000011',
        batchId,
        generationRunId: null,
        projectId,
        chapterId,
        sourceVersionId,
        proposalType: 'entity_state',
        source: 'provider_stub',
        entityId,
        stateKey: 'health',
        arcMilestoneId: null,
        previousValue: '健康',
        proposedValue: '受伤',
        evidence: [{ kind: 'logicalBlock', targetId: 'block-1', note: '右臂渗血' }],
        confidence: 0.92,
        status: 'pending',
        freshness: 'current',
        actionability: 'accept',
        resolvedValue: null,
        validUntilChapterId: null,
        createdAt: '2026-08-10T15:00:00.000Z',
        resolvedAt: null,
      },
      {
        id: '00000000-0000-4000-8000-000000000012',
        batchId,
        generationRunId: null,
        projectId,
        chapterId,
        sourceVersionId,
        proposalType: 'arc_milestone',
        source: 'provider_stub',
        entityId: null,
        stateKey: null,
        arcMilestoneId: milestoneId,
        previousValue: { status: 'planned', actualChapterId: null },
        proposedValue: { status: 'hit', actualChapterId: chapterId },
        evidence: [{ kind: 'logicalBlock', targetId: 'block-2', note: '主动托付秘密' }],
        confidence: 0.6,
        status: 'accepted',
        freshness: 'current',
        actionability: 'accept',
        resolvedValue: { status: 'hit', actualChapterId: chapterId },
        validUntilChapterId: null,
        createdAt: '2026-08-10T15:01:00.000Z',
        resolvedAt: '2026-08-10T15:02:00.000Z',
      },
      {
        id: '00000000-0000-4000-8000-000000000013',
        batchId,
        generationRunId: null,
        projectId,
        chapterId,
        sourceVersionId,
        proposalType: 'entity_state',
        source: 'provider_stub',
        entityId,
        stateKey: 'location',
        arcMilestoneId: null,
        previousValue: '清河',
        proposedValue: '汴京',
        evidence: [{ kind: 'logicalBlock', targetId: 'block-3', note: '抵达汴京' }],
        confidence: 0.3,
        status: 'rejected',
        freshness: 'stale',
        actionability: 'reject_only',
        resolvedValue: null,
        validUntilChapterId: null,
        createdAt: '2026-08-10T15:03:00.000Z',
        resolvedAt: '2026-08-10T15:04:00.000Z',
      },
    ],
    snapshots: [],
    invalidations: [],
  });
}

describe('M11 unified AI review model', () => {
  it('maps existing StateProposal records into the shared review read model', () => {
    const review = stateProposalCatalogToAIReviewCatalog(catalog());

    expect(review.summary).toEqual({ total: 3, pending: 1, resolved: 2, stale: 1 });
    expect(review.proposals[0]).toMatchObject({
      reviewType: 'entity_state',
      confidenceLevel: 'high',
      currentValue: '健康',
      target: { targetType: 'entity_state', entityId, stateKey: 'health' },
    });
    expect(review.proposals[1]).toMatchObject({
      reviewType: 'arc_milestone',
      confidenceLevel: 'medium',
      target: { targetType: 'arc_milestone', arcMilestoneId: milestoneId },
    });
    expect(review.proposals[2].confidenceLevel).toBe('low');
  });

  it('filters locally without changing the authoritative catalog', () => {
    const review = stateProposalCatalogToAIReviewCatalog(catalog());

    expect(
      filterAIReviewProposals(review, { status: 'pending', reviewType: 'all' }).map(
        (item) => item.id,
      ),
    ).toEqual(['00000000-0000-4000-8000-000000000011']);
    expect(
      filterAIReviewProposals(review, { status: 'resolved', reviewType: 'arc_milestone' }),
    ).toHaveLength(1);
    expect(filterAIReviewProposals(review, { status: 'all', reviewType: 'entity_state' })).toHaveLength(
      2,
    );
    expect(review.proposals).toHaveLength(3);
  });

  it('uses author-facing confidence levels rather than percentages', () => {
    expect(reviewConfidenceLabel('high')).toBe('高');
    expect(reviewConfidenceLabel('medium')).toBe('中');
    expect(reviewConfidenceLabel('low')).toBe('低');
  });
});
