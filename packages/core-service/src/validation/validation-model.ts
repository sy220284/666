import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type { SemanticValidationOutput } from '@worldforge/contracts';

import type { DatabaseClock } from '../database/index.js';
import type { GenerationUsage } from '../generation-run.js';

export const systemClock: DatabaseClock = { now: () => new Date() };

export type ValidationServiceErrorCode =
  'VALIDATION_NOT_FOUND' | 'VALIDATION_INVALID' | 'VALIDATION_CONFLICT';

export class ValidationServiceError extends Error {
  readonly code: ValidationServiceErrorCode;

  constructor(code: ValidationServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ValidationServiceError';
    this.code = code;
  }
}

export interface ValidationServiceOptions {
  readonly clock?: DatabaseClock;
  readonly idFactory?: () => string;
}

export interface VersionRow {
  readonly versionId: string;
  readonly projectId: string;
  readonly chapterId: string;
  readonly finalVersionId: string | null;
  readonly contentHash: string;
}

export interface VersionBlockRow {
  readonly logicalBlockId: string;
  readonly blockType: string;
  readonly text: string;
  readonly contentHash: string;
  readonly locked: number | bigint;
  readonly orderKey: number | bigint;
}

export interface BatchRow {
  readonly batchId: string;
  readonly projectId: string;
  readonly chapterId: string;
  readonly sourceVersionId: string;
  readonly generationRunId: string | null;
  readonly source: string;
  readonly ruleVersion: string | null;
  readonly configVersion: string | null;
  readonly inputFingerprint: string | null;
  readonly issueCount: number | bigint;
  readonly createdAt: string;
  readonly finalVersionId?: string | null;
  readonly sourceContentHash?: string | null;
  readonly promptId?: string | null;
  readonly promptVersion?: number | bigint | null;
  readonly constraintHash?: string | null;
}

export interface IssueRow {
  readonly issueId: string;
  readonly batchId: string;
  readonly projectId: string;
  readonly chapterId: string | null;
  readonly sourceVersionId: string | null;
  readonly logicalBlockId: string | null;
  readonly expectedBlockHash: string | null;
  readonly textQuote: string | null;
  readonly rangeHintJson: string | null;
  readonly issueType: string;
  readonly source: string;
  readonly severity: string;
  readonly rationale: string;
  readonly evidenceIdsJson: string;
  readonly suggestion: string | null;
  readonly confidence: number | null;
  readonly ruleId: string | null;
  readonly ruleVersion: string | null;
  readonly configVersion: string | null;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly finalVersionId: string | null;
  readonly persistedBlockHash: string | null;
}

export interface TodoRow {
  readonly todoId: string;
  readonly projectId: string;
  readonly chapterId: string | null;
  readonly sceneBeatId: string | null;
  readonly logicalBlockId: string | null;
  readonly validationIssueId: string | null;
  readonly title: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
}

export interface CommentRow {
  readonly commentId: string;
  readonly projectId: string;
  readonly chapterId: string | null;
  readonly sourceVersionId: string | null;
  readonly logicalBlockId: string | null;
  readonly validationIssueId: string | null;
  readonly body: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly resolvedAt: string | null;
}

export interface ValidationSemanticIdentity {
  readonly sceneBeatGraph: string;
  readonly semanticInvalidations: string;
  readonly authoritativeSemanticState: string;
}

export function json(value: string | null): unknown | null {
  return value === null ? null : (JSON.parse(value) as unknown);
}

export function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'bigint' ? item.toString() : item,
  );
}

export function stableUuid(value: string): string {
  const valueHash = hash(value);
  return `${valueHash.slice(0, 8)}-${valueHash.slice(8, 12)}-5${valueHash.slice(
    13,
    16,
  )}-8${valueHash.slice(17, 20)}-${valueHash.slice(20, 32)}`;
}

export function finalVersion(
  database: DatabaseSync,
  projectId: string,
  sourceVersionId: string,
): { readonly version: VersionRow; readonly blocks: readonly VersionBlockRow[] } {
  const version = database
    .prepare(
      `SELECT version.id AS versionId, volume.project_id AS projectId,
              chapter.id AS chapterId, chapter.final_version_id AS finalVersionId,
              version.content_hash AS contentHash
         FROM versions version
         JOIN chapters chapter ON chapter.id = version.chapter_id
         JOIN volumes volume ON volume.id = chapter.volume_id
        WHERE version.id = ? AND volume.project_id = ?
          AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL`,
    )
    .get(sourceVersionId, projectId) as VersionRow | undefined;
  if (!version) {
    throw new ValidationServiceError(
      'VALIDATION_NOT_FOUND',
      'The validation Version was not found in this project.',
    );
  }
  if (version.finalVersionId !== version.versionId) {
    throw new ValidationServiceError(
      'VALIDATION_CONFLICT',
      'Validation requires the chapter current Final Version.',
    );
  }
  const blocks = database
    .prepare(
      `SELECT logical_block_id AS logicalBlockId, block_type AS blockType, text,
              content_hash AS contentHash, locked, order_key AS orderKey
         FROM version_blocks
        WHERE version_id = ?
        ORDER BY order_key, logical_block_id`,
    )
    .all(version.versionId) as unknown as VersionBlockRow[];
  if (blocks.length === 0) {
    throw new ValidationServiceError(
      'VALIDATION_INVALID',
      'The Final Version has no body blocks to validate.',
    );
  }
  return { version, blocks };
}

export function semanticInvalidationDigest(
  database: DatabaseSync,
  projectId: string,
  chapterId: string,
): string {
  const rows = database
    .prepare(
      `SELECT id, source_chapter_id AS sourceChapterId,
              source_version_id AS sourceVersionId, change_type AS changeType,
              target_chapter_id AS targetChapterId, created_at AS createdAt
         FROM derived_invalidations
        WHERE project_id = ? AND scope = 'validation'
          AND (target_chapter_id = ? OR target_chapter_id IS NULL)
        ORDER BY created_at, id`,
    )
    .all(projectId, chapterId) as unknown as Array<Readonly<Record<string, unknown>>>;
  return hash(stableJson(rows));
}

export function authoritativeSemanticDigest(database: DatabaseSync, projectId: string): string {
  const read = (sql: string): readonly unknown[] =>
    database.prepare(sql).all(projectId) as unknown as readonly unknown[];
  return hash(
    stableJson({
      entities: read(
        `SELECT * FROM entities WHERE project_id = ?
         ORDER BY entity_type, name, id`,
      ),
      canonFacts: read(
        `SELECT * FROM canon_facts WHERE project_id = ?
         ORDER BY entity_id, fact_key, confirmed_at, id`,
      ),
      entityStates: read(
        `SELECT * FROM entity_states WHERE project_id = ?
         ORDER BY entity_id, state_key, valid_from_chapter_id, id`,
      ),
      knowledgeStates: read(
        `SELECT * FROM knowledge_states WHERE project_id = ?
         ORDER BY character_id, information_key, valid_from_chapter_id, id`,
      ),
      timelineEvents: read(
        `SELECT * FROM timeline_events WHERE project_id = ?
         ORDER BY start_value, id`,
      ),
      foreshadowings: read(
        `SELECT * FROM foreshadowings WHERE project_id = ?
         ORDER BY id`,
      ),
      foreshadowingChapters: read(
        `SELECT * FROM foreshadowing_chapters WHERE project_id = ?
         ORDER BY foreshadowing_id, chapter_id, role`,
      ),
      foreshadowingRelations: read(
        `SELECT * FROM foreshadowing_relations WHERE project_id = ?
         ORDER BY source_foreshadowing_id, target_foreshadowing_id, relation_kind`,
      ),
      characterArcs: read(
        `SELECT * FROM character_arcs WHERE project_id = ?
         ORDER BY id`,
      ),
      arcMilestones: read(
        `SELECT * FROM arc_milestones WHERE project_id = ?
         ORDER BY arc_id, sort_index, id`,
      ),
      milestoneDependencies: read(
        `SELECT * FROM arc_milestone_dependencies WHERE project_id = ?
         ORDER BY milestone_id, dependency_milestone_id`,
      ),
      timelineDependencies: read(
        `SELECT * FROM arc_milestone_timeline_dependencies WHERE project_id = ?
         ORDER BY milestone_id, timeline_event_id`,
      ),
    }),
  );
}

export function sceneBeatValidationDigest(
  database: DatabaseSync,
  projectId: string,
  chapterId: string,
  sourceVersionId: string,
): string {
  const beats = database
    .prepare(
      `SELECT id, plot_node_id AS plotNodeId, title, goal,
              core_conflict AS coreConflict, expected_result AS expectedResult,
              beat_type AS beatType, word_target_percent AS wordTargetPercent,
              is_required AS isRequired, order_key AS orderKey,
              character_ids_json AS legacyCharacterIdsJson,
              location_ids_json AS legacyLocationIdsJson
         FROM scene_beats
        WHERE project_id = ? AND chapter_id = ? AND deleted_at IS NULL
        ORDER BY order_key, id`,
    )
    .all(projectId, chapterId) as unknown as Array<Readonly<Record<string, unknown>>>;
  const entities = database
    .prepare(
      `SELECT relation.scene_beat_id AS sceneBeatId, relation.entity_id AS entityId, relation.role
         FROM scene_beat_entities relation
         JOIN scene_beats beat ON beat.id = relation.scene_beat_id
        WHERE relation.project_id = ? AND beat.chapter_id = ? AND beat.deleted_at IS NULL
        ORDER BY relation.scene_beat_id, relation.role, relation.entity_id`,
    )
    .all(projectId, chapterId) as unknown as Array<Readonly<Record<string, unknown>>>;
  const blockMapping = database
    .prepare(
      `SELECT beat.id AS sceneBeatId, draft_block.logical_block_id AS logicalBlockId,
              version_block.content_hash AS blockHash
         FROM scene_beats beat
         JOIN scene_beat_block_links link ON link.scene_beat_id = beat.id
         JOIN draft_blocks draft_block ON draft_block.id = link.draft_block_id
         LEFT JOIN version_blocks version_block
           ON version_block.version_id = ?
          AND version_block.logical_block_id = draft_block.logical_block_id
        WHERE beat.project_id = ? AND beat.chapter_id = ? AND beat.deleted_at IS NULL
        ORDER BY beat.order_key, beat.id, draft_block.logical_block_id`,
    )
    .all(sourceVersionId, projectId, chapterId) as unknown as Array<
    Readonly<Record<string, unknown>>
  >;
  return hash(stableJson({ beats, entities, blockMapping }));
}

export function validationSemanticIdentity(
  database: DatabaseSync,
  resolved: { readonly version: VersionRow; readonly blocks: readonly VersionBlockRow[] },
): ValidationSemanticIdentity {
  return {
    sceneBeatGraph: sceneBeatValidationDigest(
      database,
      resolved.version.projectId,
      resolved.version.chapterId,
      resolved.version.versionId,
    ),
    semanticInvalidations: semanticInvalidationDigest(
      database,
      resolved.version.projectId,
      resolved.version.chapterId,
    ),
    authoritativeSemanticState: authoritativeSemanticDigest(database, resolved.version.projectId),
  };
}

export function ruleValidationFingerprint(
  database: DatabaseSync,
  resolved: { readonly version: VersionRow; readonly blocks: readonly VersionBlockRow[] },
  ruleVersion: string,
  configVersion: string,
  config: unknown,
  semanticIdentity: ValidationSemanticIdentity = validationSemanticIdentity(database, resolved),
): string {
  return hash(
    stableJson({
      version: resolved.version.contentHash,
      blocks: resolved.blocks.map((block) => [block.logicalBlockId, block.contentHash]),
      ...semanticIdentity,
      ruleVersion,
      configVersion,
      config,
    }),
  );
}

export function aiValidationFingerprint(
  database: DatabaseSync,
  resolved: { readonly version: VersionRow; readonly blocks: readonly VersionBlockRow[] },
  identity: {
    readonly constraintHash: string;
    readonly promptId: string;
    readonly promptVersion: number;
  },
  semanticIdentity: ValidationSemanticIdentity = validationSemanticIdentity(database, resolved),
): string {
  return hash(
    stableJson({
      version: resolved.version.contentHash,
      blocks: resolved.blocks.map((block) => [block.logicalBlockId, block.contentHash]),
      constraintHash: identity.constraintHash,
      promptId: identity.promptId,
      promptVersion: identity.promptVersion,
      ...semanticIdentity,
    }),
  );
}

export function validateScopedIds(
  database: DatabaseSync,
  input: {
    readonly projectId: string;
    readonly chapterId: string | null;
    readonly sceneBeatId: string | null;
    readonly logicalBlockId: string | null;
  },
): void {
  if (input.chapterId) {
    const chapter = database
      .prepare(
        `SELECT 1 FROM chapters chapter
         JOIN volumes volume ON volume.id = chapter.volume_id
        WHERE chapter.id = ? AND volume.project_id = ?`,
      )
      .get(input.chapterId, input.projectId);
    if (!chapter) throw new ValidationServiceError('VALIDATION_NOT_FOUND', 'Chapter not found.');
  }
  if (input.sceneBeatId) {
    const beat = database
      .prepare('SELECT 1 FROM scene_beats WHERE id = ? AND project_id = ?')
      .get(input.sceneBeatId, input.projectId);
    if (!beat) throw new ValidationServiceError('VALIDATION_NOT_FOUND', 'SceneBeat not found.');
  }
  if (input.logicalBlockId) {
    const block = database
      .prepare(
        `SELECT 1
           FROM draft_blocks block
           JOIN drafts draft ON draft.id = block.draft_id
           JOIN chapters chapter ON chapter.id = draft.chapter_id
           JOIN volumes volume ON volume.id = chapter.volume_id
          WHERE block.logical_block_id = ? AND volume.project_id = ?
            AND chapter.active_draft_id = draft.id`,
      )
      .get(input.logicalBlockId, input.projectId);
    if (!block) {
      throw new ValidationServiceError('VALIDATION_NOT_FOUND', 'Active Draft block not found.');
    }
  }
}

export interface ValidationAiCompletionInput {
  readonly projectId: string;
  readonly chapterId: string;
  readonly sourceVersionId: string;
  readonly runId: string;
  readonly output: SemanticValidationOutput;
  readonly usage?: GenerationUsage;
}
