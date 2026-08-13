import type { DatabaseSync } from 'node:sqlite';

import type { StoryKnowledgeProjectionInput } from '@worldforge/contracts';

import { StoryKnowledgeProjectionServiceError } from './story-knowledge-projection.js';
import { sqliteResult } from './database/sqlite-result.js';

type HistoryInput = Extract<StoryKnowledgeProjectionInput, { readonly view: 'history' }>;

interface HistoryVersionRow {
  readonly versionId: string;
  readonly chapterId: string;
  readonly title: string;
  readonly description: string;
  readonly versionType: string;
  readonly wordCount: number | bigint;
  readonly createdAt: string;
  readonly finalized: number | bigint;
}

interface HistoryCandidateRow {
  readonly candidateId: string;
  readonly title: string;
  readonly candidateType: string;
  readonly completeness: string;
  readonly status: string;
  readonly generationRunId: string | null;
  readonly sourceVersionId: string | null;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
}

interface HistoryCheckpointRow {
  readonly backupId: string;
  readonly projectId: string;
  readonly operation: string;
  readonly backupFileName: string;
  readonly sizeBytes: number | bigint;
  readonly sha256: string;
  readonly createdAt: string;
  readonly verifiedAt: string;
  readonly track: string;
  readonly displayName: string | null;
  readonly note: string | null;
  readonly authorProtected: number | bigint;
  readonly migrationProtected: number | bigint;
  readonly schemaVersion: number | bigint;
}

interface HistoryBackupFailureRow {
  readonly failureId: string;
  readonly projectId: string;
  readonly operation: string;
  readonly track: string;
  readonly errorCode: string;
  readonly occurredAt: string;
  readonly resolvedAt: string | null;
}

export function projectHistory(connection: DatabaseSync, input: HistoryInput) {
  const hasCreatedAt = input.beforeCreatedAt !== null;
  const hasVersionId = input.beforeVersionId !== null;
  if (hasCreatedAt !== hasVersionId) {
    throw new StoryKnowledgeProjectionServiceError(
      'STORY_KNOWLEDGE_INVALID',
      'History paging requires both createdAt and versionId cursor fields.',
    );
  }

  const rows = sqliteResult<HistoryVersionRow[]>(
    connection
      .prepare(
        `SELECT version.id AS versionId, version.chapter_id AS chapterId,
              version.title, version.description, version.version_type AS versionType,
              version.word_count AS wordCount, version.created_at AS createdAt,
              CASE WHEN chapter.final_version_id = version.id THEN 1 ELSE 0 END AS finalized
         FROM versions version
         JOIN chapters chapter ON chapter.id = version.chapter_id
         JOIN volumes volume ON volume.id = chapter.volume_id
        WHERE volume.project_id = ? AND version.chapter_id = ?
          AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL
          AND (
            ? IS NULL OR version.created_at < ? OR
            (version.created_at = ? AND version.id < ?)
          )
        ORDER BY version.created_at DESC, version.id DESC
        LIMIT ?`,
      )
      .all(
        input.projectId,
        input.chapterId,
        input.beforeCreatedAt,
        input.beforeCreatedAt,
        input.beforeCreatedAt,
        input.beforeVersionId,
        input.limit + 1,
      ),
  );
  const items = rows.slice(0, input.limit).map((row) => ({
    ...row,
    wordCount: Number(row.wordCount),
    finalized: Number(row.finalized) === 1,
  }));
  const cursor = rows.length > input.limit ? (items.at(-1) ?? null) : null;

  const candidateRows = sqliteResult<HistoryCandidateRow[]>(
    connection
      .prepare(
        `SELECT candidate.id AS candidateId, candidate.title,
              candidate.candidate_type AS candidateType, candidate.completeness,
              candidate.status, candidate.generation_run_id AS generationRunId,
              candidate.source_version_id AS sourceVersionId,
              candidate.created_at AS createdAt, candidate.resolved_at AS resolvedAt
         FROM candidates candidate
         JOIN chapters chapter ON chapter.id = candidate.chapter_id
         JOIN volumes volume ON volume.id = chapter.volume_id
        WHERE candidate.chapter_id = ? AND volume.project_id = ?
          AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL
        ORDER BY candidate.created_at DESC, candidate.id DESC
        LIMIT ?`,
      )
      .all(input.chapterId, input.projectId, input.limit + 1),
  );
  const candidates = candidateRows.slice(0, input.limit);

  const checkpointRows = sqliteResult<HistoryCheckpointRow[]>(
    connection
      .prepare(
        `SELECT id AS backupId, project_id AS projectId, operation,
              backup_file_name AS backupFileName, size_bytes AS sizeBytes, sha256,
              created_at AS createdAt, verified_at AS verifiedAt, backup_track AS track,
              display_name AS displayName, note, author_protected AS authorProtected,
              migration_protected AS migrationProtected, schema_version AS schemaVersion
         FROM backup_records
        WHERE project_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?`,
      )
      .all(input.projectId, input.limit + 1),
  );
  const checkpoints = checkpointRows.slice(0, input.limit).map((row) => ({
    ...row,
    sizeBytes: Number(row.sizeBytes),
    authorProtected: Number(row.authorProtected) === 1,
    migrationProtected: Number(row.migrationProtected) === 1,
    schemaVersion: Number(row.schemaVersion),
    protectionReasons: [],
  }));

  const backupFailureRows = sqliteResult<HistoryBackupFailureRow[]>(
    connection
      .prepare(
        `SELECT id AS failureId, project_id AS projectId, operation,
              backup_track AS track, error_code AS errorCode,
              occurred_at AS occurredAt, resolved_at AS resolvedAt
         FROM backup_failures
        WHERE project_id = ?
        ORDER BY occurred_at DESC, id DESC
        LIMIT ?`,
      )
      .all(input.projectId, input.limit + 1),
  );
  const backupFailures = backupFailureRows.slice(0, input.limit);

  return {
    view: input.view,
    projectId: input.projectId,
    bounded: true as const,
    chapterId: input.chapterId,
    items,
    nextBeforeCreatedAt: cursor?.createdAt ?? null,
    nextBeforeVersionId: cursor?.versionId ?? null,
    candidates,
    candidatesTruncated: candidateRows.length > input.limit,
    recovery: {
      checkpoints,
      checkpointsTruncated: checkpointRows.length > input.limit,
      backupFailures,
      backupFailuresTruncated: backupFailureRows.length > input.limit,
    },
  };
}
