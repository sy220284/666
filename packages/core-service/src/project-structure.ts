import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  ChapterCreateInputSchema,
  ChapterDeleteInputSchema,
  ChapterMoveInputSchema,
  ChapterUpdateInputSchema,
  ProjectIdSchema,
  ProjectStructureSchema,
  TrashEntriesSchema,
  TrashRestoreInputSchema,
  VolumeCreateInputSchema,
  VolumeDeleteInputSchema,
  VolumeMoveInputSchema,
  VolumeUpdateInputSchema,
  type ChapterCreateInput,
  type ChapterDeleteInput,
  type ChapterMoveInput,
  type ChapterUpdateInput,
  type LifecycleStatus,
  type OrderPlacement,
  type ProjectStructure,
  type TrashEntry,
  type TrashRestoreInput,
  type VolumeCreateInput,
  type VolumeDeleteInput,
  type VolumeMoveInput,
  type VolumeUpdateInput,
} from '@worldforge/contracts';
import { planOrderKey, type OrderedSibling } from '@worldforge/domain';

import type { DatabaseClock } from './database/index.js';
import { draftTablesAvailable, initializeChapterDraft } from './draft.js';
import type { ProjectWorkspaceService } from './project-workspace.js';

const systemClock: DatabaseClock = { now: () => new Date() };

export type ProjectStructureErrorCode =
  'STRUCTURE_NOT_FOUND' | 'STRUCTURE_CONFLICT' | 'STRUCTURE_INVALID_POSITION';

export class ProjectStructureError extends Error {
  readonly code: ProjectStructureErrorCode;

  constructor(code: ProjectStructureErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ProjectStructureError';
    this.code = code;
  }
}

export interface ProjectStructureServiceOptions {
  readonly clock?: DatabaseClock;
  readonly idFactory?: () => string;
  readonly faultInjector?: (stage: 'after-trash-entry') => void;
}

interface VolumeRow {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly orderKey: bigint;
  readonly status: string;
  readonly deletedAt: string | null;
}

interface ChapterRow {
  readonly id: string;
  readonly volumeId: string;
  readonly title: string;
  readonly orderKey: bigint;
  readonly status: string;
  readonly targetWordMin: bigint | null;
  readonly targetWordMax: bigint | null;
  readonly activeDraftId: string | null;
  readonly finalVersionId: string | null;
  readonly deletedAt: string | null;
}

interface TrashRow {
  readonly id: string;
  readonly entityType: 'volume' | 'chapter';
  readonly entityId: string;
  readonly title: string;
  readonly originalParentId: string;
  readonly originalOrderKey: bigint;
  readonly deletedAt: string;
}

function text(value: unknown): string {
  return String(value);
}

function nullableText(value: unknown): string | null {
  return value === null ? null : String(value);
}

function integer(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  throw new ProjectStructureError('STRUCTURE_CONFLICT', 'A stored order key is invalid.');
}

function nullableInteger(value: unknown): bigint | null {
  return value === null ? null : integer(value);
}

function safeNumber(value: bigint | null): number | null {
  if (value === null) return null;
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric)) {
    throw new ProjectStructureError('STRUCTURE_CONFLICT', 'A stored word target is invalid.');
  }
  return numeric;
}

function volumeRow(row: Record<string, unknown>): VolumeRow {
  return {
    id: text(row.id),
    projectId: text(row.project_id),
    title: text(row.title),
    orderKey: integer(row.order_key),
    status: text(row.status),
    deletedAt: nullableText(row.deleted_at),
  };
}

function chapterRow(row: Record<string, unknown>): ChapterRow {
  return {
    id: text(row.id),
    volumeId: text(row.volume_id),
    title: text(row.title),
    orderKey: integer(row.order_key),
    status: text(row.status),
    targetWordMin: nullableInteger(row.target_word_min),
    targetWordMax: nullableInteger(row.target_word_max),
    activeDraftId: nullableText(row.active_draft_id),
    finalVersionId: nullableText(row.final_version_id),
    deletedAt: nullableText(row.deleted_at),
  };
}

export function readStructure(connection: DatabaseSync, projectId: string): ProjectStructure {
  const volumes = connection
    .prepare(
      `SELECT id, project_id, title, order_key, status, deleted_at
         FROM volumes
        WHERE project_id = ? AND deleted_at IS NULL
        ORDER BY order_key, id`,
    )
    .all(projectId)
    .map(volumeRow);
  const chapters = connection
    .prepare(
      `SELECT c.id, c.volume_id, c.title, c.order_key, c.status,
              c.target_word_min, c.target_word_max, c.active_draft_id,
              c.final_version_id, c.deleted_at
         FROM chapters c
         JOIN volumes v ON v.id = c.volume_id
        WHERE v.project_id = ? AND v.deleted_at IS NULL AND c.deleted_at IS NULL
        ORDER BY v.order_key, c.order_key, c.id`,
    )
    .all(projectId)
    .map(chapterRow);
  const byVolume = new Map<string, ChapterRow[]>();
  for (const chapter of chapters) {
    const siblings = byVolume.get(chapter.volumeId) ?? [];
    siblings.push(chapter);
    byVolume.set(chapter.volumeId, siblings);
  }
  return ProjectStructureSchema.parse({
    projectId,
    volumes: volumes.map((volume) => ({
      id: volume.id,
      projectId: volume.projectId,
      title: volume.title,
      orderKey: volume.orderKey.toString(),
      status: volume.status,
      deletedAt: null,
      chapters: (byVolume.get(volume.id) ?? []).map((chapter) => ({
        id: chapter.id,
        volumeId: chapter.volumeId,
        title: chapter.title,
        orderKey: chapter.orderKey.toString(),
        status: chapter.status,
        targetWordMin: safeNumber(chapter.targetWordMin),
        targetWordMax: safeNumber(chapter.targetWordMax),
        activeDraftId: chapter.activeDraftId,
        finalVersionId: chapter.finalVersionId,
        deletedAt: null,
      })),
    })),
  });
}

function activeVolume(connection: DatabaseSync, projectId: string, volumeId: string): VolumeRow {
  const row = connection
    .prepare(
      `SELECT id, project_id, title, order_key, status, deleted_at
         FROM volumes
        WHERE id = ? AND project_id = ? AND deleted_at IS NULL`,
    )
    .get(volumeId, projectId);
  if (!row) {
    throw new ProjectStructureError('STRUCTURE_NOT_FOUND', 'The active volume was not found.');
  }
  return volumeRow(row);
}

function activeChapter(connection: DatabaseSync, projectId: string, chapterId: string): ChapterRow {
  const row = connection
    .prepare(
      `SELECT c.id, c.volume_id, c.title, c.order_key, c.status,
              c.target_word_min, c.target_word_max, c.active_draft_id,
              c.final_version_id, c.deleted_at
         FROM chapters c
         JOIN volumes v ON v.id = c.volume_id
        WHERE c.id = ? AND v.project_id = ?
          AND v.deleted_at IS NULL AND c.deleted_at IS NULL`,
    )
    .get(chapterId, projectId);
  if (!row) {
    throw new ProjectStructureError('STRUCTURE_NOT_FOUND', 'The active chapter was not found.');
  }
  return chapterRow(row);
}

function orderedVolumes(
  connection: DatabaseSync,
  projectId: string,
  excludedId?: string,
): OrderedSibling[] {
  return connection
    .prepare(
      `SELECT id, order_key
         FROM volumes
        WHERE project_id = ? AND deleted_at IS NULL AND (? IS NULL OR id <> ?)
        ORDER BY order_key, id`,
    )
    .all(projectId, excludedId ?? null, excludedId ?? null)
    .map((row) => ({ id: text(row.id), orderKey: integer(row.order_key) }));
}

function orderedChapters(
  connection: DatabaseSync,
  volumeId: string,
  excludedId?: string,
): OrderedSibling[] {
  return connection
    .prepare(
      `SELECT id, order_key
         FROM chapters
        WHERE volume_id = ? AND deleted_at IS NULL AND (? IS NULL OR id <> ?)
        ORDER BY order_key, id`,
    )
    .all(volumeId, excludedId ?? null, excludedId ?? null)
    .map((row) => ({ id: text(row.id), orderKey: integer(row.order_key) }));
}

function orderPlan(siblings: readonly OrderedSibling[], placement: OrderPlacement) {
  try {
    return planOrderKey(siblings, placement);
  } catch (error) {
    throw new ProjectStructureError(
      'STRUCTURE_INVALID_POSITION',
      'The requested sibling position is not available.',
      { cause: error },
    );
  }
}

function applyRebalance(
  connection: DatabaseSync,
  table: 'volumes' | 'chapters',
  updates: ReadonlyArray<OrderedSibling>,
): void {
  const update = connection.prepare(`UPDATE ${table} SET order_key = ? WHERE id = ?`);
  for (const item of updates) update.run(item.orderKey, item.id);
}

function assertUniqueVolumeTitle(
  connection: DatabaseSync,
  projectId: string,
  title: string,
  excludedId?: string,
): void {
  const found = connection
    .prepare(
      `SELECT 1 FROM volumes
        WHERE project_id = ? AND title = ? AND deleted_at IS NULL
          AND (? IS NULL OR id <> ?)
        LIMIT 1`,
    )
    .get(projectId, title, excludedId ?? null, excludedId ?? null);
  if (found) {
    throw new ProjectStructureError(
      'STRUCTURE_CONFLICT',
      'An active volume with the same title already exists.',
    );
  }
}

function assertUniqueChapterTitle(
  connection: DatabaseSync,
  volumeId: string,
  title: string,
  excludedId?: string,
): void {
  const found = connection
    .prepare(
      `SELECT 1 FROM chapters
        WHERE volume_id = ? AND title = ? AND deleted_at IS NULL
          AND (? IS NULL OR id <> ?)
        LIMIT 1`,
    )
    .get(volumeId, title, excludedId ?? null, excludedId ?? null);
  if (found) {
    throw new ProjectStructureError(
      'STRUCTURE_CONFLICT',
      'An active chapter with the same title already exists in the volume.',
    );
  }
}

function placementAtOriginal(
  siblings: readonly OrderedSibling[],
  originalOrderKey: bigint,
): OrderPlacement {
  const next = siblings.find((sibling) => sibling.orderKey >= originalOrderKey);
  return next ? { kind: 'before', siblingId: next.id } : { kind: 'end' };
}

export function initializeProjectStructure(
  connection: DatabaseSync,
  projectId: string,
  mode: 'starter' | 'blank',
  createdAt: string,
  idFactory: () => string = randomUUID,
): void {
  if (mode === 'blank') return;
  const volumeId = idFactory();
  const chapterId = idFactory();
  connection
    .prepare(
      `INSERT INTO volumes(id, project_id, title, order_key, status, deleted_at)
       VALUES(?, ?, '第一卷', 1024, 'pending', NULL)`,
    )
    .run(volumeId, projectId);
  connection
    .prepare(
      `INSERT INTO chapters(
         id, volume_id, title, order_key, status, target_word_min, target_word_max,
         active_draft_id, final_version_id, deleted_at
       ) VALUES(?, ?, '第一章', 1024, 'pending', NULL, NULL, NULL, NULL, NULL)`,
    )
    .run(chapterId, volumeId);
  if (draftTablesAvailable(connection)) {
    initializeChapterDraft(connection, chapterId, createdAt, idFactory);
  }
}

export class ProjectStructureService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;
  readonly #faultInjector: ((stage: 'after-trash-entry') => void) | undefined;

  constructor(workspace: ProjectWorkspaceService, options: ProjectStructureServiceOptions = {}) {
    this.#workspace = workspace;
    this.#clock = options.clock ?? systemClock;
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#faultInjector = options.faultInjector;
  }

  list(projectId: string): ProjectStructure {
    const validProjectId = ProjectIdSchema.parse(projectId);
    return this.#workspace.readProject(validProjectId, (connection) =>
      readStructure(connection, validProjectId),
    );
  }

  createVolume(requestId: string, input: VolumeCreateInput): Promise<ProjectStructure> {
    const valid = VolumeCreateInputSchema.parse(input);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      assertUniqueVolumeTitle(connection, valid.projectId, valid.title);
      const plan = orderPlan(
        orderedVolumes(connection, valid.projectId),
        valid.placement ?? { kind: 'end' },
      );
      applyRebalance(connection, 'volumes', plan.rebalanced);
      connection
        .prepare(
          `INSERT INTO volumes(id, project_id, title, order_key, status, deleted_at)
           VALUES(?, ?, ?, ?, 'pending', NULL)`,
        )
        .run(this.#idFactory(), valid.projectId, valid.title, plan.orderKey);
      return readStructure(connection, valid.projectId);
    });
  }

  updateVolume(requestId: string, input: VolumeUpdateInput): Promise<ProjectStructure> {
    const valid = VolumeUpdateInputSchema.parse(input);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      const current = activeVolume(connection, valid.projectId, valid.volumeId);
      const title = valid.patch.title ?? current.title;
      const status = valid.patch.status ?? (current.status as LifecycleStatus);
      assertUniqueVolumeTitle(connection, valid.projectId, title, current.id);
      connection
        .prepare('UPDATE volumes SET title = ?, status = ? WHERE id = ?')
        .run(title, status, current.id);
      return readStructure(connection, valid.projectId);
    });
  }

  moveVolume(requestId: string, input: VolumeMoveInput): Promise<ProjectStructure> {
    const valid = VolumeMoveInputSchema.parse(input);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      activeVolume(connection, valid.projectId, valid.volumeId);
      const plan = orderPlan(
        orderedVolumes(connection, valid.projectId, valid.volumeId),
        valid.placement,
      );
      applyRebalance(connection, 'volumes', plan.rebalanced);
      connection
        .prepare('UPDATE volumes SET order_key = ? WHERE id = ?')
        .run(plan.orderKey, valid.volumeId);
      return readStructure(connection, valid.projectId);
    });
  }

  deleteVolume(requestId: string, input: VolumeDeleteInput): Promise<ProjectStructure> {
    const valid = VolumeDeleteInputSchema.parse(input);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      const current = activeVolume(connection, valid.projectId, valid.volumeId);
      const deletedAt = this.#clock.now().toISOString();
      connection
        .prepare(
          `INSERT INTO trash_entries(
             id, entity_type, entity_id, original_parent_id, original_order_key, deleted_at
           ) VALUES(?, 'volume', ?, ?, ?, ?)`,
        )
        .run(this.#idFactory(), current.id, valid.projectId, current.orderKey, deletedAt);
      this.#faultInjector?.('after-trash-entry');
      connection
        .prepare('UPDATE volumes SET deleted_at = ? WHERE id = ?')
        .run(deletedAt, current.id);
      return readStructure(connection, valid.projectId);
    });
  }

  createChapter(requestId: string, input: ChapterCreateInput): Promise<ProjectStructure> {
    const valid = ChapterCreateInputSchema.parse(input);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      activeVolume(connection, valid.projectId, valid.volumeId);
      assertUniqueChapterTitle(connection, valid.volumeId, valid.title);
      const plan = orderPlan(
        orderedChapters(connection, valid.volumeId),
        valid.placement ?? { kind: 'end' },
      );
      applyRebalance(connection, 'chapters', plan.rebalanced);
      const chapterId = this.#idFactory();
      connection
        .prepare(
          `INSERT INTO chapters(
             id, volume_id, title, order_key, status, target_word_min, target_word_max,
             active_draft_id, final_version_id, deleted_at
           ) VALUES(?, ?, ?, ?, 'pending', NULL, NULL, NULL, NULL, NULL)`,
        )
        .run(chapterId, valid.volumeId, valid.title, plan.orderKey);
      initializeChapterDraft(
        connection,
        chapterId,
        this.#clock.now().toISOString(),
        this.#idFactory,
      );
      return readStructure(connection, valid.projectId);
    });
  }

  updateChapter(requestId: string, input: ChapterUpdateInput): Promise<ProjectStructure> {
    const valid = ChapterUpdateInputSchema.parse(input);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      const current = activeChapter(connection, valid.projectId, valid.chapterId);
      const title = valid.patch.title ?? current.title;
      const status = valid.patch.status ?? (current.status as LifecycleStatus);
      const targetWordMin =
        valid.patch.targetWordMin === undefined
          ? safeNumber(current.targetWordMin)
          : valid.patch.targetWordMin;
      const targetWordMax =
        valid.patch.targetWordMax === undefined
          ? safeNumber(current.targetWordMax)
          : valid.patch.targetWordMax;
      if (targetWordMin !== null && targetWordMax !== null && targetWordMin > targetWordMax) {
        throw new ProjectStructureError(
          'STRUCTURE_CONFLICT',
          'The chapter target minimum cannot exceed its maximum.',
        );
      }
      assertUniqueChapterTitle(connection, current.volumeId, title, current.id);
      connection
        .prepare(
          `UPDATE chapters
              SET title = ?, status = ?, target_word_min = ?, target_word_max = ?
            WHERE id = ?`,
        )
        .run(title, status, targetWordMin, targetWordMax, current.id);
      return readStructure(connection, valid.projectId);
    });
  }

  moveChapter(requestId: string, input: ChapterMoveInput): Promise<ProjectStructure> {
    const valid = ChapterMoveInputSchema.parse(input);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      const current = activeChapter(connection, valid.projectId, valid.chapterId);
      activeVolume(connection, valid.projectId, valid.targetVolumeId);
      assertUniqueChapterTitle(connection, valid.targetVolumeId, current.title, current.id);
      const plan = orderPlan(
        orderedChapters(connection, valid.targetVolumeId, current.id),
        valid.placement,
      );
      applyRebalance(connection, 'chapters', plan.rebalanced);
      connection
        .prepare('UPDATE chapters SET volume_id = ?, order_key = ? WHERE id = ?')
        .run(valid.targetVolumeId, plan.orderKey, current.id);
      return readStructure(connection, valid.projectId);
    });
  }

  deleteChapter(requestId: string, input: ChapterDeleteInput): Promise<ProjectStructure> {
    const valid = ChapterDeleteInputSchema.parse(input);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      const current = activeChapter(connection, valid.projectId, valid.chapterId);
      const deletedAt = this.#clock.now().toISOString();
      connection
        .prepare(
          `INSERT INTO trash_entries(
             id, entity_type, entity_id, original_parent_id, original_order_key, deleted_at
           ) VALUES(?, 'chapter', ?, ?, ?, ?)`,
        )
        .run(this.#idFactory(), current.id, current.volumeId, current.orderKey, deletedAt);
      this.#faultInjector?.('after-trash-entry');
      connection
        .prepare('UPDATE chapters SET deleted_at = ? WHERE id = ?')
        .run(deletedAt, current.id);
      return readStructure(connection, valid.projectId);
    });
  }

  listTrash(projectId: string): { readonly entries: TrashEntry[] } {
    const validProjectId = ProjectIdSchema.parse(projectId);
    return this.#workspace.readProject(validProjectId, (connection) => {
      const entries = connection
        .prepare(
          `SELECT t.id, t.entity_type, t.entity_id,
                  CASE WHEN t.entity_type = 'volume' THEN v.title ELSE c.title END AS title,
                  t.original_parent_id, t.original_order_key, t.deleted_at
             FROM trash_entries t
             LEFT JOIN volumes v ON t.entity_type = 'volume' AND v.id = t.entity_id
             LEFT JOIN chapters c ON t.entity_type = 'chapter' AND c.id = t.entity_id
             LEFT JOIN volumes cv ON c.volume_id = cv.id
            WHERE (t.entity_type = 'volume' AND v.project_id = ?)
               OR (t.entity_type = 'chapter' AND cv.project_id = ?)
            ORDER BY t.deleted_at DESC, t.id`,
        )
        .all(validProjectId, validProjectId)
        .map((row): TrashRow => ({
          id: text(row.id),
          entityType: text(row.entity_type) as TrashRow['entityType'],
          entityId: text(row.entity_id),
          title: text(row.title),
          originalParentId: text(row.original_parent_id),
          originalOrderKey: integer(row.original_order_key),
          deletedAt: text(row.deleted_at),
        }))
        .map((entry) => ({ ...entry, originalOrderKey: entry.originalOrderKey.toString() }));
      return TrashEntriesSchema.parse({ entries });
    });
  }

  restoreTrashEntry(requestId: string, input: TrashRestoreInput): Promise<ProjectStructure> {
    const valid = TrashRestoreInputSchema.parse(input);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      const row = connection
        .prepare(
          `SELECT t.id, t.entity_type, t.entity_id,
                  CASE WHEN t.entity_type = 'volume' THEN v.title ELSE c.title END AS title,
                  t.original_parent_id, t.original_order_key, t.deleted_at
             FROM trash_entries t
             LEFT JOIN volumes v ON t.entity_type = 'volume' AND v.id = t.entity_id
             LEFT JOIN chapters c ON t.entity_type = 'chapter' AND c.id = t.entity_id
             LEFT JOIN volumes cv ON c.volume_id = cv.id
            WHERE t.id = ? AND (
              (t.entity_type = 'volume' AND v.project_id = ?) OR
              (t.entity_type = 'chapter' AND cv.project_id = ?)
            )`,
        )
        .get(valid.trashEntryId, valid.projectId, valid.projectId);
      if (!row) {
        throw new ProjectStructureError('STRUCTURE_NOT_FOUND', 'The trash entry was not found.');
      }
      const trash: TrashRow = {
        id: text(row.id),
        entityType: text(row.entity_type) as TrashRow['entityType'],
        entityId: text(row.entity_id),
        title: text(row.title),
        originalParentId: text(row.original_parent_id),
        originalOrderKey: integer(row.original_order_key),
        deletedAt: text(row.deleted_at),
      };

      if (trash.entityType === 'volume') {
        if (valid.targetVolumeId) {
          throw new ProjectStructureError(
            'STRUCTURE_INVALID_POSITION',
            'A volume cannot be restored into another volume.',
          );
        }
        assertUniqueVolumeTitle(connection, valid.projectId, trash.title, trash.entityId);
        const siblings = orderedVolumes(connection, valid.projectId, trash.entityId);
        const placement =
          valid.placement === 'original'
            ? placementAtOriginal(siblings, trash.originalOrderKey)
            : valid.placement;
        const plan = orderPlan(siblings, placement);
        applyRebalance(connection, 'volumes', plan.rebalanced);
        connection
          .prepare('UPDATE volumes SET deleted_at = NULL, order_key = ? WHERE id = ?')
          .run(plan.orderKey, trash.entityId);
      } else {
        if (valid.placement === 'original' && valid.targetVolumeId) {
          throw new ProjectStructureError(
            'STRUCTURE_INVALID_POSITION',
            'Original-position restore cannot select a different volume.',
          );
        }
        const targetVolumeId = valid.targetVolumeId ?? trash.originalParentId;
        activeVolume(connection, valid.projectId, targetVolumeId);
        assertUniqueChapterTitle(connection, targetVolumeId, trash.title, trash.entityId);
        const siblings = orderedChapters(connection, targetVolumeId, trash.entityId);
        const placement =
          valid.placement === 'original'
            ? placementAtOriginal(siblings, trash.originalOrderKey)
            : valid.placement;
        const plan = orderPlan(siblings, placement);
        applyRebalance(connection, 'chapters', plan.rebalanced);
        connection
          .prepare(
            'UPDATE chapters SET deleted_at = NULL, volume_id = ?, order_key = ? WHERE id = ?',
          )
          .run(targetVolumeId, plan.orderKey, trash.entityId);
      }
      connection.prepare('DELETE FROM trash_entries WHERE id = ?').run(trash.id);
      return readStructure(connection, valid.projectId);
    });
  }
}
