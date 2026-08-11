import type { DatabaseSync } from 'node:sqlite';

import type { StoryKnowledgeProjectionInput } from '@worldforge/contracts';

import { StoryKnowledgeProjectionServiceError } from './story-knowledge-projection.js';

type HistoryInput = Extract<StoryKnowledgeProjectionInput, { readonly view: 'history' }>;

export function projectHistory(connection: DatabaseSync, input: HistoryInput) {
  const hasCreatedAt = input.beforeCreatedAt !== null;
  const hasVersionId = input.beforeVersionId !== null;
  if (hasCreatedAt !== hasVersionId) {
    throw new StoryKnowledgeProjectionServiceError(
      'STORY_KNOWLEDGE_INVALID',
      'History paging requires both createdAt and versionId cursor fields.',
    );
  }

  const rows = connection
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
    ) as unknown as Array<{
    readonly versionId: string;
    readonly chapterId: string;
    readonly title: string;
    readonly description: string;
    readonly versionType: string;
    readonly wordCount: number | bigint;
    readonly createdAt: string;
    readonly finalized: number | bigint;
  }>;
  const items = rows.slice(0, input.limit).map((row) => ({
    ...row,
    wordCount: Number(row.wordCount),
    finalized: Number(row.finalized) === 1,
  }));
  const cursor = rows.length > input.limit ? (items.at(-1) ?? null) : null;
  return {
    view: input.view,
    projectId: input.projectId,
    bounded: true as const,
    chapterId: input.chapterId,
    items,
    nextBeforeCreatedAt: cursor?.createdAt ?? null,
    nextBeforeVersionId: cursor?.versionId ?? null,
  };
}
