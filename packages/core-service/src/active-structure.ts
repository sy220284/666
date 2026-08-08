import type { DatabaseSync } from 'node:sqlite';

export interface ActiveChapterScope {
  readonly chapterId: string;
  readonly volumeId: string;
  readonly activeDraftId: string | null;
  readonly finalVersionId: string | null;
}

export interface ActiveDraftScope extends ActiveChapterScope {
  readonly draftId: string;
  readonly draftRevision: number | bigint;
  readonly draftStatus: string;
}

export function readActiveChapterScope(
  database: DatabaseSync,
  projectId: string,
  chapterId: string,
): ActiveChapterScope | undefined {
  return database
    .prepare(
      `SELECT chapter.id AS chapterId, volume.id AS volumeId,
              chapter.active_draft_id AS activeDraftId,
              chapter.final_version_id AS finalVersionId
         FROM chapters chapter
         JOIN volumes volume ON volume.id = chapter.volume_id
        WHERE chapter.id = ? AND volume.project_id = ?
          AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL`,
    )
    .get(chapterId, projectId) as ActiveChapterScope | undefined;
}

export function readActiveDraftScope(
  database: DatabaseSync,
  projectId: string,
  draftId: string,
): ActiveDraftScope | undefined {
  return database
    .prepare(
      `SELECT chapter.id AS chapterId, volume.id AS volumeId,
              chapter.active_draft_id AS activeDraftId,
              chapter.final_version_id AS finalVersionId,
              draft.id AS draftId, draft.revision AS draftRevision,
              draft.status AS draftStatus
         FROM drafts draft
         JOIN chapters chapter ON chapter.id = draft.chapter_id
         JOIN volumes volume ON volume.id = chapter.volume_id
        WHERE draft.id = ? AND volume.project_id = ?
          AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL
          AND chapter.active_draft_id = draft.id AND draft.status = 'active'`,
    )
    .get(draftId, projectId) as ActiveDraftScope | undefined;
}

export function isActiveChapter(
  database: DatabaseSync,
  projectId: string,
  chapterId: string,
): boolean {
  return readActiveChapterScope(database, projectId, chapterId) !== undefined;
}

export function isActiveDraft(database: DatabaseSync, projectId: string, draftId: string): boolean {
  return readActiveDraftScope(database, projectId, draftId) !== undefined;
}
