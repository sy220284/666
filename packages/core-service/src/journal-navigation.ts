import type { DatabaseSync } from 'node:sqlite';

import {
  JournalNavigationReferenceSchema,
  type JournalNavigationReference,
} from '@worldforge/contracts';

interface ChapterRow {
  readonly id: string;
  readonly title: string;
}

interface VersionRow {
  readonly id: string;
  readonly chapterId: string;
  readonly chapterTitle: string;
}

interface EntityRow {
  readonly id: string;
  readonly name: string;
}

interface ValidationRow {
  readonly id: string;
  readonly issueType: string;
  readonly chapterId: string | null;
  readonly versionId: string | null;
  readonly logicalBlockId: string | null;
}

interface IdeaRow {
  readonly id: string;
  readonly title: string;
}

export function journalNavigationReferences(
  database: DatabaseSync,
  projectId: string,
  periodStart: string,
  periodEnd: string,
): readonly JournalNavigationReference[] {
  const references: JournalNavigationReference[] = [];
  const seen = new Set<string>();

  const append = (reference: JournalNavigationReference): void => {
    const key = `${reference.targetType}:${reference.targetId}`;
    if (seen.has(key) || references.length >= 100) return;
    seen.add(key);
    references.push(JournalNavigationReferenceSchema.parse(reference));
  };

  const chapters = database
    .prepare(
      `SELECT chapter.id, chapter.title
         FROM writing_sessions session
         JOIN chapters chapter ON chapter.id = session.chapter_id
        WHERE session.project_id = ?
          AND session.last_input_at >= ? AND session.last_input_at < ?
        GROUP BY chapter.id, chapter.title
        ORDER BY MAX(session.last_input_at) DESC, chapter.id
        LIMIT 25`,
    )
    .all(projectId, periodStart, periodEnd) as unknown as ChapterRow[];
  for (const row of chapters) {
    append({ targetType: 'chapter', targetId: row.id, label: `章节 · ${row.title}` });
  }

  const versions = database
    .prepare(
      `SELECT version.id, chapter.id AS chapterId, chapter.title AS chapterTitle
         FROM versions version
         JOIN chapters chapter ON chapter.id = version.chapter_id
         JOIN volumes volume ON volume.id = chapter.volume_id
        WHERE volume.project_id = ?
          AND version.created_at >= ? AND version.created_at < ?
        ORDER BY version.created_at DESC, version.id DESC
        LIMIT 25`,
    )
    .all(projectId, periodStart, periodEnd) as unknown as VersionRow[];
  for (const row of versions) {
    append({
      targetType: 'version',
      targetId: row.id,
      chapterId: row.chapterId,
      label: `版本 · ${row.chapterTitle}`,
    });
  }

  const entities = database
    .prepare(
      `SELECT id, name
         FROM entities
        WHERE project_id = ? AND status = 'active'
          AND updated_at >= ? AND updated_at < ?
        ORDER BY updated_at DESC, id DESC
        LIMIT 20`,
    )
    .all(projectId, periodStart, periodEnd) as unknown as EntityRow[];
  for (const row of entities) {
    append({ targetType: 'entity', targetId: row.id, label: `人物/设定 · ${row.name}` });
  }

  const issues = database
    .prepare(
      `SELECT id, issue_type AS issueType, chapter_id AS chapterId,
              source_version_id AS versionId, logical_block_id AS logicalBlockId
         FROM validation_issues
        WHERE project_id = ?
          AND updated_at >= ? AND updated_at < ?
        ORDER BY updated_at DESC, id DESC
        LIMIT 20`,
    )
    .all(projectId, periodStart, periodEnd) as unknown as ValidationRow[];
  for (const row of issues) {
    append({
      targetType: 'validation',
      targetId: row.id,
      chapterId: row.chapterId,
      versionId: row.versionId,
      logicalBlockId: row.logicalBlockId,
      label: `检查 · ${row.issueType}`,
    });
  }

  const ideas = database
    .prepare(
      `SELECT id, title
         FROM idea_cards
        WHERE project_id = ?
          AND updated_at >= ? AND updated_at < ?
        ORDER BY updated_at DESC, id DESC
        LIMIT 20`,
    )
    .all(projectId, periodStart, periodEnd) as unknown as IdeaRow[];
  for (const row of ideas) {
    append({ targetType: 'idea', targetId: row.id, label: `灵感 · ${row.title}` });
  }

  return references;
}
