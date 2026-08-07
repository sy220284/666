import type { DatabaseSync } from 'node:sqlite';

import { ValidationCatalogSchema, type ValidationCatalog } from '@worldforge/contracts';

import {
  aiValidationFingerprint,
  json,
  ruleValidationFingerprint,
  type BatchRow,
  type CommentRow,
  type IssueRow,
  type TodoRow,
  type VersionBlockRow,
  type VersionRow,
} from './validation-model.js';
import { CONFIG_VERSION, RULE_CONFIG, RULE_VERSION } from './validation-rules.js';

export function batchRows(database: DatabaseSync, projectId: string): BatchRow[] {
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
    .all(projectId) as unknown as BatchRow[];
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
  row: BatchRow,
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

function semanticFreshness(database: DatabaseSync, row: BatchRow): 'current' | 'stale' {
  if (!row.inputFingerprint) return 'stale';
  const source = sourceForBatch(database, row);
  if (!source) return 'stale';
  if (row.source === 'rule') {
    if (row.ruleVersion !== RULE_VERSION || row.configVersion !== CONFIG_VERSION) return 'stale';
    const current = ruleValidationFingerprint(
      database,
      source,
      RULE_VERSION,
      CONFIG_VERSION,
      RULE_CONFIG,
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
    const current = aiValidationFingerprint(database, source, {
      constraintHash: row.constraintHash,
      promptId: row.promptId,
      promptVersion: Number(row.promptVersion),
    });
    return current === row.inputFingerprint ? 'current' : 'stale';
  }
  return 'stale';
}

export function catalog(database: DatabaseSync, projectId: string): ValidationCatalog {
  const batches = batchRows(database, projectId);
  const issues = issueRows(database, projectId);
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
      semanticFreshness: semanticFreshness(database, row),
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
