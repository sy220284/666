import { type DatabaseClock } from '../database/index.js';
import { type ProjectWorkspaceService } from '../project-workspace.js';
import {
  type DerivedInvalidationInputSchema,
  type DerivedInvalidationResultSchema,
  type EndingSnapshot,
  EndingSnapshotSchema,
  StateProposalBatchSchema,
  type StateProposalGenerateInput,
  StateProposalSchema,
} from '@worldforge/contracts';
import { assertAuthorAuthority } from '@worldforge/domain';

export interface StateProposalServiceContext {
  readonly workspace: ProjectWorkspaceService;
  readonly clock: DatabaseClock;
  readonly idFactory: () => string;
}

export type ProposalDraft = StateProposalGenerateInput['proposals'][number];

export type ChangeType = Exclude<
  ReturnType<typeof DerivedInvalidationInputSchema.parse>['changeTypes'][number],
  'prose'
>;

export type InvalidationScope = ReturnType<
  typeof DerivedInvalidationResultSchema.parse
>['queuedScopes'][number];

export interface ProposalRow {
  readonly id: string;
  readonly batchId: string | null;
  readonly generationRunId: string | null;
  readonly projectId: string;
  readonly chapterId: string;
  readonly sourceVersionId: string;
  readonly proposalType: string;
  readonly source: string;
  readonly entityId: string | null;
  readonly stateKey: string | null;
  readonly arcMilestoneId: string | null;
  readonly previousValueJson: string | null;
  readonly proposedValueJson: string;
  readonly evidenceJson: string;
  readonly confidence: number;
  readonly status: string;
  readonly freshness?: 'current' | 'stale';
  readonly actionability?: 'accept' | 'reject_only';
  readonly resolvedValueJson: string | null;
  readonly validUntilChapterId: string | null;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
}

export interface ProposalBatchRow {
  readonly batchId: string;
  readonly projectId: string;
  readonly chapterId: string;
  readonly sourceVersionId: string;
  readonly generationRunId: string | null;
  readonly source: string;
  readonly proposalCount: number | bigint;
  readonly status: string;
  readonly createdAt: string;
}

export interface SnapshotRow {
  readonly id: string;
  readonly projectId: string;
  readonly chapterId: string;
  readonly sourceVersionId: string;
  readonly status: string;
  readonly contentJson: string;
  readonly staleReasonsJson: string;
  readonly createdAt: string;
  readonly staleAt: string | null;
}

export interface InvalidationRow {
  readonly id: string;
  readonly projectId: string;
  readonly sourceChapterId: string;
  readonly sourceVersionId: string;
  readonly targetChapterId: string | null;
  readonly scope: string;
  readonly changeType: string;
  readonly createdAt: string;
}

export interface EntityStateRow {
  readonly id: string;
  readonly valueJson: string;
  readonly validFromChapterId: string;
  readonly validUntilChapterId: string | null;
}

export interface VersionSourceRow {
  readonly finalVersionId: string | null;
}

export type StateProposalServiceErrorCode =
  | 'STATE_PROPOSAL_NOT_FOUND'
  | 'STATE_PROPOSAL_INVALID'
  | 'STATE_PROPOSAL_CONFLICT'
  | 'STATE_PROPOSAL_AUTHOR_REQUIRED'
  | 'STATE_PROPOSAL_INVARIANT';

export class StateProposalServiceError extends Error {
  readonly code: StateProposalServiceErrorCode;
  constructor(code: StateProposalServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'StateProposalServiceError';
    this.code = code;
  }
}

export function authorOnly(authority: 'author' | 'ai'): void {
  try {
    assertAuthorAuthority(authority);
  } catch (error) {
    throw new StateProposalServiceError(
      'STATE_PROPOSAL_AUTHOR_REQUIRED',
      'Only an explicit author command may resolve proposals or refresh derived state.',
      { cause: error },
    );
  }
}

export interface StateProposalServiceOptions {
  readonly clock?: DatabaseClock;
  readonly idFactory?: () => string;
}

export interface ProviderProposalBatchCompletionInput {
  readonly projectId: string;
  readonly chapterId: string;
  readonly sourceVersionId: string;
  readonly runId: string;
  readonly proposals: readonly ProposalDraft[];
  readonly usage?: {
    readonly inputTokens?: number;
    readonly outputTokens?: number;
  };
}

export function parseJson(value: string | null): unknown | null {
  return value === null ? null : (JSON.parse(value) as unknown);
}

export function mapProposal(row: ProposalRow) {
  return StateProposalSchema.parse({
    id: row.id,
    batchId: row.batchId,
    generationRunId: row.generationRunId,
    projectId: row.projectId,
    chapterId: row.chapterId,
    sourceVersionId: row.sourceVersionId,
    proposalType: row.proposalType,
    source: row.source,
    entityId: row.entityId,
    stateKey: row.stateKey,
    arcMilestoneId: row.arcMilestoneId,
    previousValue: parseJson(row.previousValueJson),
    proposedValue: parseJson(row.proposedValueJson),
    evidence: parseJson(row.evidenceJson),
    confidence: row.confidence,
    status: row.status,
    freshness: row.freshness ?? 'current',
    actionability: row.actionability ?? 'accept',
    resolvedValue: parseJson(row.resolvedValueJson),
    validUntilChapterId: row.validUntilChapterId,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  });
}

export function mapBatch(row: ProposalBatchRow) {
  return StateProposalBatchSchema.parse({
    ...row,
    proposalCount: Number(row.proposalCount),
  });
}

export function mapSnapshot(row: SnapshotRow): EndingSnapshot {
  return EndingSnapshotSchema.parse({
    id: row.id,
    projectId: row.projectId,
    chapterId: row.chapterId,
    sourceVersionId: row.sourceVersionId,
    status: row.status,
    content: parseJson(row.contentJson),
    staleReasons: parseJson(row.staleReasonsJson),
    createdAt: row.createdAt,
    staleAt: row.staleAt,
  });
}

export function mapInvalidation(row: InvalidationRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    sourceChapterId: row.sourceChapterId,
    sourceVersionId: row.sourceVersionId,
    targetChapterId: row.targetChapterId,
    scope: row.scope,
    changeType: row.changeType,
    createdAt: row.createdAt,
  };
}
