import type { DatabaseSync } from 'node:sqlite';

import {
  ProjectContinuationInputSchema,
  ProjectContinuationSnapshotSchema,
  ProjectIdSchema,
  type ProjectContinuationInput,
  type ProjectContinuationSnapshot,
} from '@worldforge/contracts';

import type { DatabaseClock } from './database/index.js';
import type { ProjectWorkspaceService } from './project-workspace.js';

const CONTINUATION_SETTING_KEY = 'writing.continuation';
const systemClock: DatabaseClock = { now: () => new Date() };

export interface ProjectContinuationServiceOptions {
  readonly clock?: DatabaseClock;
}

interface SettingRow {
  readonly valueJson: string;
  readonly updatedAt: string;
}

interface ChapterRow {
  readonly title: string;
  readonly activeDraftId: string | null;
  readonly revision: number | bigint | null;
}

interface BlockRow {
  readonly contentHash: string | null;
  readonly textLength: number | bigint;
}

function safeInteger(value: number | bigint | null): number | null {
  if (value === null) return null;
  const converted = Number(value);
  return Number.isSafeInteger(converted) ? converted : null;
}

function readSetting(
  connection: DatabaseSync,
): { readonly input: ProjectContinuationInput; readonly updatedAt: string } | null {
  const row = connection
    .prepare(
      `SELECT value_json AS valueJson, updated_at AS updatedAt
         FROM project_settings
        WHERE setting_key = ?`,
    )
    .get(CONTINUATION_SETTING_KEY) as SettingRow | undefined;
  if (!row) return null;
  try {
    const parsed = ProjectContinuationInputSchema.safeParse(JSON.parse(row.valueJson) as unknown);
    if (!parsed.success) return null;
    return { input: parsed.data, updatedAt: row.updatedAt };
  } catch {
    return null;
  }
}

function snapshot(connection: DatabaseSync, projectId: string): ProjectContinuationSnapshot | null {
  const setting = readSetting(connection);
  if (!setting || setting.input.projectId !== projectId) return null;
  const { input, updatedAt } = setting;
  const chapter = connection
    .prepare(
      `SELECT chapter.title,
              chapter.active_draft_id AS activeDraftId,
              draft.revision
         FROM chapters chapter
         JOIN volumes volume ON volume.id = chapter.volume_id
         LEFT JOIN drafts draft ON draft.id = chapter.active_draft_id
        WHERE chapter.id = ?
          AND volume.project_id = ?
          AND chapter.deleted_at IS NULL
          AND volume.deleted_at IS NULL`,
    )
    .get(input.chapterId, projectId) as ChapterRow | undefined;
  const common = {
    ...input,
    chapterTitle: chapter?.title ?? null,
    updatedAt,
  };
  if (!chapter) {
    return ProjectContinuationSnapshotSchema.parse({
      status: 'stale',
      ...common,
      reason: 'chapter-missing',
    });
  }
  const revision = safeInteger(chapter.revision);
  if (chapter.activeDraftId !== input.draftId || revision === null) {
    return ProjectContinuationSnapshotSchema.parse({
      status: 'stale',
      ...common,
      reason: 'draft-changed',
    });
  }
  const block = connection
    .prepare(
      `SELECT content_hash AS contentHash, length(text) AS textLength
         FROM draft_blocks
        WHERE draft_id = ? AND logical_block_id = ?`,
    )
    .get(input.draftId, input.logicalBlockId) as BlockRow | undefined;
  if (!block || block.contentHash !== input.expectedBlockHash) {
    return ProjectContinuationSnapshotSchema.parse({
      status: 'stale',
      ...common,
      draftRevision: revision,
      reason: 'block-changed',
    });
  }
  const textLength = safeInteger(block.textLength);
  if (textLength === null || input.cursorOffset > textLength) {
    return ProjectContinuationSnapshotSchema.parse({
      status: 'stale',
      ...common,
      draftRevision: revision,
      reason: 'cursor-out-of-range',
    });
  }
  return ProjectContinuationSnapshotSchema.parse({
    status: 'ready',
    ...common,
    draftRevision: revision,
    chapterTitle: chapter.title,
  });
}

export class ProjectContinuationService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;

  constructor(workspace: ProjectWorkspaceService, options: ProjectContinuationServiceOptions = {}) {
    this.#workspace = workspace;
    this.#clock = options.clock ?? systemClock;
  }

  get(projectId: string): ProjectContinuationSnapshot | null {
    const validProjectId = ProjectIdSchema.parse(projectId);
    return this.#workspace.readProject(validProjectId, (connection) =>
      snapshot(connection, validProjectId),
    );
  }

  async save(
    requestId: string,
    input: ProjectContinuationInput,
  ): Promise<ProjectContinuationSnapshot> {
    const valid = ProjectContinuationInputSchema.parse(input);
    await this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      const timestamp = this.#clock.now().toISOString();
      connection
        .prepare(
          `INSERT INTO project_settings(setting_key, value_json, updated_at)
           VALUES(?, ?, ?)
           ON CONFLICT(setting_key) DO UPDATE SET
             value_json = excluded.value_json,
             updated_at = excluded.updated_at`,
        )
        .run(CONTINUATION_SETTING_KEY, JSON.stringify(valid), timestamp);
    });
    const persisted = this.get(valid.projectId);
    if (!persisted) {
      throw new Error('The writing continuation was not persisted.');
    }
    return persisted;
  }
}
