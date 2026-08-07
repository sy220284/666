import type { DatabaseSync } from 'node:sqlite';

import { ValidationCatalogSchema, type ValidationCatalog } from '@worldforge/contracts';

import {
  aiValidationFingerprint,
  authoritativeSemanticDigest,
  json,
  ruleValidationFingerprint,
  sceneBeatValidationDigest,
  semanticInvalidationDigest,
  type BatchRow,
  type CommentRow,
  type IssueRow,
  type TodoRow,
  type ValidationSemanticIdentity,
  type VersionBlockRow,
  type VersionRow,
} from './validation-model.js';
import { CONFIG_VERSION, RULE_CONFIG, RULE_VERSION } from './validation-rules.js';

type CatalogBatchRow = BatchRow & {
  readonly generationCreatedAt: string | null;
};

export function batchRows(database: DatabaseSync, projectId: string): CatalogBatchRow[] {
  return database
    .prepare(
      `SELECT batch.id AS batchId, batch.project_id AS projectId,
              batch.chapter_id AS chapterId, batch.source_version_id AS sourceVersionId,
              batch.generation_run_id AS generationRunId, batch.source,
              batch.rule_version AS ruleVersion, batch.config_version AS configVersion,
              batch.input_fingerprint AS inputFingerprint, batch.issue_count AS issueCount,
              batch.created_at AS createdAt,
              chapter.final_version_id AS finalVersionId,
              version.content_hash AS sourceContentHash,
              generation.prompt_id AS promptId,
              generation.prompt_version AS promptVersion,
              generation.created_at AS generationCreatedAt,
              constraint_package.constraint_hash AS constraintHash
         FROM validation_batches batch
         LEFT JOIN chapters chapter ON chapter.id = batch.chapter_id
         LEFT JOIN versions version ON version.id = batch.source_version_id
         LEFT JOIN generation_runs generation ON generation.id = batch.generation_run_id
         LEFT JOIN generation_constraint_packages constraint_package
           ON constraint_package.run_id = batch.generation_run_id
        WHERE batch.project_id = ?
        ORDER BY batch.created_at DESC, batch.id DESC`,
    )
    .all(projectId) as unknown as CatalogBatchRow[];
}

export function issueRows(database: DatabaseSync, projectId: string): IssueRow[] {
  return database
    .prepare(
      `SELECT issue.id AS issueId, issue.batch_id AS batchId,
              issue.project_id AS projectId, issue.chapter_id AS chapterId,
              issue.source_version_id AS sourceVersionId,
              issue.logical_block_id AS logicalBlockId,
              issue.expected_block_hash AS expectedBlockHash,
              issue.text_quote AS textQuote, issue.range_hint_json AS rangeHintJson,
              issue.issue_type AS issueType, issue.source, issue.severity,
              issue.rationale, issue.evidence_ids_json AS evidenceIdsJson,
              issue.suggestion, issue.confidence, issue.rule_id AS ruleId,
              issue.rule_version AS ruleVersion, issue.config_version AS configVersion,
              issue.status, issue.created_at AS createdAt, issue.updated_at AS updatedAt,
              chapter.final_version_id AS finalVersionId,
              block.content_hash AS persistedBlockHash
         FROM validation_issues issue
         LEFT JOIN chapters chapter ON chapter.id = issue.chapter_id
         LEFT JOIN version_blocks block
           ON block.version_id = issue.source_version_id
          AND block.logical_block_id = issue.logical_block_id
        WHERE issue.project_id = ?
        ORDER BY issue.status = 'open' DESC, issue.created_at DESC, issue.id`,
    )
    .all(projectId) as unknown as IssueRow[];
}

function sourceForBatch(
  database: DatabaseSync,
  row: CatalogBatchRow,
): { readonly version: VersionRow; readonly blocks: readonly VersionBlockRow[] } | null {
  if (!row.sourceContentHash) return null;
  const blocks = database
    .prepare(
      `SELECT logical_block_id AS logicalBlockId, block_type AS blockType, text,
              content_hash AS contentHash, locked, order_key AS orderKey
         FROM version_blocks
        WHERE version_id = ?
        ORDER BY order_key, logical_block_id`,
    )
    .all(row.sourceVersionId) as unknown as VersionBlockRow[];
  if (blocks.length === 0) return null;
  return {
    version: {
      versionId: row.sourceVersionId,
      projectId: row.projectId,
      chapterId: row.chapterId,
      finalVersionId: row.finalVersionId ?? null,
      contentHash: row.sourceContentHash,
    },
    blocks,
  };
}

interface FreshnessCache {
  readonly authoritativeSemanticState: string;
  readonly sourceByVersion: Map<
    string,
    { readonly version: VersionRow; readonly blocks: readonly VersionBlockRow[] } | null
  >;
  readonly invalidationByChapter: Map<string, string>;
  readonly sceneBeatBySource: Map<string, string>;
  readonly mutationSinceRun: Map<string, boolean>;
}

function semanticIdentity(
  database: DatabaseSync,
  row: CatalogBatchRow,
  cache: FreshnessCache,
): ValidationSemanticIdentity {
  let semanticInvalidations = cache.invalidationByChapter.get(row.chapterId);
  if (!semanticInvalidations) {
    semanticInvalidations = semanticInvalidationDigest(database, row.projectId, row.chapterId);
    cache.invalidationByChapter.set(row.chapterId, semanticInvalidations);
  }
  const sceneBeatKey = `${row.chapterId}:${row.sourceVersionId}`;
  let sceneBeatGraph = cache.sceneBeatBySource.get(sceneBeatKey);
  if (!sceneBeatGraph) {
    sceneBeatGraph = sceneBeatValidationDigest(
      database,
      row.projectId,
      row.chapterId,
      row.sourceVersionId,
    );
    cache.sceneBeatBySource.set(sceneBeatKey, sceneBeatGraph);
  }
  return {
    sceneBeatGraph,
    semanticInvalidations,
    authoritativeSemanticState: cache.authoritativeSemanticState,
  };
}

function semanticMutationOccurredAfterRun(
  database: DatabaseSync,
  row: CatalogBatchRow,
  cache: FreshnessCache,
): boolean {
  if (!row.generationCreatedAt || !row.generationRunId) return true;
  const cacheKey = `${row.generationRunId}:${row.generationCreatedAt}`;
  const cached = cache.mutationSinceRun.get(cacheKey);
  if (cached !== undefined) return cached;
  const changed = database
    .prepare(
      `WITH bounds(project_id, chapter_id, since) AS (VALUES(?, ?, ?))
       SELECT 1
         FROM bounds
        WHERE EXISTS (
          SELECT 1 FROM scene_beats beat
           WHERE beat.project_id = bounds.project_id
             AND beat.chapter_id = bounds.chapter_id
             AND beat.updated_at > bounds.since
          UNION ALL
          SELECT 1 FROM entities entity
           WHERE entity.project_id = bounds.project_id
             AND entity.updated_at > bounds.since
          UNION ALL
          SELECT 1 FROM canon_facts fact
           WHERE fact.project_id = bounds.project_id
             AND (
               fact.created_at > bounds.since OR fact.confirmed_at > bounds.since
               OR COALESCE(fact.superseded_at, '') > bounds.since
             )
          UNION ALL
          SELECT 1 FROM entity_states state
           WHERE state.project_id = bounds.project_id
             AND (
               state.created_at > bounds.since
               OR COALESCE(state.superseded_at, '') > bounds.since
             )
          UNION ALL
          SELECT 1 FROM knowledge_states knowledge
           WHERE knowledge.project_id = bounds.project_id
             AND (
               knowledge.created_at > bounds.since
               OR COALESCE(knowledge.superseded_at, '') > bounds.since
             )
          UNION ALL
          SELECT 1 FROM timeline_events event
           WHERE event.project_id = bounds.project_id
             AND event.updated_at > bounds.since
          UNION ALL
          SELECT 1 FROM foreshadowings foreshadowing
           WHERE foreshadowing.project_id = bounds.project_id
             AND foreshadowing.updated_at > bounds.since
          UNION ALL
          SELECT 1 FROM character_arcs arc
           WHERE arc.project_id = bounds.project_id
             AND arc.updated_at > bounds.since
          UNION ALL
          SELECT 1 FROM arc_milestones milestone
           WHERE milestone.project_id = bounds.project_id
             AND milestone.updated_at > bounds.since
          UNION ALL
          SELECT 1 FROM derived_invalidations invalidation
           WHERE invalidation.project_id = bounds.project_id
             AND invalidation.scope = 'validation'
             AND invalidation.target_chapter_id = bounds.chapter_id
             AND invalidation.created_at > bounds.since
        )
        LIMIT 1`,
    )
    .get(row.projectId, row.chapterId, row.generationCreatedAt);
  const result = Boolean(changed);
  cache.mutationSinceRun.set(cacheKey, result);
  return result;
}

function semanticFreshness(
  database: DatabaseSync,
  row: CatalogBatchRow,
  cache: FreshnessCache,
): 'current' | 'stale' {
  if (!row.inputFingerprint) return 'stale';
  let source = cache.sourceByVersion.get(row.sourceVersionId);
  if (source === undefined) {
    source = sourceForBatch(database, row);
    cache.sourceByVersion.set(row.sourceVersionId, source);
  }
  if (!source) return 'stale';
  const currentSemanticIdentity = semanticIdentity(database, row, cache);
  if (row.source === 'rule') {
    if (row.ruleVersion !== RULE_VERSION || row.configVersion !== CONFIG_VERSION) return 'stale';
    const current = ruleValidationFingerprint(
      database,
      source,
      RULE_VERSION,
      CONFIG_VERSION,
      RULE_CONFIG,
      currentSemanticIdentity,
    );
    return current === row.inputFingerprint ? 'current' : 'stale';
  }
  if (
    row.source === 'ai' &&
    row.constraintHash &&
    row.promptId &&
    row.promptVersion !== null &&
    row.promptVersion !== undefined
  ) {
    if (semanticMutationOccurredAfterRun(database, row, cache)) return 'stale';
    const current = aiValidationFingerprint(
      database,
      source,
      {
        constraintHash: row.constraintHash,
        promptId: row.promptId,
        promptVersion: Number(row.promptVersion),
      },
      currentSemanticIdentity,
    );
    return current === row.inputFingerprint ? 'current' : 'stale';
  }
  return 'stale';
}

export function catalog(database: DatabaseSync, projectId: string): ValidationCatalog {
  const batches = batchRows(database, projectId);
  const issues = issueRows(database, projectId);
  const freshnessCache: FreshnessCache = {
    authoritativeSemanticState: authoritativeSemanticDigest(database, projectId),
    sourceByVersion: new Map(),
    invalidationByChapter: new Map(),
    sceneBeatBySource: new Map(),
    mutationSinceRun: new Map(),
  };
  const todos = database
    .prepare(
      `SELECT id AS todoId, project_id AS projectId, chapter_id AS chapterId,
              scene_beat_id AS sceneBeatId, logical_block_id AS logicalBlockId,
              validation_issue_id AS validationIssueId, title, status,
              created_at AS createdAt, updated_at AS updatedAt,
              completed_at AS completedAt
         FROM story_todos WHERE project_id = ?
        ORDER BY status = 'open' DESC, updated_at DESC, id`,
    )
    .all(projectId) as unknown as TodoRow[];
  const comments = database
    .prepare(
      `SELECT id AS commentId, project_id AS projectId, chapter_id AS chapterId,
              source_version_id AS sourceVersionId, logical_block_id AS logicalBlockId,
              validation_issue_id AS validationIssueId, body, status,
              created_at AS createdAt, updated_at AS updatedAt,
              resolved_at AS resolvedAt
         FROM story_comments WHERE project_id = ?
        ORDER BY status = 'open' DESC, updated_at DESC, id`,
    )
    .all(projectId) as unknown as CommentRow[];
  return ValidationCatalogSchema.parse({
    projectId,
    batches: batches.map((row) => ({
      batchId: row.batchId,
      projectId: row.projectId,
      chapterId: row.chapterId,
      sourceVersionId: row.sourceVersionId,
      generationRunId: row.generationRunId,
      source: row.source,
      ruleVersion: row.ruleVersion,
      configVersion: row.configVersion,
      inputFingerprint: row.inputFingerprint,
      anchorFreshness: row.finalVersionId === row.sourceVersionId ? 'current' : 'stale',
      semanticFreshness: semanticFreshness(database, row, freshnessCache),
      constraintHash: row.constraintHash ?? null,
      promptId: row.promptId ?? null,
      promptVersion:
        row.promptVersion === null || row.promptVersion === undefined
          ? null
          : Number(row.promptVersion),
      issueCount: Number(row.issueCount),
      createdAt: row.createdAt,
    })),
    issues: issues.map((row) => ({
      issueId: row.issueId,
      batchId: row.batchId,
      projectId: row.projectId,
      issueType: row.issueType,
      source: row.source,
      severity: row.severity,
      rationale: row.rationale,
      evidenceIds: json(row.evidenceIdsJson),
      suggestion: row.suggestion,
      confidence: row.confidence,
      ruleId: row.ruleId,
      ruleVersion: row.ruleVersion,
      configVersion: row.configVersion,
      status: row.status,
      anchor: {
        projectId: row.projectId,
        chapterId: row.chapterId,
        versionId: row.sourceVersionId,
        logicalBlockId: row.logicalBlockId,
        expectedBlockHash: row.expectedBlockHash,
        textQuote: row.textQuote,
        rangeHint: json(row.rangeHintJson),
        state:
          row.sourceVersionId &&
          row.sourceVersionId === row.finalVersionId &&
          (!row.logicalBlockId || row.expectedBlockHash === row.persistedBlockHash)
            ? 'current'
            : 'stale',
      },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
    todos,
    comments,
  });
}
