import {
  chapterPosition,
  validateChapterRange,
  validateEvidence,
} from '../continuity-validation.js';
import { recordDerivedInvalidation } from './derived-invalidation-service.js';
import { assertFinalVersion, snapshotRow } from './ending-snapshot-service.js';
import {
  type ChangeType,
  type EntityStateRow,
  type InvalidationRow,
  mapBatch,
  mapInvalidation,
  mapProposal,
  mapSnapshot,
  parseJson,
  type ProposalBatchRow,
  type ProposalRow,
  type ProviderProposalBatchCompletionInput,
  type SnapshotRow,
  type StateProposalServiceContext,
  StateProposalServiceError,
} from './state-row-mappers.js';
import {
  ArcMilestoneResolutionValueSchema,
  type StateProposalCatalog,
  StateProposalCatalogSchema,
  type StateProposalGenerateInput,
  StateProposalGenerateInputSchema,
  StateProposalListInputSchema,
  type StateProposalResolveInput,
  StateProposalResolveInputSchema,
  type StateProposalSchema,
} from '@worldforge/contracts';
import {
  assertAuthorAuthority,
  compareChapterPosition,
  normalizeContinuityKey,
} from '@worldforge/domain';
import { type DatabaseSync } from 'node:sqlite';

export type ProposalDraft = StateProposalGenerateInput['proposals'][number];

export interface ProposalBatchInsertInput {
  readonly projectId: string;
  readonly chapterId: string;
  readonly sourceVersionId: string;
  readonly generationRunId: string | null;
  readonly source: 'rule' | 'provider_stub' | 'provider';
  readonly proposals: readonly ProposalDraft[];
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

export function assertEntity(connection: DatabaseSync, projectId: string, entityId: string): void {
  if (
    !connection
      .prepare("SELECT 1 FROM entities WHERE id = ? AND project_id = ? AND status = 'active'")
      .get(entityId, projectId)
  ) {
    throw new StateProposalServiceError(
      'STATE_PROPOSAL_NOT_FOUND',
      'The active proposal Entity was not found.',
    );
  }
}

export function assertMilestone(
  connection: DatabaseSync,
  projectId: string,
  milestoneId: string,
): {
  readonly status: string;
  readonly actualChapterId: string | null;
} {
  const row = connection
    .prepare(
      `SELECT status, actual_chapter_id AS actualChapterId
         FROM arc_milestones WHERE id = ? AND project_id = ?`,
    )
    .get(milestoneId, projectId) as
    | {
        readonly status: string;
        readonly actualChapterId: string | null;
      }
    | undefined;
  if (!row) {
    throw new StateProposalServiceError(
      'STATE_PROPOSAL_NOT_FOUND',
      'The proposal ArcMilestone was not found.',
    );
  }
  return row;
}

export function validateVersionBlockEvidence(
  connection: DatabaseSync,
  sourceVersionId: string,
  evidence: readonly {
    readonly kind: string;
    readonly targetId: string;
  }[],
): void {
  const blocks = evidence.filter((anchor) => anchor.kind === 'logicalBlock');
  if (blocks.length === 0) {
    throw new StateProposalServiceError(
      'STATE_PROPOSAL_INVALID',
      'Every StateProposal requires at least one finalized body block evidence anchor.',
    );
  }
  for (const anchor of blocks) {
    if (
      !connection
        .prepare('SELECT 1 FROM version_blocks WHERE version_id = ? AND logical_block_id = ?')
        .get(sourceVersionId, anchor.targetId)
    ) {
      throw new StateProposalServiceError(
        'STATE_PROPOSAL_INVALID',
        'StateProposal body evidence must belong to the finalized source Version.',
      );
    }
  }
}

export function currentEntityState(
  connection: DatabaseSync,
  projectId: string,
  entityId: string,
  stateKey: string,
): EntityStateRow | undefined {
  return connection
    .prepare(
      `SELECT id, value_json AS valueJson,
              valid_from_chapter_id AS validFromChapterId,
              valid_until_chapter_id AS validUntilChapterId
         FROM entity_states
        WHERE project_id = ? AND entity_id = ? AND state_key = ?
          AND record_status = 'current'`,
    )
    .get(projectId, entityId, stateKey) as EntityStateRow | undefined;
}

export function applyEntityState(
  connection: DatabaseSync,
  proposal: ReturnType<typeof StateProposalSchema.parse>,
  value: unknown,
  now: string,
  idFactory: () => string,
): void {
  if (!proposal.entityId || !proposal.stateKey) {
    throw new StateProposalServiceError(
      'STATE_PROPOSAL_INVARIANT',
      'EntityState proposal target is incomplete.',
    );
  }
  assertEntity(connection, proposal.projectId, proposal.entityId);
  validateChapterRange(
    connection,
    proposal.projectId,
    proposal.chapterId,
    proposal.validUntilChapterId,
  );
  const stateKey = normalizeContinuityKey(proposal.stateKey, 120);
  const current = currentEntityState(connection, proposal.projectId, proposal.entityId, stateKey);
  const proposalPosition = chapterPosition(connection, proposal.projectId, proposal.chapterId);
  if (current) {
    const currentPosition = chapterPosition(
      connection,
      proposal.projectId,
      current.validFromChapterId,
    );
    const ordering = compareChapterPosition(currentPosition, proposalPosition);
    if (ordering > 0) {
      throw new StateProposalServiceError(
        'STATE_PROPOSAL_CONFLICT',
        'Historical EntityState backfill requires an explicit migration workflow.',
      );
    }
    let endChapterId = current.validUntilChapterId;
    if (!endChapterId) endChapterId = proposal.chapterId;
    else if (
      compareChapterPosition(
        chapterPosition(connection, proposal.projectId, endChapterId),
        proposalPosition,
      ) > 0
    ) {
      endChapterId = proposal.chapterId;
    }
    connection
      .prepare(
        `UPDATE entity_states
            SET record_status = ?, valid_until_chapter_id = ?, superseded_at = ?
          WHERE id = ?`,
      )
      .run(ordering === 0 ? 'superseded' : 'historical', endChapterId, now, current.id);
  }
  connection
    .prepare(
      `INSERT INTO entity_states(
         id, project_id, entity_id, state_key, value_json,
         valid_from_chapter_id, valid_until_chapter_id, record_status,
         evidence_json, source_version_id, created_at, superseded_at
       ) VALUES(?, ?, ?, ?, ?, ?, ?, 'current', ?, ?, ?, NULL)`,
    )
    .run(
      idFactory(),
      proposal.projectId,
      proposal.entityId,
      stateKey,
      JSON.stringify(value),
      proposal.chapterId,
      proposal.validUntilChapterId,
      JSON.stringify(proposal.evidence),
      proposal.sourceVersionId,
      now,
    );
}

export function assertMilestoneDependenciesHit(
  connection: DatabaseSync,
  projectId: string,
  milestoneId: string,
): void {
  const unresolved = connection
    .prepare(
      `SELECT 1
         FROM arc_milestone_dependencies dependency_link
         JOIN arc_milestones dependency
           ON dependency.id = dependency_link.dependency_milestone_id
          AND dependency.project_id = dependency_link.project_id
        WHERE dependency_link.project_id = ? AND dependency_link.milestone_id = ?
          AND dependency.status <> 'hit'
        LIMIT 1`,
    )
    .get(projectId, milestoneId);
  if (unresolved) {
    throw new StateProposalServiceError(
      'STATE_PROPOSAL_CONFLICT',
      'ArcMilestone dependencies must be hit before proposal acceptance.',
    );
  }
}

export function applyArcMilestone(
  connection: DatabaseSync,
  proposal: ReturnType<typeof StateProposalSchema.parse>,
  value: unknown,
  now: string,
): void {
  if (!proposal.arcMilestoneId) {
    throw new StateProposalServiceError(
      'STATE_PROPOSAL_INVARIANT',
      'ArcMilestone proposal target is incomplete.',
    );
  }
  const resolved = ArcMilestoneResolutionValueSchema.parse(value);
  const current = assertMilestone(connection, proposal.projectId, proposal.arcMilestoneId);
  if (current.status !== 'planned') {
    throw new StateProposalServiceError(
      'STATE_PROPOSAL_CONFLICT',
      'Only a planned ArcMilestone may be resolved from a StateProposal.',
    );
  }
  if (resolved.actualChapterId) {
    chapterPosition(connection, proposal.projectId, resolved.actualChapterId);
  }
  if (resolved.status === 'hit') {
    assertMilestoneDependenciesHit(connection, proposal.projectId, proposal.arcMilestoneId);
  }
  connection
    .prepare(
      `UPDATE arc_milestones
          SET status = ?, actual_chapter_id = ?, confirmation_source = 'state_proposal',
              updated_at = ?
        WHERE id = ? AND project_id = ?`,
    )
    .run(
      resolved.status,
      resolved.actualChapterId,
      now,
      proposal.arcMilestoneId,
      proposal.projectId,
    );
}

export function insertProposalBatch(
  connection: DatabaseSync,
  input: ProposalBatchInsertInput,
  batchId: string,
  now: string,
  idFactory: () => string,
): void {
  assertFinalVersion(connection, input.projectId, input.chapterId, input.sourceVersionId);
  connection
    .prepare(
      `INSERT INTO state_proposal_batches(
         id, project_id, chapter_id, source_version_id, generation_run_id,
         source, proposal_count, status, created_at
       ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      batchId,
      input.projectId,
      input.chapterId,
      input.sourceVersionId,
      input.generationRunId,
      input.source,
      input.proposals.length,
      input.proposals.length === 0 ? 'resolved' : 'pending',
      now,
    );
  const keys = new Set<string>();
  for (const draft of input.proposals) {
    validateEvidence(connection, input.projectId, draft.evidence);
    validateVersionBlockEvidence(connection, input.sourceVersionId, draft.evidence);
    let entityId: string | null = null;
    let stateKey: string | null = null;
    let milestoneId: string | null = null;
    let validUntilChapterId: string | null = null;
    let previousValue: unknown;
    let proposedValue: unknown;
    let key: string;
    if (draft.proposalType === 'entity_state') {
      entityId = draft.entityId;
      stateKey = normalizeContinuityKey(draft.stateKey, 120);
      assertEntity(connection, input.projectId, entityId);
      validUntilChapterId = draft.validUntilChapterId;
      validateChapterRange(connection, input.projectId, input.chapterId, validUntilChapterId);
      const current = currentEntityState(connection, input.projectId, entityId, stateKey);
      previousValue = current ? parseJson(current.valueJson) : null;
      proposedValue = draft.proposedValue;
      key = `entity:${entityId}:${stateKey}`;
    } else {
      milestoneId = draft.arcMilestoneId;
      const milestone = assertMilestone(connection, input.projectId, milestoneId);
      if (milestone.status !== 'planned') {
        throw new StateProposalServiceError(
          'STATE_PROPOSAL_CONFLICT',
          'Only planned ArcMilestones may receive pending proposals.',
        );
      }
      previousValue = {
        status: milestone.status,
        actualChapterId: milestone.actualChapterId,
      };
      proposedValue = {
        status: draft.proposedStatus,
        actualChapterId: draft.actualChapterId,
      };
      ArcMilestoneResolutionValueSchema.parse(proposedValue);
      key = `milestone:${milestoneId}`;
    }
    if (keys.has(key)) {
      throw new StateProposalServiceError(
        'STATE_PROPOSAL_CONFLICT',
        'A proposal batch cannot contain duplicate targets.',
      );
    }
    keys.add(key);
    connection
      .prepare(
        `INSERT INTO state_proposals(
           id, batch_id, project_id, chapter_id, source_version_id, proposal_type, source,
           entity_id, state_key, arc_milestone_id, previous_value_json,
           proposed_value_json, evidence_json, confidence, status,
           resolved_value_json, valid_until_chapter_id, created_at, resolved_at
         ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?, NULL)`,
      )
      .run(
        idFactory(),
        batchId,
        input.projectId,
        input.chapterId,
        input.sourceVersionId,
        draft.proposalType,
        input.source,
        entityId,
        stateKey,
        milestoneId,
        previousValue === null ? null : JSON.stringify(previousValue),
        JSON.stringify(proposedValue),
        JSON.stringify(draft.evidence),
        draft.confidence,
        validUntilChapterId,
        now,
      );
  }
}

export function refreshBatchStatus(connection: DatabaseSync, batchId: string): void {
  connection
    .prepare(
      `UPDATE state_proposal_batches
          SET status = (
            SELECT CASE
              WHEN COUNT(*) = 0 THEN 'resolved'
              WHEN SUM(status = 'pending') = COUNT(*) THEN 'pending'
              WHEN SUM(status = 'rejected') = COUNT(*) THEN 'rejected'
              WHEN SUM(status IN ('accepted', 'edited')) = COUNT(*) THEN 'resolved'
              ELSE 'mixed'
            END
              FROM state_proposals
             WHERE batch_id = ?
          )
        WHERE id = ?`,
    )
    .run(batchId, batchId);
}

export function catalog(connection: DatabaseSync, projectId: string): StateProposalCatalog {
  const batches = connection
    .prepare(
      `SELECT id AS batchId, project_id AS projectId, chapter_id AS chapterId,
              source_version_id AS sourceVersionId, generation_run_id AS generationRunId,
              source, proposal_count AS proposalCount, status, created_at AS createdAt
         FROM state_proposal_batches
        WHERE project_id = ?
        ORDER BY created_at DESC, id DESC`,
    )
    .all(projectId) as unknown as ProposalBatchRow[];
  const proposals = connection
    .prepare(
      `SELECT proposal.id, proposal.batch_id AS batchId,
              batch.generation_run_id AS generationRunId,
              proposal.project_id AS projectId, proposal.chapter_id AS chapterId,
              proposal.source_version_id AS sourceVersionId,
              proposal.proposal_type AS proposalType,
              proposal.source, proposal.entity_id AS entityId,
              proposal.state_key AS stateKey,
              proposal.arc_milestone_id AS arcMilestoneId,
              proposal.previous_value_json AS previousValueJson,
              proposal.proposed_value_json AS proposedValueJson,
              proposal.evidence_json AS evidenceJson,
              proposal.confidence, proposal.status,
              CASE WHEN chapter.final_version_id = proposal.source_version_id
                   THEN 'current' ELSE 'stale' END AS freshness,
              CASE WHEN chapter.final_version_id = proposal.source_version_id
                   THEN 'accept' ELSE 'reject_only' END AS actionability,
              proposal.resolved_value_json AS resolvedValueJson,
              proposal.valid_until_chapter_id AS validUntilChapterId,
              proposal.created_at AS createdAt, proposal.resolved_at AS resolvedAt
         FROM state_proposals proposal
         JOIN state_proposal_batches batch ON batch.id = proposal.batch_id
         JOIN chapters chapter ON chapter.id = proposal.chapter_id
        WHERE proposal.project_id = ?
        ORDER BY proposal.status = 'pending' DESC, proposal.created_at DESC, proposal.id`,
    )
    .all(projectId) as unknown as ProposalRow[];
  const snapshots = connection
    .prepare(
      `SELECT id, project_id AS projectId, chapter_id AS chapterId,
              source_version_id AS sourceVersionId, status,
              content_json AS contentJson, stale_reasons_json AS staleReasonsJson,
              created_at AS createdAt, stale_at AS staleAt
         FROM ending_snapshots WHERE project_id = ?
        ORDER BY chapter_id, created_at DESC, id`,
    )
    .all(projectId) as unknown as SnapshotRow[];
  const invalidations = connection
    .prepare(
      `SELECT id, project_id AS projectId, source_chapter_id AS sourceChapterId,
              source_version_id AS sourceVersionId,
              target_chapter_id AS targetChapterId, scope, change_type AS changeType,
              created_at AS createdAt
         FROM derived_invalidations WHERE project_id = ?
        ORDER BY created_at DESC, id`,
    )
    .all(projectId) as unknown as InvalidationRow[];
  return StateProposalCatalogSchema.parse({
    projectId,
    batches: batches.map(mapBatch),
    proposals: proposals.map(mapProposal),
    snapshots: snapshots.map(mapSnapshot),
    invalidations: invalidations.map(mapInvalidation),
  });
}

export function list(
  context: StateProposalServiceContext,
  raw: {
    projectId: string;
    chapterId?: string | null;
    includeResolved?: boolean;
  },
) {
  const input = StateProposalListInputSchema.parse(raw);
  return context.workspace.readProject(input.projectId, (connection) => {
    const value = catalog(connection, input.projectId);
    return StateProposalCatalogSchema.parse({
      ...value,
      proposals: value.proposals.filter(
        (proposal) =>
          (!input.chapterId || proposal.chapterId === input.chapterId) &&
          (input.includeResolved || proposal.status === 'pending'),
      ),
    });
  });
}

export function generate(
  context: StateProposalServiceContext,
  requestId: string,
  raw: StateProposalGenerateInput,
): Promise<StateProposalCatalog> {
  const input = StateProposalGenerateInputSchema.parse(raw);
  return context.workspace.writeProject(requestId, input.projectId, (connection) => {
    const now = context.clock.now().toISOString();
    insertProposalBatch(
      connection,
      { ...input, generationRunId: null },
      context.idFactory(),
      now,
      context.idFactory,
    );
    return catalog(connection, input.projectId);
  });
}

export function completeProviderBatch(
  context: StateProposalServiceContext,
  requestId: string,
  input: ProviderProposalBatchCompletionInput,
): Promise<{
  readonly batchId: string;
  readonly catalog: StateProposalCatalog;
}> {
  return context.workspace.writeProject(requestId, input.projectId, (connection) => {
    const run = connection
      .prepare(
        `SELECT status, run_type AS runType, chapter_id AS chapterId
             FROM generation_runs
            WHERE id = ? AND project_id = ?`,
      )
      .get(input.runId, input.projectId) as
      | {
          readonly status: string;
          readonly runType: string;
          readonly chapterId: string;
        }
      | undefined;
    if (
      !run ||
      (run.status !== 'queued' && run.status !== 'running') ||
      run.runType !== 'state_extract' ||
      run.chapterId !== input.chapterId
    ) {
      throw new StateProposalServiceError(
        'STATE_PROPOSAL_CONFLICT',
        'The StateProposal batch does not match an active state extraction run.',
      );
    }
    const source = connection
      .prepare(
        `SELECT 1
             FROM generation_input_sources
            WHERE run_id = ? AND source_type = 'version' AND source_id = ?`,
      )
      .get(input.runId, input.sourceVersionId);
    if (!source) {
      throw new StateProposalServiceError(
        'STATE_PROPOSAL_CONFLICT',
        'The finalized Version is not the persisted GenerationRun source.',
      );
    }
    const batchId = context.idFactory();
    const now = context.clock.now().toISOString();
    insertProposalBatch(
      connection,
      {
        projectId: input.projectId,
        chapterId: input.chapterId,
        sourceVersionId: input.sourceVersionId,
        generationRunId: input.runId,
        source: 'provider',
        proposals: input.proposals,
      },
      batchId,
      now,
      context.idFactory,
    );
    connection
      .prepare(
        `INSERT INTO generation_result_refs(
             run_id, result_type, result_id, candidate_kind, created_at
           ) VALUES(?, 'state_proposal_batch', ?, NULL, ?)`,
      )
      .run(input.runId, batchId, now);
    const updated = connection
      .prepare(
        `UPDATE generation_runs
              SET status = 'succeeded', stage = 'completed',
                  input_tokens = ?, output_tokens = ?,
                  error_code = NULL, retryable = NULL, partial_status = 'unavailable',
                  finished_at = ?
            WHERE id = ? AND project_id = ? AND status IN ('queued', 'running')`,
      )
      .run(
        input.usage?.inputTokens ?? null,
        input.usage?.outputTokens ?? null,
        now,
        input.runId,
        input.projectId,
      );
    if (Number(updated.changes) !== 1) {
      throw new StateProposalServiceError(
        'STATE_PROPOSAL_CONFLICT',
        'The GenerationRun changed before its StateProposal batch committed.',
      );
    }
    return { batchId, catalog: catalog(connection, input.projectId) };
  });
}

export function resolve(
  context: StateProposalServiceContext,
  requestId: string,
  raw: StateProposalResolveInput,
): Promise<StateProposalCatalog> {
  const input = StateProposalResolveInputSchema.parse(raw);
  authorOnly(input.authority);
  return context.workspace.writeProject(requestId, input.projectId, (connection) => {
    const ids = input.resolutions.map((resolution) => resolution.proposalId);
    if (new Set(ids).size !== ids.length) {
      throw new StateProposalServiceError(
        'STATE_PROPOSAL_CONFLICT',
        'A proposal batch cannot resolve the same proposal twice.',
      );
    }
    const now = context.clock.now().toISOString();
    const acceptedChanges = new Map<
      string,
      { readonly versionId: string; readonly changeTypes: Set<ChangeType> }
    >();
    const affectedBatchIds = new Set<string>();
    for (const resolution of input.resolutions) {
      const row = connection
        .prepare(
          `SELECT proposal.id, proposal.batch_id AS batchId,
                    batch.generation_run_id AS generationRunId,
                    proposal.project_id AS projectId, proposal.chapter_id AS chapterId,
                    proposal.source_version_id AS sourceVersionId,
                    proposal.proposal_type AS proposalType,
                    proposal.source, proposal.entity_id AS entityId,
                    proposal.state_key AS stateKey,
                    proposal.arc_milestone_id AS arcMilestoneId,
                    proposal.previous_value_json AS previousValueJson,
                    proposal.proposed_value_json AS proposedValueJson,
                    proposal.evidence_json AS evidenceJson,
                    proposal.confidence, proposal.status,
                    CASE WHEN chapter.final_version_id = proposal.source_version_id
                         THEN 'current' ELSE 'stale' END AS freshness,
                    CASE WHEN chapter.final_version_id = proposal.source_version_id
                         THEN 'accept' ELSE 'reject_only' END AS actionability,
                    proposal.resolved_value_json AS resolvedValueJson,
                    proposal.valid_until_chapter_id AS validUntilChapterId,
                    proposal.created_at AS createdAt, proposal.resolved_at AS resolvedAt
               FROM state_proposals proposal
               JOIN state_proposal_batches batch ON batch.id = proposal.batch_id
               JOIN chapters chapter ON chapter.id = proposal.chapter_id
              WHERE proposal.id = ? AND proposal.project_id = ?`,
        )
        .get(resolution.proposalId, input.projectId) as ProposalRow | undefined;
      if (!row) {
        throw new StateProposalServiceError(
          'STATE_PROPOSAL_NOT_FOUND',
          'The StateProposal was not found.',
        );
      }
      const proposal = mapProposal(row);
      if (proposal.batchId) affectedBatchIds.add(proposal.batchId);
      if (proposal.status !== 'pending') {
        throw new StateProposalServiceError(
          'STATE_PROPOSAL_CONFLICT',
          'Only pending StateProposals may be resolved.',
        );
      }
      if (resolution.decision === 'reject') {
        connection
          .prepare(
            `UPDATE state_proposals
                  SET status = 'rejected', resolved_at = ?, resolved_value_json = NULL
                WHERE id = ? AND project_id = ?`,
          )
          .run(now, proposal.id, proposal.projectId);
        continue;
      }
      if (proposal.actionability !== 'accept') {
        throw new StateProposalServiceError(
          'STATE_PROPOSAL_CONFLICT',
          'The source Final Version changed; this stale StateProposal may only be rejected.',
        );
      }
      assertFinalVersion(
        connection,
        proposal.projectId,
        proposal.chapterId,
        proposal.sourceVersionId,
      );
      const value =
        resolution.decision === 'edit_accept' ? resolution.editedValue : proposal.proposedValue;
      if (proposal.proposalType === 'entity_state') {
        applyEntityState(connection, proposal, value, now, context.idFactory);
      } else {
        applyArcMilestone(connection, proposal, value, now);
      }
      connection
        .prepare(
          `UPDATE state_proposals
                SET status = ?, resolved_at = ?, resolved_value_json = ?
              WHERE id = ? AND project_id = ?`,
        )
        .run(
          resolution.decision === 'edit_accept' ? 'edited' : 'accepted',
          now,
          JSON.stringify(value),
          proposal.id,
          proposal.projectId,
        );
      const existing = acceptedChanges.get(proposal.chapterId);
      if (existing && existing.versionId !== proposal.sourceVersionId) {
        throw new StateProposalServiceError(
          'STATE_PROPOSAL_INVARIANT',
          'Accepted StateProposals for one chapter must share the same Final Version.',
        );
      }
      const accepted =
        existing ?? { versionId: proposal.sourceVersionId, changeTypes: new Set<ChangeType>() };
      accepted.changeTypes.add(
        proposal.proposalType === 'entity_state' ? 'entity_state' : 'arc_milestone',
      );
      acceptedChanges.set(proposal.chapterId, accepted);
    }
    for (const [chapterId, accepted] of acceptedChanges) {
      recordDerivedInvalidation(
        connection,
        {
          projectId: input.projectId,
          sourceChapterId: chapterId,
          sourceVersionId: accepted.versionId,
          changeTypes: [...accepted.changeTypes],
        },
        now,
        context.idFactory,
      );
      snapshotRow(
        connection,
        input.projectId,
        chapterId,
        accepted.versionId,
        now,
        context.idFactory,
      );
    }
    for (const batchId of affectedBatchIds) refreshBatchStatus(connection, batchId);
    return catalog(connection, input.projectId);
  });
}
