import type { DatabaseSync } from 'node:sqlite';

import { ValidationCatalogSchema, type ValidationCatalog } from '@worldforge/contracts';

import {
  json,
  type BatchRow,
  type CommentRow,
  type IssueRow,
  type TodoRow,
} from './validation-model.js';

export function batchRows(database: DatabaseSync, projectId: string): BatchRow[] {
  return database
    .prepare(
      `SELECT id AS batchId, project_id AS projectId, chapter_id AS chapterId,
              source_version_id AS sourceVersionId, generation_run_id AS generationRunId,
              source, rule_version AS ruleVersion, config_version AS configVersion,
              input_fingerprint AS inputFingerprint, issue_count AS issueCount,
              created_at AS createdAt
         FROM validation_batches
        WHERE project_id = ?
        ORDER BY created_at DESC, id DESC`,
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
    batches: batches.map((row) => ({ ...row, issueCount: Number(row.issueCount) })),
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
