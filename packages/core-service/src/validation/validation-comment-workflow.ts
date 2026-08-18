import type { DatabaseSync } from 'node:sqlite';

import { StoryCommentTagSchema } from '@worldforge/contracts';

const COMMENT_WORKFLOW_SETTING_KEY = 'validation.comment-workflow';
const MAX_TAGGED_COMMENTS = 500;

interface CommentWorkflowSettings {
  readonly version: 1;
  readonly tagsByCommentId: Readonly<Record<string, readonly string[]>>;
}

const EMPTY_SETTINGS: CommentWorkflowSettings = { version: 1, tagsByCommentId: {} };

export function commentTagsFor(
  database: DatabaseSync,
): Readonly<Record<string, readonly string[]>> {
  return readCommentWorkflowSettings(database).tagsByCommentId;
}

export function addCommentTags(
  database: DatabaseSync,
  commentIds: readonly string[],
  tags: readonly string[],
  updatedAt: string,
): void {
  const parsedTags = [...new Set(tags.map((tag) => StoryCommentTagSchema.parse(tag)))];
  const current = readCommentWorkflowSettings(database);
  const next: Record<string, readonly string[]> = { ...current.tagsByCommentId };
  for (const commentId of commentIds) {
    next[commentId] = [...new Set([...(next[commentId] ?? []), ...parsedTags])].slice(0, 12);
  }
  const entries = Object.entries(next);
  if (entries.length > MAX_TAGGED_COMMENTS) {
    entries
      .slice(0, entries.length - MAX_TAGGED_COMMENTS)
      .forEach(([commentId]) => delete next[commentId]);
  }
  database
    .prepare(
      `INSERT INTO project_settings(setting_key, value_json, updated_at)
       VALUES(?, ?, ?)
       ON CONFLICT(setting_key) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at`,
    )
    .run(
      COMMENT_WORKFLOW_SETTING_KEY,
      JSON.stringify({ version: 1, tagsByCommentId: next }),
      updatedAt,
    );
}

function readCommentWorkflowSettings(database: DatabaseSync): CommentWorkflowSettings {
  const row = database
    .prepare('SELECT value_json AS valueJson FROM project_settings WHERE setting_key = ?')
    .get(COMMENT_WORKFLOW_SETTING_KEY) as { readonly valueJson?: unknown } | undefined;
  if (!row || typeof row.valueJson !== 'string') return EMPTY_SETTINGS;
  try {
    const parsed = JSON.parse(row.valueJson) as unknown;
    if (!parsed || typeof parsed !== 'object') return EMPTY_SETTINGS;
    const tagsByCommentId = (parsed as { readonly tagsByCommentId?: unknown }).tagsByCommentId;
    if (!tagsByCommentId || typeof tagsByCommentId !== 'object' || Array.isArray(tagsByCommentId)) {
      return EMPTY_SETTINGS;
    }
    const normalized: Record<string, readonly string[]> = {};
    for (const [commentId, rawTags] of Object.entries(tagsByCommentId)) {
      if (!Array.isArray(rawTags)) continue;
      const tags = rawTags
        .map((tag) => StoryCommentTagSchema.safeParse(tag))
        .filter((result) => result.success)
        .map((result) => result.data);
      if (tags.length > 0) normalized[commentId] = [...new Set(tags)].slice(0, 12);
    }
    return { version: 1, tagsByCommentId: normalized };
  } catch {
    return EMPTY_SETTINGS;
  }
}
