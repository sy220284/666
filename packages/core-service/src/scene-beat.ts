import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  SceneBeatConvertBlocksInputSchema,
  SceneBeatCreateInputSchema,
  SceneBeatCrossChapterMoveInputSchema,
  SceneBeatCrossChapterMovePreviewInputSchema,
  SceneBeatCrossChapterMovePreviewSchema,
  SceneBeatDeleteInputSchema,
  SceneBeatEntityIdsSchema,
  SceneBeatListInputSchema,
  SceneBeatListSchema,
  SceneBeatMoveInputSchema,
  SceneBeatRestoreInputSchema,
  SceneBeatSchema,
  SceneBeatSetBlockLinksInputSchema,
  SceneBeatUpdateInputSchema,
  type SceneBeat,
  type SceneBeatConvertBlocksInput,
  type SceneBeatCreateInput,
  type SceneBeatCrossChapterMoveInput,
  type SceneBeatCrossChapterMovePreview,
  type SceneBeatCrossChapterMovePreviewInput,
  type SceneBeatDeleteInput,
  type SceneBeatList,
  type SceneBeatListInput,
  type SceneBeatMoveInput,
  type SceneBeatRestoreInput,
  type SceneBeatSetBlockLinksInput,
  type SceneBeatUpdateInput,
} from '@worldforge/contracts';
import {
  SQLITE_INTEGER_MAX,
  SQLITE_INTEGER_MIN,
  planOrderKey,
  type OrderedSibling,
  type OrderPlacement,
} from '@worldforge/domain';

import type { DatabaseClock } from './database/index.js';
import type { ProjectWorkspaceService } from './project-workspace.js';

const systemClock: DatabaseClock = { now: () => new Date() };

export type SceneBeatServiceErrorCode =
  | 'SCENE_BEAT_NOT_FOUND'
  | 'SCENE_BEAT_CONFLICT'
  | 'SCENE_BEAT_INVALID_POSITION'
  | 'SCENE_BEAT_INVARIANT';

export class SceneBeatServiceError extends Error {
  readonly code: SceneBeatServiceErrorCode;

  constructor(code: SceneBeatServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SceneBeatServiceError';
    this.code = code;
  }
}

export interface SceneBeatServiceOptions {
  readonly clock?: DatabaseClock;
  readonly idFactory?: () => string;
  readonly faultInjector?: (
    stage: 'after-beat-write' | 'after-beat-move' | 'after-beat-delete' | 'after-link-replace',
  ) => void;
}

interface BeatRow {
  readonly id: string;
  readonly projectId: string;
  readonly chapterId: string;
  readonly plotNodeId: string | null;
  readonly title: string;
  readonly goal: string;
  readonly coreConflict: string;
  readonly expectedResult: string;
  readonly beatType: string;
  readonly wordTargetPercent: number | bigint;
  readonly isRequired: number | bigint;
  readonly orderKey: number | bigint;
  readonly characterIdsJson: string;
  readonly locationIdsJson: string;
  readonly deletedAt: string | null;
  readonly updatedAt: string;
}

interface LinkedBlockRow {
  readonly draftBlockId: string;
  readonly logicalBlockId: string;
  readonly draftId: string;
  readonly chapterId: string;
  readonly text: string;
}

function text(value: unknown): string {
  if (typeof value !== 'string') {
    throw new SceneBeatServiceError('SCENE_BEAT_INVARIANT', 'Persisted SceneBeat text is invalid.');
  }
  return value;
}

function integer(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  throw new SceneBeatServiceError(
    'SCENE_BEAT_INVARIANT',
    'Persisted SceneBeat integer is invalid.',
  );
}

function safeNumber(value: unknown): number {
  const parsed = integer(value);
  if (parsed < 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new SceneBeatServiceError(
      'SCENE_BEAT_INVARIANT',
      'Persisted SceneBeat number is invalid.',
    );
  }
  return Number(parsed);
}

function entityIds(raw: string): string[] {
  try {
    return SceneBeatEntityIdsSchema.parse(JSON.parse(raw));
  } catch (error) {
    throw new SceneBeatServiceError(
      'SCENE_BEAT_INVARIANT',
      'Persisted SceneBeat entity references are invalid.',
      { cause: error },
    );
  }
}

function assertProject(connection: DatabaseSync, projectId: string): void {
  if (!connection.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) {
    throw new SceneBeatServiceError('SCENE_BEAT_NOT_FOUND', 'The project was not found.');
  }
}

function assertChapter(connection: DatabaseSync, projectId: string, chapterId: string): void {
  const found = connection
    .prepare(
      `SELECT 1
         FROM chapters chapter
         JOIN volumes volume ON volume.id = chapter.volume_id
        WHERE chapter.id = ? AND volume.project_id = ?
          AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL`,
    )
    .get(chapterId, projectId);
  if (!found) {
    throw new SceneBeatServiceError('SCENE_BEAT_NOT_FOUND', 'The active chapter was not found.');
  }
}

function assertPlotNode(
  connection: DatabaseSync,
  projectId: string,
  plotNodeId: string | null,
): void {
  if (plotNodeId === null) return;
  const found = connection
    .prepare('SELECT 1 FROM plot_nodes WHERE id = ? AND project_id = ?')
    .get(plotNodeId, projectId);
  if (!found) {
    throw new SceneBeatServiceError('SCENE_BEAT_NOT_FOUND', 'The linked PlotNode was not found.');
  }
}

function beatRow(
  connection: DatabaseSync,
  projectId: string,
  sceneBeatId: string,
  includeDeleted = false,
): BeatRow {
  const row = connection
    .prepare(
      `SELECT id, project_id AS projectId, chapter_id AS chapterId,
              plot_node_id AS plotNodeId, title, goal,
              core_conflict AS coreConflict, expected_result AS expectedResult,
              beat_type AS beatType, word_target_percent AS wordTargetPercent,
              is_required AS isRequired, order_key AS orderKey,
              character_ids_json AS characterIdsJson,
              location_ids_json AS locationIdsJson,
              deleted_at AS deletedAt, updated_at AS updatedAt
         FROM scene_beats
        WHERE id = ? AND project_id = ?
          AND (? = 1 OR deleted_at IS NULL)`,
    )
    .get(sceneBeatId, projectId, includeDeleted ? 1 : 0) as BeatRow | undefined;
  if (!row) {
    throw new SceneBeatServiceError('SCENE_BEAT_NOT_FOUND', 'The SceneBeat was not found.');
  }
  return row;
}

function linkedBlocks(connection: DatabaseSync, sceneBeatId: string): LinkedBlockRow[] {
  return connection
    .prepare(
      `SELECT block.id AS draftBlockId, block.logical_block_id AS logicalBlockId,
              draft.id AS draftId, draft.chapter_id AS chapterId, block.text
         FROM scene_beat_block_links link
         JOIN draft_blocks block ON block.id = link.draft_block_id
         JOIN drafts draft ON draft.id = block.draft_id
        WHERE link.scene_beat_id = ?
        ORDER BY draft.chapter_id, block.order_key, block.id`,
    )
    .all(sceneBeatId) as unknown as LinkedBlockRow[];
}

function parseBeat(connection: DatabaseSync, row: BeatRow): SceneBeat {
  return SceneBeatSchema.parse({
    id: text(row.id),
    projectId: text(row.projectId),
    chapterId: text(row.chapterId),
    plotNodeId: row.plotNodeId === null ? null : text(row.plotNodeId),
    title: text(row.title),
    goal: text(row.goal),
    coreConflict: text(row.coreConflict),
    expectedResult: text(row.expectedResult),
    beatType: text(row.beatType),
    wordTargetPercent: safeNumber(row.wordTargetPercent),
    required: integer(row.isRequired) === 1n,
    orderKey: integer(row.orderKey).toString(),
    characterIds: entityIds(text(row.characterIdsJson)),
    locationIds: entityIds(text(row.locationIdsJson)),
    blockLinks: linkedBlocks(connection, row.id).map((link) => ({
      draftBlockId: text(link.draftBlockId),
      logicalBlockId: text(link.logicalBlockId),
      draftId: text(link.draftId),
      chapterId: text(link.chapterId),
    })),
    deletedAt: row.deletedAt === null ? null : text(row.deletedAt),
    updatedAt: text(row.updatedAt),
  });
}

function readList(connection: DatabaseSync, input: SceneBeatListInput): SceneBeatList {
  assertProject(connection, input.projectId);
  assertChapter(connection, input.projectId, input.chapterId);
  const rows = connection
    .prepare(
      `SELECT id, project_id AS projectId, chapter_id AS chapterId,
              plot_node_id AS plotNodeId, title, goal,
              core_conflict AS coreConflict, expected_result AS expectedResult,
              beat_type AS beatType, word_target_percent AS wordTargetPercent,
              is_required AS isRequired, order_key AS orderKey,
              character_ids_json AS characterIdsJson,
              location_ids_json AS locationIdsJson,
              deleted_at AS deletedAt, updated_at AS updatedAt
         FROM scene_beats
        WHERE project_id = ? AND chapter_id = ?
        ORDER BY deleted_at IS NOT NULL, order_key, id`,
    )
    .all(input.projectId, input.chapterId) as unknown as BeatRow[];
  const parsed = rows.map((row) => parseBeat(connection, row));
  return SceneBeatListSchema.parse({
    projectId: input.projectId,
    chapterId: input.chapterId,
    beats: parsed.filter((beat) => beat.deletedAt === null),
    deletedBeats: parsed.filter((beat) => beat.deletedAt !== null),
  });
}

function orderedSiblings(
  connection: DatabaseSync,
  chapterId: string,
  excludedId?: string,
): OrderedSibling[] {
  return (
    connection
      .prepare(
        `SELECT id, order_key AS orderKey
           FROM scene_beats
          WHERE chapter_id = ? AND deleted_at IS NULL
            AND (? IS NULL OR id <> ?)
          ORDER BY order_key, id`,
      )
      .all(chapterId, excludedId ?? null, excludedId ?? null) as unknown as Array<{
      readonly id: string;
      readonly orderKey: number | bigint;
    }>
  ).map((row) => ({ id: text(row.id), orderKey: integer(row.orderKey) }));
}

function orderPlan(siblings: readonly OrderedSibling[], placement: OrderPlacement) {
  try {
    return planOrderKey(siblings, placement);
  } catch (error) {
    throw new SceneBeatServiceError(
      'SCENE_BEAT_INVALID_POSITION',
      'The requested SceneBeat position is not available.',
      { cause: error },
    );
  }
}

function temporaryOrderKeys(connection: DatabaseSync, chapterId: string, count: number): bigint[] {
  if (count === 0) return [];
  const range = connection
    .prepare(
      `SELECT MIN(order_key) AS minimum, MAX(order_key) AS maximum
         FROM scene_beats
        WHERE chapter_id = ? AND deleted_at IS NULL`,
    )
    .get(chapterId) as
    | { readonly minimum: number | bigint | null; readonly maximum: number | bigint | null }
    | undefined;
  const minimum =
    range?.minimum === null || range?.minimum === undefined ? 0n : integer(range.minimum);
  const maximum =
    range?.maximum === null || range?.maximum === undefined ? 0n : integer(range.maximum);
  const required = BigInt(count);
  if (minimum - required >= SQLITE_INTEGER_MIN) {
    return Array.from({ length: count }, (_, index) => minimum - BigInt(index + 1));
  }
  if (maximum + required <= SQLITE_INTEGER_MAX) {
    return Array.from({ length: count }, (_, index) => maximum + BigInt(index + 1));
  }
  throw new SceneBeatServiceError(
    'SCENE_BEAT_INVARIANT',
    'SceneBeat order keys cannot reserve a temporary rebalance range.',
  );
}

function applyRebalance(
  connection: DatabaseSync,
  chapterId: string,
  updates: ReadonlyArray<OrderedSibling>,
): void {
  if (updates.length === 0) return;
  const update = connection.prepare('UPDATE scene_beats SET order_key = ? WHERE id = ?');
  const temporary = temporaryOrderKeys(connection, chapterId, updates.length);
  for (const [index, item] of updates.entries()) {
    if (Number(update.run(temporary[index]!, item.id).changes) !== 1) {
      throw new SceneBeatServiceError(
        'SCENE_BEAT_INVARIANT',
        'A SceneBeat could not enter the temporary rebalance range.',
      );
    }
  }
  for (const item of updates) {
    if (Number(update.run(item.orderKey, item.id).changes) !== 1) {
      throw new SceneBeatServiceError(
        'SCENE_BEAT_INVARIANT',
        'A SceneBeat could not be rebalanced.',
      );
    }
  }
}

function assertUniqueTitle(
  connection: DatabaseSync,
  chapterId: string,
  title: string,
  excludedId?: string,
): void {
  const found = connection
    .prepare(
      `SELECT 1 FROM scene_beats
        WHERE chapter_id = ? AND deleted_at IS NULL AND title = ?
          AND (? IS NULL OR id <> ?)
        LIMIT 1`,
    )
    .get(chapterId, title, excludedId ?? null, excludedId ?? null);
  if (found) {
    throw new SceneBeatServiceError(
      'SCENE_BEAT_CONFLICT',
      'An active SceneBeat with the same title already exists in this chapter.',
    );
  }
}

function resolveBlocks(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
  logicalBlockIds: readonly string[],
): LinkedBlockRow[] {
  assertChapter(connection, projectId, chapterId);
  if (logicalBlockIds.length === 0) return [];
  const placeholders = logicalBlockIds.map(() => '?').join(', ');
  const rows = connection
    .prepare(
      `SELECT block.id AS draftBlockId, block.logical_block_id AS logicalBlockId,
              draft.id AS draftId, draft.chapter_id AS chapterId, block.text
         FROM draft_blocks block
         JOIN drafts draft ON draft.id = block.draft_id
         JOIN chapters chapter ON chapter.id = draft.chapter_id
         JOIN volumes volume ON volume.id = chapter.volume_id
        WHERE volume.project_id = ? AND chapter.id = ? AND draft.status = 'active'
          AND block.logical_block_id IN (${placeholders})
        ORDER BY block.order_key, block.id`,
    )
    .all(projectId, chapterId, ...logicalBlockIds) as unknown as LinkedBlockRow[];
  if (rows.length !== new Set(logicalBlockIds).size) {
    throw new SceneBeatServiceError(
      'SCENE_BEAT_NOT_FOUND',
      'One or more selected DraftBlocks were not found in the active chapter Draft.',
    );
  }
  return rows;
}

function replaceBlockLinks(
  connection: DatabaseSync,
  timestamp: string,
  row: BeatRow,
  logicalBlockIds: readonly string[],
): void {
  const blocks = resolveBlocks(connection, row.projectId, row.chapterId, logicalBlockIds);
  const ids = blocks.map((block) => block.draftBlockId);
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(', ');
    const conflict = connection
      .prepare(
        `SELECT link.draft_block_id AS draftBlockId, beat.title
           FROM scene_beat_block_links link
           JOIN scene_beats beat ON beat.id = link.scene_beat_id
          WHERE link.draft_block_id IN (${placeholders})
            AND link.scene_beat_id <> ? AND beat.deleted_at IS NULL
          LIMIT 1`,
      )
      .get(...ids, row.id) as { readonly draftBlockId: string; readonly title: string } | undefined;
    if (conflict) {
      throw new SceneBeatServiceError(
        'SCENE_BEAT_CONFLICT',
        `A selected DraftBlock is already linked to SceneBeat “${text(conflict.title)}”.`,
      );
    }
  }
  connection.prepare('DELETE FROM scene_beat_block_links WHERE scene_beat_id = ?').run(row.id);
  const insert = connection.prepare(
    `INSERT INTO scene_beat_block_links(scene_beat_id, draft_block_id, created_at)
     VALUES(?, ?, ?)`,
  );
  for (const block of blocks) insert.run(row.id, block.draftBlockId, timestamp);
}

function insertBeat(
  connection: DatabaseSync,
  id: string,
  timestamp: string,
  input: SceneBeatCreateInput | SceneBeatConvertBlocksInput,
): void {
  assertProject(connection, input.projectId);
  assertChapter(connection, input.projectId, input.chapterId);
  assertPlotNode(connection, input.projectId, input.plotNodeId);
  assertUniqueTitle(connection, input.chapterId, input.title);
  const plan = orderPlan(
    orderedSiblings(connection, input.chapterId),
    input.placement ?? { kind: 'end' },
  );
  applyRebalance(connection, input.chapterId, plan.rebalanced);
  connection
    .prepare(
      `INSERT INTO scene_beats(
         id, project_id, chapter_id, plot_node_id, title, goal, core_conflict,
         expected_result, beat_type, word_target_percent, is_required, order_key,
         character_ids_json, location_ids_json, deleted_at, updated_at
       ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    )
    .run(
      id,
      input.projectId,
      input.chapterId,
      input.plotNodeId,
      input.title,
      input.goal,
      input.coreConflict,
      input.expectedResult,
      input.beatType,
      input.wordTargetPercent,
      input.required ? 1 : 0,
      plan.orderKey,
      JSON.stringify(input.characterIds),
      JSON.stringify(input.locationIds),
      timestamp,
    );
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function crossChapterPreview(
  connection: DatabaseSync,
  input: SceneBeatCrossChapterMovePreviewInput,
): SceneBeatCrossChapterMovePreview {
  const row = beatRow(connection, input.projectId, input.sceneBeatId);
  assertChapter(connection, input.projectId, input.targetChapterId);
  const sameChapter = row.chapterId === input.targetChapterId;
  const titleConflict = Boolean(
    connection
      .prepare(
        `SELECT 1 FROM scene_beats
          WHERE chapter_id = ? AND deleted_at IS NULL AND title = ? AND id <> ? LIMIT 1`,
      )
      .get(input.targetChapterId, row.title, row.id),
  );
  const siblings = orderedSiblings(connection, input.targetChapterId, row.id);
  orderPlan(siblings, input.placement);
  const links = linkedBlocks(connection, row.id);
  const linkedCharacterCount = links.reduce((total, link) => total + text(link.text).length, 0);
  const warnings = [
    ...(sameChapter ? ['目标章节与当前章节相同；请使用章内排序。'] : []),
    ...(titleConflict ? ['目标章节已有同名SceneBeat。'] : []),
    ...(links.length > 0
      ? ['SceneBeat移动只改变规划章节；关联正文仍留在原Draft，需单独确认正文块跨章移动。']
      : []),
  ];
  const hashInput = {
    sceneBeat: {
      id: row.id,
      chapterId: row.chapterId,
      title: row.title,
      orderKey: integer(row.orderKey).toString(),
      updatedAt: row.updatedAt,
    },
    targetChapterId: input.targetChapterId,
    placement: input.placement,
    targetSiblings: siblings.map((item) => ({ id: item.id, orderKey: item.orderKey.toString() })),
    linkedBlocks: links.map((link) => ({
      draftBlockId: link.draftBlockId,
      logicalBlockId: link.logicalBlockId,
      draftId: link.draftId,
      chapterId: link.chapterId,
      textHash: stableHash(link.text),
    })),
  };
  return SceneBeatCrossChapterMovePreviewSchema.parse({
    planHash: stableHash(hashInput),
    sceneBeatId: row.id,
    sourceChapterId: row.chapterId,
    targetChapterId: input.targetChapterId,
    linkedLogicalBlockIds: links.map((link) => link.logicalBlockId),
    linkedBlockCount: links.length,
    linkedCharacterCount,
    warnings,
    canExecute: !sameChapter && !titleConflict,
  });
}

export class SceneBeatService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;
  readonly #faultInjector: SceneBeatServiceOptions['faultInjector'];

  constructor(workspace: ProjectWorkspaceService, options: SceneBeatServiceOptions = {}) {
    this.#workspace = workspace;
    this.#clock = options.clock ?? systemClock;
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#faultInjector = options.faultInjector;
  }

  list(raw: SceneBeatListInput): SceneBeatList {
    const input = SceneBeatListInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (connection) =>
      readList(connection, input),
    );
  }

  create(requestId: string, raw: SceneBeatCreateInput): Promise<SceneBeatList> {
    const input = SceneBeatCreateInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (connection) => {
      insertBeat(connection, this.#idFactory(), this.#clock.now().toISOString(), input);
      this.#faultInjector?.('after-beat-write');
      return readList(connection, input);
    });
  }

  update(requestId: string, raw: SceneBeatUpdateInput): Promise<SceneBeatList> {
    const input = SceneBeatUpdateInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (connection) => {
      const current = beatRow(connection, input.projectId, input.sceneBeatId);
      const title = input.patch.title ?? current.title;
      const plotNodeId =
        input.patch.plotNodeId === undefined ? current.plotNodeId : input.patch.plotNodeId;
      assertPlotNode(connection, input.projectId, plotNodeId);
      assertUniqueTitle(connection, current.chapterId, title, current.id);
      connection
        .prepare(
          `UPDATE scene_beats
              SET plot_node_id = ?, title = ?, goal = ?, core_conflict = ?,
                  expected_result = ?, beat_type = ?, word_target_percent = ?,
                  is_required = ?, character_ids_json = ?, location_ids_json = ?, updated_at = ?
            WHERE id = ? AND project_id = ? AND deleted_at IS NULL`,
        )
        .run(
          plotNodeId,
          title,
          input.patch.goal ?? current.goal,
          input.patch.coreConflict ?? current.coreConflict,
          input.patch.expectedResult ?? current.expectedResult,
          input.patch.beatType ?? current.beatType,
          input.patch.wordTargetPercent ?? safeNumber(current.wordTargetPercent),
          (input.patch.required ?? integer(current.isRequired) === 1n) ? 1 : 0,
          JSON.stringify(input.patch.characterIds ?? entityIds(current.characterIdsJson)),
          JSON.stringify(input.patch.locationIds ?? entityIds(current.locationIdsJson)),
          this.#clock.now().toISOString(),
          current.id,
          input.projectId,
        );
      this.#faultInjector?.('after-beat-write');
      return readList(connection, { projectId: input.projectId, chapterId: current.chapterId });
    });
  }

  move(requestId: string, raw: SceneBeatMoveInput): Promise<SceneBeatList> {
    const input = SceneBeatMoveInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (connection) => {
      const current = beatRow(connection, input.projectId, input.sceneBeatId);
      if (current.chapterId !== input.chapterId) {
        throw new SceneBeatServiceError(
          'SCENE_BEAT_INVALID_POSITION',
          'Cross-chapter SceneBeat movement requires an impact preview.',
        );
      }
      const plan = orderPlan(
        orderedSiblings(connection, input.chapterId, current.id),
        input.placement,
      );
      const [temporary] = temporaryOrderKeys(connection, input.chapterId, 1);
      connection
        .prepare('UPDATE scene_beats SET order_key = ? WHERE id = ?')
        .run(temporary!, current.id);
      applyRebalance(connection, input.chapterId, plan.rebalanced);
      connection
        .prepare('UPDATE scene_beats SET order_key = ?, updated_at = ? WHERE id = ?')
        .run(plan.orderKey, this.#clock.now().toISOString(), current.id);
      this.#faultInjector?.('after-beat-move');
      return readList(connection, { projectId: input.projectId, chapterId: input.chapterId });
    });
  }

  previewCrossChapterMove(
    raw: SceneBeatCrossChapterMovePreviewInput,
  ): SceneBeatCrossChapterMovePreview {
    const input = SceneBeatCrossChapterMovePreviewInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (connection) =>
      crossChapterPreview(connection, input),
    );
  }

  moveAcrossChapters(
    requestId: string,
    raw: SceneBeatCrossChapterMoveInput,
  ): Promise<SceneBeatList> {
    const input = SceneBeatCrossChapterMoveInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (connection) => {
      const preview = crossChapterPreview(connection, input);
      if (!preview.canExecute || preview.planHash !== input.planHash) {
        throw new SceneBeatServiceError(
          'SCENE_BEAT_CONFLICT',
          'The SceneBeat cross-chapter move changed after preview.',
        );
      }
      const current = beatRow(connection, input.projectId, input.sceneBeatId);
      const plan = orderPlan(
        orderedSiblings(connection, input.targetChapterId, current.id),
        input.placement,
      );
      const [temporary] = temporaryOrderKeys(connection, input.targetChapterId, 1);
      connection
        .prepare('UPDATE scene_beats SET chapter_id = ?, order_key = ? WHERE id = ?')
        .run(input.targetChapterId, temporary!, current.id);
      applyRebalance(connection, input.targetChapterId, plan.rebalanced);
      connection
        .prepare('UPDATE scene_beats SET order_key = ?, updated_at = ? WHERE id = ?')
        .run(plan.orderKey, this.#clock.now().toISOString(), current.id);
      this.#faultInjector?.('after-beat-move');
      return readList(connection, {
        projectId: input.projectId,
        chapterId: input.targetChapterId,
      });
    });
  }

  delete(requestId: string, raw: SceneBeatDeleteInput): Promise<SceneBeatList> {
    const input = SceneBeatDeleteInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (connection) => {
      const current = beatRow(connection, input.projectId, input.sceneBeatId);
      connection
        .prepare('DELETE FROM scene_beat_block_links WHERE scene_beat_id = ?')
        .run(current.id);
      connection
        .prepare('UPDATE scene_beats SET deleted_at = ?, updated_at = ? WHERE id = ?')
        .run(this.#clock.now().toISOString(), this.#clock.now().toISOString(), current.id);
      this.#faultInjector?.('after-beat-delete');
      return readList(connection, { projectId: input.projectId, chapterId: current.chapterId });
    });
  }

  restore(requestId: string, raw: SceneBeatRestoreInput): Promise<SceneBeatList> {
    const input = SceneBeatRestoreInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (connection) => {
      const current = beatRow(connection, input.projectId, input.sceneBeatId, true);
      if (current.deletedAt === null) {
        throw new SceneBeatServiceError('SCENE_BEAT_CONFLICT', 'The SceneBeat is already active.');
      }
      assertUniqueTitle(connection, current.chapterId, current.title, current.id);
      const plan = orderPlan(
        orderedSiblings(connection, current.chapterId, current.id),
        input.placement ?? { kind: 'end' },
      );
      applyRebalance(connection, current.chapterId, plan.rebalanced);
      connection
        .prepare(
          'UPDATE scene_beats SET deleted_at = NULL, order_key = ?, updated_at = ? WHERE id = ?',
        )
        .run(plan.orderKey, this.#clock.now().toISOString(), current.id);
      this.#faultInjector?.('after-beat-write');
      return readList(connection, { projectId: input.projectId, chapterId: current.chapterId });
    });
  }

  setBlockLinks(requestId: string, raw: SceneBeatSetBlockLinksInput): Promise<SceneBeatList> {
    const input = SceneBeatSetBlockLinksInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (connection) => {
      const current = beatRow(connection, input.projectId, input.sceneBeatId);
      replaceBlockLinks(
        connection,
        this.#clock.now().toISOString(),
        current,
        input.logicalBlockIds,
      );
      this.#faultInjector?.('after-link-replace');
      return readList(connection, { projectId: input.projectId, chapterId: current.chapterId });
    });
  }

  convertBlocks(requestId: string, raw: SceneBeatConvertBlocksInput): Promise<SceneBeatList> {
    const input = SceneBeatConvertBlocksInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (connection) => {
      const id = this.#idFactory();
      const timestamp = this.#clock.now().toISOString();
      insertBeat(connection, id, timestamp, input);
      const current = beatRow(connection, input.projectId, id);
      replaceBlockLinks(connection, timestamp, current, input.logicalBlockIds);
      this.#faultInjector?.('after-link-replace');
      return readList(connection, input);
    });
  }
}
