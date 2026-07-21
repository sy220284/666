import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  DerivedInvalidationInputSchema,
  DerivedInvalidationResultSchema,
  EndingSnapshotContentSchema,
  EndingSnapshotReadInputSchema,
  EndingSnapshotReadResultSchema,
  EndingSnapshotRefreshInputSchema,
  EndingSnapshotSchema,
  ProposedArcMilestoneStatusSchema,
  StateProposalCatalogSchema,
  StateProposalGenerateInputSchema,
  StateProposalListInputSchema,
  StateProposalResolveInputSchema,
  StateProposalSchema,
  type DerivedInvalidationInput,
  type DerivedInvalidationResult,
  type EndingSnapshot,
  type EndingSnapshotContent,
  type EndingSnapshotReadInput,
  type EndingSnapshotReadResult,
  type EndingSnapshotRefreshInput,
  type StateProposalCatalog,
  type StateProposalGenerateInput,
  type StateProposalResolveInput,
} from '@worldforge/contracts';
import {
  assertAuthorAuthority,
  compareChapterPosition,
  normalizeContinuityKey,
} from '@worldforge/domain';
import { z } from 'zod';

import type { DatabaseClock } from './database/index.js';
import { chapterPosition, validateEvidence } from './continuity-validation.js';
import type { ProjectWorkspaceService } from './project-workspace.js';

const systemClock: DatabaseClock = { now: () => new Date() };

type ChangeType = Exclude<
  ReturnType<typeof DerivedInvalidationInputSchema.parse>['changeTypes'][number],
  'prose'
>;
type InvalidationScope = ReturnType<
  typeof DerivedInvalidationResultSchema.parse
>['queuedScopes'][number];

interface ProposalRow {
  readonly id: string;
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
  readonly resolvedValueJson: string | null;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
}

interface SnapshotRow {
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

interface InvalidationRow {
  readonly id: string;
  readonly projectId: string;
  readonly sourceChapterId: string;
  readonly sourceVersionId: string;
  readonly targetChapterId: string | null;
  readonly scope: string;
  readonly changeType: string;
  readonly createdAt: string;
}

interface EntityStateRow {
  readonly id: string;
  readonly valueJson: string;
  readonly validFromChapterId: string;
  readonly validUntilChapterId: string | null;
}

interface VersionSourceRow {
  readonly finalVersionId: string | null;
}

const ArcResolutionValueSchema = z
  .strictObject({
    status: ProposedArcMilestoneStatusSchema,
    actualChapterId: z.uuid().nullable(),
  })
  .superRefine((value, context) => {
    if (value.status === 'hit' && value.actualChapterId === null) {
      context.addIssue({
        code: 'custom',
        path: ['actualChapterId'],
        message: 'A hit milestone requires an actual chapter.',
      });
    }
  });

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

export interface StateProposalServiceOptions {
  readonly clock?: DatabaseClock;
  readonly idFactory?: () => string;
}

function authorOnly(authority: 'author' | 'ai'): void {
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

function parseJson(value: string | null): unknown | null {
  return value === null ? null : (JSON.parse(value) as unknown);
}

function mapProposal(row: ProposalRow) {
  return StateProposalSchema.parse({
    id: row.id,
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
    resolvedValue: parseJson(row.resolvedValueJson),
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  });
}

function mapSnapshot(row: SnapshotRow): EndingSnapshot {
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

function mapInvalidation(row: InvalidationRow) {
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

function assertFinalVersion(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
  sourceVersionId: string,
): void {
  const row = connection
    .prepare(
      `SELECT c.final_version_id AS finalVersionId
         FROM versions version
         JOIN chapters c ON c.id = version.chapter_id
         JOIN volumes volume ON volume.id = c.volume_id
        WHERE version.id = ? AND version.chapter_id = ? AND volume.project_id = ?
          AND c.deleted_at IS NULL AND volume.deleted_at IS NULL`,
    )
    .get(sourceVersionId, chapterId, projectId) as VersionSourceRow | undefined;
  if (!row) {
    throw new StateProposalServiceError(
      'STATE_PROPOSAL_NOT_FOUND',
      'The finalized source Version was not found in this chapter and project.',
    );
  }
  if (row.finalVersionId !== sourceVersionId) {
    throw new StateProposalServiceError(
      'STATE_PROPOSAL_CONFLICT',
      'State proposals must use the chapter current final Version.',
    );
  }
}

function assertEntity(connection: DatabaseSync, projectId: string, entityId: string): void {
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

function assertMilestone(
  connection: DatabaseSync,
  projectId: string,
  milestoneId: string,
): { readonly status: string; readonly actualChapterId: string | null } {
  const row = connection
    .prepare(
      `SELECT status, actual_chapter_id AS actualChapterId
         FROM arc_milestones WHERE id = ? AND project_id = ?`,
    )
    .get(milestoneId, projectId) as
    { readonly status: string; readonly actualChapterId: string | null } | undefined;
  if (!row) {
    throw new StateProposalServiceError(
      'STATE_PROPOSAL_NOT_FOUND',
      'The proposal ArcMilestone was not found.',
    );
  }
  return row;
}

function validateVersionBlockEvidence(
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

function effectiveAt(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
  startChapterId: string,
  endChapterId: string | null,
): boolean {
  const target = chapterPosition(connection, projectId, chapterId);
  const start = chapterPosition(connection, projectId, startChapterId);
  if (compareChapterPosition(start, target) > 0) return false;
  if (!endChapterId) return true;
  return compareChapterPosition(target, chapterPosition(connection, projectId, endChapterId)) < 0;
}

function snapshotContent(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
): EndingSnapshotContent {
  chapterPosition(connection, projectId, chapterId);
  const entityRows = connection
    .prepare(
      `SELECT entity_id AS entityId, state_key AS stateKey, value_json AS valueJson,
              source_version_id AS sourceVersionId,
              valid_from_chapter_id AS validFromChapterId,
              valid_until_chapter_id AS validUntilChapterId
         FROM entity_states
        WHERE project_id = ? AND record_status = 'current'
        ORDER BY entity_id, state_key`,
    )
    .all(projectId) as unknown as {
    readonly entityId: string;
    readonly stateKey: string;
    readonly valueJson: string;
    readonly sourceVersionId: string;
    readonly validFromChapterId: string;
    readonly validUntilChapterId: string | null;
  }[];
  const knowledgeRows = connection
    .prepare(
      `SELECT character_id AS characterId, information_key AS informationKey,
              knowledge_status AS knowledgeStatus,
              valid_from_chapter_id AS validFromChapterId,
              valid_until_chapter_id AS validUntilChapterId
         FROM knowledge_states
        WHERE project_id = ? AND record_status = 'current'
        ORDER BY character_id, information_key`,
    )
    .all(projectId) as unknown as {
    readonly characterId: string;
    readonly informationKey: string;
    readonly knowledgeStatus: string;
    readonly validFromChapterId: string;
    readonly validUntilChapterId: string | null;
  }[];
  const foreshadowings = connection
    .prepare('SELECT id, status FROM foreshadowings WHERE project_id = ? ORDER BY id')
    .all(projectId) as unknown as { readonly id: string; readonly status: string }[];
  const milestones = connection
    .prepare(
      `SELECT id, status, actual_chapter_id AS actualChapterId
         FROM arc_milestones
        WHERE project_id = ? AND status IN ('hit', 'skipped')
        ORDER BY id`,
    )
    .all(projectId) as unknown as {
    readonly id: string;
    readonly status: string;
    readonly actualChapterId: string | null;
  }[];
  return EndingSnapshotContentSchema.parse({
    entityStates: entityRows
      .filter((row) =>
        effectiveAt(
          connection,
          projectId,
          chapterId,
          row.validFromChapterId,
          row.validUntilChapterId,
        ),
      )
      .map((row) => ({
        entityId: row.entityId,
        stateKey: row.stateKey,
        value: parseJson(row.valueJson),
        sourceVersionId: row.sourceVersionId,
      })),
    knowledgeStates: knowledgeRows
      .filter((row) =>
        effectiveAt(
          connection,
          projectId,
          chapterId,
          row.validFromChapterId,
          row.validUntilChapterId,
        ),
      )
      .map((row) => ({
        characterId: row.characterId,
        informationKey: row.informationKey,
        knowledgeStatus: row.knowledgeStatus,
      })),
    foreshadowings,
    arcMilestones: milestones,
  });
}

function snapshotRow(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
  sourceVersionId: string,
  now: string,
  idFactory: () => string,
): EndingSnapshot {
  assertFinalVersion(connection, projectId, chapterId, sourceVersionId);
  const content = snapshotContent(connection, projectId, chapterId);
  connection
    .prepare(
      `UPDATE ending_snapshots
          SET status = 'stale', stale_at = ?, stale_reasons_json = ?
        WHERE project_id = ? AND chapter_id = ? AND status = 'valid'
          AND source_version_id <> ?`,
    )
    .run(now, '[]', projectId, chapterId, sourceVersionId);
  const existing = connection
    .prepare(
      `SELECT id FROM ending_snapshots
        WHERE project_id = ? AND chapter_id = ? AND source_version_id = ?`,
    )
    .get(projectId, chapterId, sourceVersionId) as { readonly id: string } | undefined;
  const id = existing?.id ?? idFactory();
  if (existing) {
    connection
      .prepare(
        `UPDATE ending_snapshots
            SET status = 'valid', content_json = ?, stale_reasons_json = '[]',
                created_at = ?, stale_at = NULL
          WHERE id = ? AND project_id = ?`,
      )
      .run(JSON.stringify(content), now, id, projectId);
  } else {
    connection
      .prepare(
        `INSERT INTO ending_snapshots(
           id, project_id, chapter_id, source_version_id, status,
           content_json, stale_reasons_json, created_at, stale_at
         ) VALUES(?, ?, ?, ?, 'valid', ?, '[]', ?, NULL)`,
      )
      .run(id, projectId, chapterId, sourceVersionId, JSON.stringify(content), now);
  }
  const row = connection
    .prepare(
      `SELECT id, project_id AS projectId, chapter_id AS chapterId,
              source_version_id AS sourceVersionId, status,
              content_json AS contentJson, stale_reasons_json AS staleReasonsJson,
              created_at AS createdAt, stale_at AS staleAt
         FROM ending_snapshots WHERE id = ? AND project_id = ?`,
    )
    .get(id, projectId) as SnapshotRow | undefined;
  if (!row) {
    throw new StateProposalServiceError(
      'STATE_PROPOSAL_INVARIANT',
      'EndingSnapshot was not persisted.',
    );
  }
  return mapSnapshot(row);
}

function currentEntityState(
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

function applyEntityState(
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
       ) VALUES(?, ?, ?, ?, ?, ?, NULL, 'current', ?, ?, ?, NULL)`,
    )
    .run(
      idFactory(),
      proposal.projectId,
      proposal.entityId,
      stateKey,
      JSON.stringify(value),
      proposal.chapterId,
      JSON.stringify(proposal.evidence),
      proposal.sourceVersionId,
      now,
    );
}

function assertMilestoneDependenciesHit(
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

function applyArcMilestone(
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
  const resolved = ArcResolutionValueSchema.parse(value);
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

function catalog(connection: DatabaseSync, projectId: string): StateProposalCatalog {
  const proposals = connection
    .prepare(
      `SELECT id, project_id AS projectId, chapter_id AS chapterId,
              source_version_id AS sourceVersionId, proposal_type AS proposalType,
              source, entity_id AS entityId, state_key AS stateKey,
              arc_milestone_id AS arcMilestoneId,
              previous_value_json AS previousValueJson,
              proposed_value_json AS proposedValueJson, evidence_json AS evidenceJson,
              confidence, status, resolved_value_json AS resolvedValueJson,
              created_at AS createdAt, resolved_at AS resolvedAt
         FROM state_proposals WHERE project_id = ?
        ORDER BY status = 'pending' DESC, created_at DESC, id`,
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
    proposals: proposals.map(mapProposal),
    snapshots: snapshots.map(mapSnapshot),
    invalidations: invalidations.map(mapInvalidation),
  });
}

function scopesFor(changeType: ChangeType): readonly InvalidationScope[] {
  if (changeType === 'entity_state') return ['continuity', 'validation', 'cache'];
  if (changeType === 'arc_milestone') return ['arc', 'validation', 'cache'];
  if (changeType === 'timeline') return ['timeline', 'validation', 'cache'];
  if (changeType === 'foreshadowing') return ['foreshadowing', 'validation', 'cache'];
  return ['continuity', 'validation', 'cache'];
}

export class StateProposalService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;

  constructor(workspace: ProjectWorkspaceService, options: StateProposalServiceOptions = {}) {
    this.#workspace = workspace;
    this.#clock = options.clock ?? systemClock;
    this.#idFactory = options.idFactory ?? randomUUID;
  }

  list(raw: { projectId: string; chapterId?: string | null; includeResolved?: boolean }) {
    const input = StateProposalListInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (connection) => {
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

  generate(requestId: string, raw: StateProposalGenerateInput): Promise<StateProposalCatalog> {
    const input = StateProposalGenerateInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (connection) => {
      assertFinalVersion(connection, input.projectId, input.chapterId, input.sourceVersionId);
      if (input.proposals.length === 0) return catalog(connection, input.projectId);
      const now = this.#clock.now().toISOString();
      const keys = new Set<string>();
      for (const draft of input.proposals) {
        validateEvidence(connection, input.projectId, draft.evidence);
        validateVersionBlockEvidence(connection, input.sourceVersionId, draft.evidence);
        let entityId: string | null = null;
        let stateKey: string | null = null;
        let milestoneId: string | null = null;
        let previousValue: unknown = null;
        let proposedValue: unknown;
        let key: string;
        if (draft.proposalType === 'entity_state') {
          entityId = draft.entityId;
          stateKey = normalizeContinuityKey(draft.stateKey, 120);
          assertEntity(connection, input.projectId, entityId);
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
          ArcResolutionValueSchema.parse(proposedValue);
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
               id, project_id, chapter_id, source_version_id, proposal_type, source,
               entity_id, state_key, arc_milestone_id, previous_value_json,
               proposed_value_json, evidence_json, confidence, status,
               resolved_value_json, created_at, resolved_at
             ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, NULL)`,
          )
          .run(
            this.#idFactory(),
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
            now,
          );
      }
      return catalog(connection, input.projectId);
    });
  }

  resolve(requestId: string, raw: StateProposalResolveInput): Promise<StateProposalCatalog> {
    const input = StateProposalResolveInputSchema.parse(raw);
    authorOnly(input.authority);
    return this.#workspace.writeProject(requestId, input.projectId, (connection) => {
      const ids = input.resolutions.map((resolution) => resolution.proposalId);
      if (new Set(ids).size !== ids.length) {
        throw new StateProposalServiceError(
          'STATE_PROPOSAL_CONFLICT',
          'A proposal batch cannot resolve the same proposal twice.',
        );
      }
      const now = this.#clock.now().toISOString();
      const acceptedSources = new Map<string, string>();
      for (const resolution of input.resolutions) {
        const row = connection
          .prepare(
            `SELECT id, project_id AS projectId, chapter_id AS chapterId,
                    source_version_id AS sourceVersionId, proposal_type AS proposalType,
                    source, entity_id AS entityId, state_key AS stateKey,
                    arc_milestone_id AS arcMilestoneId,
                    previous_value_json AS previousValueJson,
                    proposed_value_json AS proposedValueJson, evidence_json AS evidenceJson,
                    confidence, status, resolved_value_json AS resolvedValueJson,
                    created_at AS createdAt, resolved_at AS resolvedAt
               FROM state_proposals
              WHERE id = ? AND project_id = ?`,
          )
          .get(resolution.proposalId, input.projectId) as ProposalRow | undefined;
        if (!row) {
          throw new StateProposalServiceError(
            'STATE_PROPOSAL_NOT_FOUND',
            'The StateProposal was not found.',
          );
        }
        const proposal = mapProposal(row);
        if (proposal.status !== 'pending') {
          throw new StateProposalServiceError(
            'STATE_PROPOSAL_CONFLICT',
            'Only pending StateProposals may be resolved.',
          );
        }
        assertFinalVersion(
          connection,
          proposal.projectId,
          proposal.chapterId,
          proposal.sourceVersionId,
        );
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
        const value =
          resolution.decision === 'edit_accept' ? resolution.editedValue : proposal.proposedValue;
        if (proposal.proposalType === 'entity_state') {
          applyEntityState(connection, proposal, value, now, this.#idFactory);
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
        acceptedSources.set(proposal.chapterId, proposal.sourceVersionId);
      }
      for (const [chapterId, versionId] of acceptedSources) {
        snapshotRow(connection, input.projectId, chapterId, versionId, now, this.#idFactory);
      }
      return catalog(connection, input.projectId);
    });
  }

  refreshSnapshot(requestId: string, raw: EndingSnapshotRefreshInput): Promise<EndingSnapshot> {
    const input = EndingSnapshotRefreshInputSchema.parse(raw);
    authorOnly(input.authority);
    return this.#workspace.writeProject(requestId, input.projectId, (connection) =>
      snapshotRow(
        connection,
        input.projectId,
        input.chapterId,
        input.sourceVersionId,
        this.#clock.now().toISOString(),
        this.#idFactory,
      ),
    );
  }

  readSnapshot(raw: EndingSnapshotReadInput): EndingSnapshotReadResult {
    const input = EndingSnapshotReadInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (connection) => {
      chapterPosition(connection, input.projectId, input.chapterId);
      const row = connection
        .prepare(
          `SELECT id, project_id AS projectId, chapter_id AS chapterId,
                  source_version_id AS sourceVersionId, status,
                  content_json AS contentJson,
                  stale_reasons_json AS staleReasonsJson,
                  created_at AS createdAt, stale_at AS staleAt
             FROM ending_snapshots
            WHERE project_id = ? AND chapter_id = ? AND status = 'valid'
            ORDER BY created_at DESC, id DESC LIMIT 1`,
        )
        .get(input.projectId, input.chapterId) as SnapshotRow | undefined;
      if (row) {
        const snapshot = mapSnapshot(row);
        return EndingSnapshotReadResultSchema.parse({
          projectId: input.projectId,
          chapterId: input.chapterId,
          snapshotSource: 'snapshot',
          snapshot,
          content: snapshot.content,
        });
      }
      return EndingSnapshotReadResultSchema.parse({
        projectId: input.projectId,
        chapterId: input.chapterId,
        snapshotSource: 'fallback_live_query',
        snapshot: null,
        content: snapshotContent(connection, input.projectId, input.chapterId),
      });
    });
  }

  invalidateDerived(
    requestId: string,
    raw: DerivedInvalidationInput,
  ): Promise<DerivedInvalidationResult> {
    const input = DerivedInvalidationInputSchema.parse(raw);
    authorOnly(input.authority);
    return this.#workspace.writeProject(requestId, input.projectId, (connection) => {
      assertFinalVersion(connection, input.projectId, input.sourceChapterId, input.sourceVersionId);
      const semantic = [
        ...new Set(input.changeTypes.filter((type) => type !== 'prose')),
      ] as ChangeType[];
      if (semantic.length === 0) {
        return DerivedInvalidationResultSchema.parse({
          invalidatedSnapshotIds: [],
          queuedScopes: [],
        });
      }
      const sourcePosition = chapterPosition(connection, input.projectId, input.sourceChapterId);
      const rows = connection
        .prepare(
          `SELECT id, project_id AS projectId, chapter_id AS chapterId,
                  source_version_id AS sourceVersionId, status,
                  content_json AS contentJson,
                  stale_reasons_json AS staleReasonsJson,
                  created_at AS createdAt, stale_at AS staleAt
             FROM ending_snapshots
            WHERE project_id = ? AND status = 'valid'`,
        )
        .all(input.projectId) as unknown as SnapshotRow[];
      const targets = rows.filter(
        (row) =>
          compareChapterPosition(
            chapterPosition(connection, input.projectId, row.chapterId),
            sourcePosition,
          ) > 0,
      );
      const now = this.#clock.now().toISOString();
      for (const row of targets) {
        const reasons = [...new Set([...mapSnapshot(row).staleReasons, ...semantic])];
        connection
          .prepare(
            `UPDATE ending_snapshots
                SET status = 'stale', stale_at = ?, stale_reasons_json = ?
              WHERE id = ? AND project_id = ? AND status = 'valid'`,
          )
          .run(now, JSON.stringify(reasons), row.id, input.projectId);
      }
      const queuedScopes = [...new Set(semantic.flatMap(scopesFor))];
      const targetChapterIds =
        targets.length > 0 ? targets.map((target) => target.chapterId) : [null];
      for (const changeType of semantic) {
        for (const scope of scopesFor(changeType)) {
          for (const targetChapterId of targetChapterIds) {
            connection
              .prepare(
                `INSERT INTO derived_invalidations(
                   id, project_id, source_chapter_id, source_version_id,
                   target_chapter_id, scope, change_type, created_at
                 ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
              )
              .run(
                this.#idFactory(),
                input.projectId,
                input.sourceChapterId,
                input.sourceVersionId,
                targetChapterId,
                scope,
                changeType,
                now,
              );
          }
        }
      }
      return DerivedInvalidationResultSchema.parse({
        invalidatedSnapshotIds: targets.map((target) => target.id),
        queuedScopes,
      });
    });
  }
}
