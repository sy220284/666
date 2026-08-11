import {
  AIReviewCatalogSchema,
  ReviewProposalSchema,
  type AIReviewCatalog,
  type ReviewProposal,
  type ReviewProposalType,
  type StateProposal,
  type StateProposalCatalog,
} from '@worldforge/contracts';

export type AIReviewStatusFilter = 'pending' | 'resolved' | 'all';
export type AIReviewTypeFilter = ReviewProposalType | 'all';

export interface AIReviewFilter {
  readonly status: AIReviewStatusFilter;
  readonly reviewType: AIReviewTypeFilter;
}

export function reviewConfidenceLevel(confidence: number): ReviewProposal['confidenceLevel'] {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}

export function reviewConfidenceLabel(
  level: ReviewProposal['confidenceLevel'],
): '高' | '中' | '低' {
  if (level === 'high') return '高';
  if (level === 'medium') return '中';
  return '低';
}

export function reviewTypeLabel(reviewType: ReviewProposalType): string {
  const labels: Readonly<Record<ReviewProposalType, string>> = {
    entity_state: '人物与世界状态',
    arc_milestone: '人物成长节点',
    knowledge_state: '人物知情状态',
    timeline_event: '时间线事件',
    character_relationship: '人物关系',
    foreshadowing: '伏笔进度',
    entity_create: '新人物或设定',
    canon_fact: '设定事实',
  };
  return labels[reviewType];
}

export function stateProposalToReviewProposal(proposal: StateProposal): ReviewProposal {
  return ReviewProposalSchema.parse({
    id: proposal.id,
    batchId: proposal.batchId,
    generationRunId: proposal.generationRunId,
    projectId: proposal.projectId,
    chapterId: proposal.chapterId,
    sourceVersionId: proposal.sourceVersionId,
    reviewType: proposal.proposalType,
    source: proposal.source,
    target: proposal.target,
    currentValue: proposal.previousValue,
    proposedValue: proposal.proposedValue,
    evidence: proposal.evidence,
    confidence: proposal.confidence,
    confidenceLevel: reviewConfidenceLevel(proposal.confidence),
    status: proposal.status,
    freshness: proposal.freshness,
    actionability: proposal.actionability,
    resolvedValue: proposal.resolvedValue,
    createdAt: proposal.createdAt,
    resolvedAt: proposal.resolvedAt,
  });
}

export function stateProposalCatalogToAIReviewCatalog(
  catalog: StateProposalCatalog,
): AIReviewCatalog {
  const proposals = catalog.proposals.map(stateProposalToReviewProposal);
  return AIReviewCatalogSchema.parse({
    projectId: catalog.projectId,
    batches: catalog.batches,
    proposals,
    summary: {
      total: proposals.length,
      pending: proposals.filter((proposal) => proposal.status === 'pending').length,
      resolved: proposals.filter((proposal) => proposal.status !== 'pending').length,
      stale: proposals.filter((proposal) => proposal.freshness === 'stale').length,
    },
  });
}

export function filterAIReviewProposals(
  catalog: AIReviewCatalog,
  filter: AIReviewFilter,
): readonly ReviewProposal[] {
  return catalog.proposals.filter((proposal) => {
    const statusMatches =
      filter.status === 'all' ||
      (filter.status === 'pending' ? proposal.status === 'pending' : proposal.status !== 'pending');
    const typeMatches = filter.reviewType === 'all' || proposal.reviewType === filter.reviewType;
    return statusMatches && typeMatches;
  });
}
