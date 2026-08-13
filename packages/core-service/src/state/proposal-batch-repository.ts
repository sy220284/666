import type { DatabaseSync } from 'node:sqlite';

import {
  StateProposalCatalogSchema,
  StateProposalDraftSchema,
  StateProposalGenerateInputSchema,
  StateProposalListInputSchema,
  StateProposalResolveInputSchema,
  type StateProposalCatalog,
  type StateProposalGenerateInput,
  type StateProposalResolveInput,
} from '@worldforge/contracts';
import { assertAuthorAuthority } from '@worldforge/domain';

import { validateEvidence } from '../continuity-validation.js';
import { recordDerivedInvalidation } from './derived-invalidation-service.js';
import { assertFinalVersion, snapshotRow } from './ending-snapshot-service.js';
import {
  applyStateProposalInTransaction,
  stateProposalInsertShape,
} from './proposal-authority-operations.js';
import {
  type ChangeType,
  type InvalidationRow,
  mapBatch,
  mapInvalidation,
  mapProposal,
  mapSnapshot,
  type ProposalBatchRow,
  type ProposalRow,
  type ProviderProposalBatchCompletionInput,
  type SnapshotRow,
  type StateProposalServiceContext,
  StateProposalServiceError,
} from './state-row-mappers.js';
import { sqliteResult } from '../database/sqlite-result.js';

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

export function validateVersionBlockEvidence(
  connection: DatabaseSync,
  sourceVersionId: string,
  evidence: readonly { readonly kind: string; readonly targetId: string }[],
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
  const targetKeys = new Set<string>();
  const insert = connection.prepare(
    `INSERT INTO state_proposals(
       id, batch_id, project_id, chapter_id, source_version_id, proposal_type,
       source, target_json, previous_value_json, proposed_value_json,
       evidence_json, confidence, status, resolved_value_json, created_at, resolved_at
     ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, NULL)`,
  );
  for (const draft of input.proposals) {
    validateEvidence(connection, input.projectId, draft.evidence);
    validateVersionBlockEvidence(connection, input.sourceVersionId, draft.evidence);
    const shape = stateProposalInsertShape(connection, input.projectId, input.chapterId, draft);
    if (targetKeys.has(shape.targetKey)) {
      throw new StateProposalServiceError(
        'STATE_PROPOSAL_CONFLICT',
        'A proposal batch cannot contain duplicate targets.',
      );
    }
    targetKeys.add(shape.targetKey);
    insert.run(
      idFactory(),
      batchId,
      input.projectId,
      input.chapterId,
      input.sourceVersionId,
      draft.proposalType,
      input.source,
      JSON.stringify(shape.target),
      shape.previousValue === null ? null : JSON.stringify(shape.previousValue),
      JSON.stringify(shape.proposedValue),
      JSON.stringify(draft.evidence),
      draft.confidence,
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
              FROM state_proposals WHERE batch_id = ?
          )
        WHERE id = ?`,
    )
    .run(batchId, batchId);
}

const proposalSelect = `
  SELECT proposal.id, proposal.batch_id AS batchId,
         batch.generation_run_id AS generationRunId,
         proposal.project_id AS projectId, proposal.chapter_id AS chapterId,
         proposal.source_version_id AS sourceVersionId,
         proposal.proposal_type AS proposalType, proposal.source,
         proposal.target_json AS targetJson,
         proposal.previous_value_json AS previousValueJson,
         proposal.proposed_value_json AS proposedValueJson,
         proposal.evidence_json AS evidenceJson,
         proposal.confidence, proposal.status,
         CASE WHEN chapter.final_version_id = proposal.source_version_id
              THEN 'current' ELSE 'stale' END AS freshness,
         CASE WHEN chapter.final_version_id = proposal.source_version_id
              THEN 'accept' ELSE 'reject_only' END AS actionability,
         proposal.resolved_value_json AS resolvedValueJson,
         proposal.created_at AS createdAt, proposal.resolved_at AS resolvedAt
    FROM state_proposals proposal
    JOIN state_proposal_batches batch ON batch.id = proposal.batch_id
    JOIN chapters chapter ON chapter.id = proposal.chapter_id`;

export function catalog(connection: DatabaseSync, projectId: string): StateProposalCatalog {
  const batches = sqliteResult<ProposalBatchRow[]>(
    connection
      .prepare(
        `SELECT id AS batchId, project_id AS projectId, chapter_id AS chapterId,
              source_version_id AS sourceVersionId, generation_run_id AS generationRunId,
              source, proposal_count AS proposalCount, status, created_at AS createdAt
         FROM state_proposal_batches
        WHERE project_id = ?
        ORDER BY created_at DESC, id DESC`,
      )
      .all(projectId),
  );
  const proposals = sqliteResult<ProposalRow[]>(
    connection
      .prepare(
        `${proposalSelect}
        WHERE proposal.project_id = ?
        ORDER BY proposal.status = 'pending' DESC, proposal.created_at DESC, proposal.id`,
      )
      .all(projectId),
  );
  const snapshots = sqliteResult<SnapshotRow[]>(
    connection
      .prepare(
        `SELECT id, project_id AS projectId, chapter_id AS chapterId,
              source_version_id AS sourceVersionId, status,
              content_json AS contentJson, stale_reasons_json AS staleReasonsJson,
              created_at AS createdAt, stale_at AS staleAt
         FROM ending_snapshots WHERE project_id = ?
        ORDER BY chapter_id, created_at DESC, id`,
      )
      .all(projectId),
  );
  const invalidations = sqliteResult<InvalidationRow[]>(
    connection
      .prepare(
        `SELECT id, project_id AS projectId, source_chapter_id AS sourceChapterId,
              source_version_id AS sourceVersionId,
              target_chapter_id AS targetChapterId, scope, change_type AS changeType,
              created_at AS createdAt
         FROM derived_invalidations WHERE project_id = ?
        ORDER BY created_at DESC, id`,
      )
      .all(projectId),
  );
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
  raw: { projectId: string; chapterId?: string | null; includeResolved?: boolean },
): StateProposalCatalog {
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
    insertProposalBatch(
      connection,
      { ...input, generationRunId: null },
      context.idFactory(),
      context.clock.now().toISOString(),
      context.idFactory,
    );
    return catalog(connection, input.projectId);
  });
}

export function completeProviderBatch(
  context: StateProposalServiceContext,
  requestId: string,
  input: ProviderProposalBatchCompletionInput,
): Promise<{ readonly batchId: string; readonly catalog: StateProposalCatalog }> {
  const proposals = input.proposals.map((proposal) => StateProposalDraftSchema.parse(proposal));
  return context.workspace.writeProject(requestId, input.projectId, (connection) => {
    const run = connection
      .prepare(
        `SELECT status, run_type AS runType, chapter_id AS chapterId
           FROM generation_runs WHERE id = ? AND project_id = ?`,
      )
      .get(input.runId, input.projectId) as
      { readonly status: string; readonly runType: string; readonly chapterId: string } | undefined;
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
    if (
      !connection
        .prepare(
          `SELECT 1 FROM generation_input_sources
            WHERE run_id = ? AND source_type = 'version' AND source_id = ?`,
        )
        .get(input.runId, input.sourceVersionId)
    ) {
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
        proposals,
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
                input_tokens = ?, output_tokens = ?, error_code = NULL,
                retryable = NULL, partial_status = 'unavailable', finished_at = ?
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

function changeTypeFor(proposalType: string): ChangeType {
  switch (proposalType) {
    case 'arc_milestone':
      return 'arc_milestone';
    case 'timeline_event':
      return 'timeline';
    case 'foreshadowing':
      return 'foreshadowing';
    case 'knowledge_state':
      return 'knowledge';
    case 'character_relationship':
      return 'relationship';
    case 'entity_create':
    case 'canon_fact':
      return 'canon';
    default:
      return 'entity_state';
  }
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
        .prepare(`${proposalSelect} WHERE proposal.id = ? AND proposal.project_id = ?`)
        .get(resolution.proposalId, input.projectId) as ProposalRow | undefined;
      if (!row) {
        throw new StateProposalServiceError(
          'STATE_PROPOSAL_NOT_FOUND',
          'The StateProposal was not found.',
        );
      }
      const proposal = mapProposal(row);
      affectedBatchIds.add(proposal.batchId);
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
      const resolvedValue = applyStateProposalInTransaction(
        connection,
        proposal,
        value,
        now,
        context.idFactory,
      );
      connection
        .prepare(
          `UPDATE state_proposals
              SET status = ?, resolved_at = ?, resolved_value_json = ?
            WHERE id = ? AND project_id = ?`,
        )
        .run(
          resolution.decision === 'edit_accept' ? 'edited' : 'accepted',
          now,
          JSON.stringify(resolvedValue),
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
      const accepted = existing ?? {
        versionId: proposal.sourceVersionId,
        changeTypes: new Set<ChangeType>(),
      };
      accepted.changeTypes.add(changeTypeFor(proposal.proposalType));
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
