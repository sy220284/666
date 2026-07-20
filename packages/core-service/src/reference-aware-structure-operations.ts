import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  TrashPermanentDeleteInputSchema,
  TrashPermanentDeletePreviewInputSchema,
  TrashPermanentDeletePreviewSchema,
  TrashPermanentDeleteResultSchema,
  type TrashDeleteImpact,
  type TrashEntry,
  type TrashPermanentDeleteInput,
  type TrashPermanentDeletePreview,
  type TrashPermanentDeletePreviewInput,
  type TrashPermanentDeleteResult,
} from '@worldforge/contracts';

import { stable } from './candidate-state.js';
import { ProjectStructureError } from './project-structure.js';
import type { ProjectWorkspaceService } from './project-workspace.js';
import { StructureOperationService } from './structure-operations.js';

interface TrashTarget {
  readonly entry: TrashEntry;
  readonly chapterIds: readonly string[];
  readonly volumeIds: readonly string[];
}

type DeleteAction = 'CASCADE' | 'RESTRICT' | 'NO ACTION' | 'SET NULL' | 'SET DEFAULT';

interface ChapterReferenceBlocker {
  readonly kind: 'chapter-reference';
  readonly count: number;
  readonly source: string;
  readonly deleteAction: DeleteAction;
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || Number(parsed) < 0) {
    throw new ProjectStructureError('STRUCTURE_CONFLICT', 'A persisted count is invalid.');
  }
  return Number(parsed);
}

function placeholders(values: readonly string[]): string {
  if (values.length === 0) throw new Error('EMPTY_SQL_VALUE_SET');
  return values.map(() => '?').join(', ');
}

function countWhere(
  database: DatabaseSync,
  table: string,
  column: string,
  values: readonly string[],
): number {
  if (values.length === 0) return 0;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(table) || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(column)) {
    throw new ProjectStructureError('STRUCTURE_CONFLICT', 'An unsafe schema identifier was found.');
  }
  const row = database
    .prepare(
      `SELECT COUNT(*) AS count FROM "${table}" WHERE "${column}" IN (${placeholders(values)})`,
    )
    .get(...values) as { count: number | bigint };
  return numberValue(row.count);
}

function planHash(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

function trashTarget(database: DatabaseSync, input: TrashPermanentDeletePreviewInput): TrashTarget {
  const row = database
    .prepare(
      `SELECT t.id, t.entity_type AS entityType, t.entity_id AS entityId,
              CASE WHEN t.entity_type = 'volume' THEN vo.title ELSE ch.title END AS title,
              t.original_parent_id AS originalParentId,
              t.original_order_key AS originalOrderKey, t.deleted_at AS deletedAt
         FROM trash_entries t
         LEFT JOIN volumes vo ON t.entity_type = 'volume' AND vo.id = t.entity_id
         LEFT JOIN chapters ch ON t.entity_type = 'chapter' AND ch.id = t.entity_id
         LEFT JOIN volumes cv ON ch.volume_id = cv.id
        WHERE t.id = ? AND (
          (t.entity_type = 'volume' AND vo.project_id = ?) OR
          (t.entity_type = 'chapter' AND cv.project_id = ?)
        )`,
    )
    .get(input.trashEntryId, input.projectId, input.projectId) as
    | {
        id: string;
        entityType: 'volume' | 'chapter';
        entityId: string;
        title: string;
        originalParentId: string;
        originalOrderKey: number | bigint;
        deletedAt: string;
      }
    | undefined;
  if (!row) {
    throw new ProjectStructureError('STRUCTURE_NOT_FOUND', 'The trash entry was not found.');
  }
  const entry = {
    ...row,
    originalOrderKey: String(row.originalOrderKey),
  } satisfies TrashEntry;
  if (entry.entityType === 'chapter') {
    return { entry, chapterIds: [entry.entityId], volumeIds: [] };
  }
  const chapterIds = (
    database.prepare('SELECT id FROM chapters WHERE volume_id = ? ORDER BY id').all(entry.entityId) as {
      id: string;
    }[]
  ).map((chapter) => chapter.id);
  return { entry, chapterIds, volumeIds: [entry.entityId] };
}

function deleteImpact(database: DatabaseSync, target: TrashTarget): TrashDeleteImpact {
  const draftIds =
    target.chapterIds.length === 0
      ? []
      : (
          database
            .prepare(
              `SELECT id FROM drafts WHERE chapter_id IN (${placeholders(target.chapterIds)}) ORDER BY id`,
            )
            .all(...target.chapterIds) as { id: string }[]
        ).map((row) => row.id);
  return {
    volumes: target.volumeIds.length,
    chapters: target.chapterIds.length,
    drafts: draftIds.length,
    draftBlocks: countWhere(database, 'draft_blocks', 'draft_id', draftIds),
    versions: countWhere(database, 'versions', 'chapter_id', target.chapterIds),
    candidates: countWhere(database, 'candidates', 'chapter_id', target.chapterIds),
  };
}

function chapterReferenceBlockers(
  database: DatabaseSync,
  chapterIds: readonly string[],
): ChapterReferenceBlocker[] {
  if (chapterIds.length === 0) return [];
  const controlled = new Set(['drafts.chapter_id', 'versions.chapter_id', 'candidates.chapter_id']);
  const tables = (
    database
      .prepare(
        `SELECT name FROM sqlite_master
          WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
          ORDER BY name`,
      )
      .all() as { name: string }[]
  ).map((row) => row.name);
  const blockers: ChapterReferenceBlocker[] = [];
  for (const table of tables) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(table)) {
      throw new ProjectStructureError('STRUCTURE_CONFLICT', 'An unsafe schema table name was found.');
    }
    const foreignKeys = database.prepare(`PRAGMA foreign_key_list("${table}")`).all() as {
      table: string;
      from: string;
      on_delete: string;
    }[];
    for (const foreignKey of foreignKeys) {
      if (foreignKey.table !== 'chapters') continue;
      const source = `${table}.${foreignKey.from}`;
      if (controlled.has(source)) continue;
      const count = countWhere(database, table, foreignKey.from, chapterIds);
      if (count === 0) continue;
      const deleteAction = foreignKey.on_delete.toUpperCase() as DeleteAction;
      if (!['CASCADE', 'RESTRICT', 'NO ACTION', 'SET NULL', 'SET DEFAULT'].includes(deleteAction)) {
        throw new ProjectStructureError('STRUCTURE_CONFLICT', 'An unknown foreign-key action was found.');
      }
      blockers.push({ kind: 'chapter-reference', count, source, deleteAction });
    }
  }
  return blockers.sort((left, right) => left.source.localeCompare(right.source, 'en'));
}

function blockersFor(database: DatabaseSync, target: TrashTarget, impact: TrashDeleteImpact) {
  return [
    ...(impact.versions ? [{ kind: 'version' as const, count: impact.versions }] : []),
    ...(impact.candidates ? [{ kind: 'candidate' as const, count: impact.candidates }] : []),
    ...chapterReferenceBlockers(database, target.chapterIds),
  ];
}

function previewWithDatabase(
  database: DatabaseSync,
  input: TrashPermanentDeletePreviewInput,
): TrashPermanentDeletePreview {
  const target = trashTarget(database, input);
  const impact = deleteImpact(database, target);
  const blockers = blockersFor(database, target, impact);
  return TrashPermanentDeletePreviewSchema.parse({
    planHash: planHash({ entry: target.entry, impact, blockers }),
    entry: target.entry,
    impact,
    blockers,
    canDelete: blockers.length === 0,
  });
}

export class ReferenceAwareStructureOperationService extends StructureOperationService {
  readonly #workspace: ProjectWorkspaceService;

  constructor(workspace: ProjectWorkspaceService) {
    super(workspace);
    this.#workspace = workspace;
  }

  override previewPermanentDelete(raw: TrashPermanentDeletePreviewInput): TrashPermanentDeletePreview {
    const input = TrashPermanentDeletePreviewInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (database) =>
      previewWithDatabase(database, input),
    );
  }

  override assertPermanentDeleteExecutable(raw: TrashPermanentDeleteInput): void {
    const input = TrashPermanentDeleteInputSchema.parse(raw);
    const preview = this.previewPermanentDelete(input);
    if (
      preview.planHash !== input.planHash ||
      preview.entry.title !== input.confirmationTitle ||
      !preview.canDelete
    ) {
      throw new ProjectStructureError(
        'STRUCTURE_CONFLICT',
        'Permanent-delete impact, confirmation, or chapter references changed.',
      );
    }
  }

  override permanentDelete(
    requestId: string,
    raw: TrashPermanentDeleteInput,
    backupId: string,
  ): Promise<TrashPermanentDeleteResult> {
    const input = TrashPermanentDeleteInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const preview = previewWithDatabase(database, input);
      if (
        preview.planHash !== input.planHash ||
        preview.entry.title !== input.confirmationTitle ||
        !preview.canDelete
      ) {
        throw new ProjectStructureError(
          'STRUCTURE_CONFLICT',
          'Permanent-delete impact, confirmation, or chapter references changed.',
        );
      }
      const target = trashTarget(database, input);
      const draftIds =
        target.chapterIds.length === 0
          ? []
          : (
              database
                .prepare(
                  `SELECT id FROM drafts WHERE chapter_id IN (${placeholders(target.chapterIds)})`,
                )
                .all(...target.chapterIds) as { id: string }[]
            ).map((row) => row.id);
      if (target.chapterIds.length > 0) {
        database
          .prepare(
            `UPDATE chapters SET active_draft_id = NULL, final_version_id = NULL
              WHERE id IN (${placeholders(target.chapterIds)})`,
          )
          .run(...target.chapterIds);
      }
      if (draftIds.length > 0) {
        database
          .prepare(`DELETE FROM draft_patch_log WHERE draft_id IN (${placeholders(draftIds)})`)
          .run(...draftIds);
        database
          .prepare(`DELETE FROM draft_blocks WHERE draft_id IN (${placeholders(draftIds)})`)
          .run(...draftIds);
        database.prepare(`DELETE FROM drafts WHERE id IN (${placeholders(draftIds)})`).run(...draftIds);
      }
      if (target.chapterIds.length > 0) {
        database
          .prepare(
            `DELETE FROM trash_entries
              WHERE entity_type = 'chapter' AND entity_id IN (${placeholders(target.chapterIds)})`,
          )
          .run(...target.chapterIds);
        database
          .prepare(`DELETE FROM chapters WHERE id IN (${placeholders(target.chapterIds)})`)
          .run(...target.chapterIds);
      }
      if (target.volumeIds.length > 0) {
        database.prepare(`DELETE FROM volumes WHERE id IN (${placeholders(target.volumeIds)})`).run(
          ...target.volumeIds,
        );
      }
      database.prepare('DELETE FROM trash_entries WHERE id = ?').run(input.trashEntryId);
      return TrashPermanentDeleteResultSchema.parse({
        deleted: true,
        trashEntryId: input.trashEntryId,
        backupId,
        impact: preview.impact,
      });
    });
  }
}
