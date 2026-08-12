import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  IdeaCardSchema,
  IdeaConversionApplyInputSchema,
  IdeaConversionApplyResultSchema,
  IdeaConversionPreviewInputSchema,
  IdeaConversionPreviewSchema,
  IdeaConversionSchema,
  IdeaCreateInputSchema,
  IdeaDetailSchema,
  IdeaGetInputSchema,
  IdeaListInputSchema,
  IdeaListSchema,
  IdeaSetStatusInputSchema,
  type IdeaCard,
  type IdeaConversion,
  type IdeaConversionApplyInput,
  type IdeaConversionApplyResult,
  type IdeaConversionPreview,
  type IdeaConversionPreviewInput,
  type IdeaConversionTarget,
  type IdeaCreateInput,
  type IdeaDetail,
  type IdeaGetInput,
  type IdeaList,
  type IdeaListInput,
  type IdeaSetStatusInput,
  type IdeaSourceContext,
} from '@worldforge/contracts';

import { applyTimelineEvent } from './continuity-timeline.js';
import type { DatabaseClock } from './database/index.js';
import { applyCanonFact, applyEntityCreate } from './entity-canon.js';
import { applyForeshadowingSaveInTransaction } from './narrative-planning/foreshadowing-operations.js';
import {
  applyPlotNodeCreateInTransaction,
  applyProjectBriefUpdateInTransaction,
} from './project-planning.js';
import type { ProjectWorkspaceService } from './project-workspace.js';
import { stableJson } from './stable-json.js';

const systemClock: DatabaseClock = { now: () => new Date() };

export type IdeaCapsuleServiceErrorCode =
  | 'IDEA_NOT_FOUND'
  | 'IDEA_CONFLICT'
  | 'IDEA_INVALID'
  | 'IDEA_INVARIANT';

export class IdeaCapsuleServiceError extends Error {
  readonly code: IdeaCapsuleServiceErrorCode;

  constructor(code: IdeaCapsuleServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'IdeaCapsuleServiceError';
    this.code = code;
  }
}

export interface IdeaCapsuleServiceOptions {
  readonly clock?: DatabaseClock;
  readonly idFactory?: () => string;
}

interface IdeaRow {
  readonly id: string;
  readonly projectId: string;
  readonly ideaKind: string;
  readonly title: string;
  readonly summary: string;
  readonly content: string;
  readonly divergenceLevel: string;
  readonly depthLevel: string;
  readonly sourceContextJson: string;
  readonly generationRunId: string | null;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface ConversionRow {
  readonly id: string;
  readonly projectId: string;
  readonly ideaId: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly previewHash: string;
  readonly status: string;
  readonly createdAt: string;
}

const ideaSelect = `SELECT id, project_id AS projectId, idea_kind AS ideaKind,
                           title, summary, content,
                           divergence_level AS divergenceLevel,
                           depth_level AS depthLevel,
                           source_context_json AS sourceContextJson,
                           generation_run_id AS generationRunId,
                           status, created_at AS createdAt, updated_at AS updatedAt
                      FROM idea_cards`;

const conversionSelect = `SELECT id, project_id AS projectId, idea_id AS ideaId,
                                 target_type AS targetType, target_id AS targetId,
                                 preview_hash AS previewHash, status,
                                 created_at AS createdAt
                            FROM idea_conversions`;

function parseIdea(row: IdeaRow): IdeaCard {
  let sourceContext: unknown;
  try {
    sourceContext = JSON.parse(row.sourceContextJson) as unknown;
  } catch (error) {
    throw new IdeaCapsuleServiceError('IDEA_INVARIANT', 'Persisted Idea source context is invalid.', {
      cause: error,
    });
  }
  return IdeaCardSchema.parse({ ...row, sourceContext });
}

function ideaRow(connection: DatabaseSync, projectId: string, ideaId: string): IdeaRow {
  const row = connection
    .prepare(`${ideaSelect} WHERE id = ? AND project_id = ?`)
    .get(ideaId, projectId) as IdeaRow | undefined;
  if (!row) throw new IdeaCapsuleServiceError('IDEA_NOT_FOUND', 'The Idea was not found.');
  return row;
}

function assertCompatibilityChapter(
  connection: DatabaseSync,
  projectId: string,
  context: IdeaSourceContext,
): void {
  if (context.chapterId === null || context.scopeType === 'chapter') return;
  const chapter = connection
    .prepare(
      `SELECT 1
         FROM chapters chapter
         JOIN volumes volume ON volume.id = chapter.volume_id
        WHERE chapter.id = ? AND volume.project_id = ?
          AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL`,
    )
    .get(context.chapterId, projectId);
  if (!chapter) {
    throw new IdeaCapsuleServiceError(
      'IDEA_INVALID',
      'The Idea compatibility chapter is missing or outside the project.',
    );
  }
}

function assertSourceContext(
  connection: DatabaseSync,
  projectId: string,
  context: IdeaSourceContext,
): void {
  assertCompatibilityChapter(connection, projectId, context);
  let found: unknown;
  switch (context.scopeType) {
    case 'project':
      found =
        context.scopeId === projectId
          ? connection.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)
          : undefined;
      break;
    case 'volume':
      found = connection
        .prepare(
          `SELECT 1 FROM volumes
            WHERE id = ? AND project_id = ? AND deleted_at IS NULL`,
        )
        .get(context.scopeId, projectId);
      break;
    case 'chapter':
      found = connection
        .prepare(
          `SELECT 1
             FROM chapters chapter
             JOIN volumes volume ON volume.id = chapter.volume_id
            WHERE chapter.id = ? AND volume.project_id = ?
              AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL`,
        )
        .get(context.scopeId, projectId);
      if (context.chapterId !== context.scopeId) found = undefined;
      break;
    case 'scene':
      found = connection
        .prepare(
          `SELECT 1 FROM scene_beats
            WHERE id = ? AND project_id = ? AND deleted_at IS NULL`,
        )
        .get(context.scopeId, projectId);
      break;
    case 'entity':
      found = connection
        .prepare(
          `SELECT 1 FROM entities
            WHERE id = ? AND project_id = ? AND status = 'active'`,
        )
        .get(context.scopeId, projectId);
      break;
    case 'selection':
      found = connection
        .prepare(
          `SELECT 1
             FROM draft_blocks block
             JOIN drafts draft ON draft.id = block.draft_id
             JOIN chapters chapter ON chapter.id = draft.chapter_id
             JOIN volumes volume ON volume.id = chapter.volume_id
            WHERE block.logical_block_id = ? AND volume.project_id = ?
              AND chapter.active_draft_id = draft.id AND draft.status = 'active'
              AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL`,
        )
        .get(context.scopeId, projectId);
      break;
  }
  if (!found) {
    throw new IdeaCapsuleServiceError(
      'IDEA_INVALID',
      'The Idea source scope is missing, stale, or outside the project.',
    );
  }
}

function previewHash(idea: IdeaCard, target: IdeaConversionTarget): string {
  return createHash('sha256')
    .update(
      stableJson({
        projectId: idea.projectId,
        ideaId: idea.id,
        ideaUpdatedAt: idea.updatedAt,
        target,
      }),
      'utf8',
    )
    .digest('hex');
}

function previewSummary(target: IdeaConversionTarget): string {
  switch (target.targetType) {
    case 'project_brief':
      return '更新作品任务书';
    case 'plot_node':
      return `创建情节节点：${target.draft.title}`;
    case 'entity':
      return `创建${target.draft.entityType}实体：${target.draft.name}`;
    case 'canon_fact':
      return `写入设定事实：${target.draft.factKey}`;
    case 'timeline_event':
      return `创建时间线事件：${target.draft.title}`;
    case 'foreshadowing':
      return `创建伏笔：${target.draft.title}`;
  }
}

function targetStatus(
  connection: DatabaseSync,
  projectId: string,
  row: ConversionRow,
): 'applied' | 'target_missing' | 'target_stale' {
  switch (row.targetType) {
    case 'project_brief':
      return connection
        .prepare('SELECT 1 FROM project_briefs WHERE id = ? AND project_id = ?')
        .get(row.targetId, projectId)
        ? 'applied'
        : 'target_missing';
    case 'plot_node':
      return connection
        .prepare('SELECT 1 FROM plot_nodes WHERE id = ? AND project_id = ?')
        .get(row.targetId, projectId)
        ? 'applied'
        : 'target_missing';
    case 'entity': {
      const target = connection
        .prepare('SELECT status FROM entities WHERE id = ? AND project_id = ?')
        .get(row.targetId, projectId) as { readonly status: string } | undefined;
      if (!target) return 'target_missing';
      return target.status === 'active' ? 'applied' : 'target_stale';
    }
    case 'canon_fact': {
      const target = connection
        .prepare('SELECT status FROM canon_facts WHERE id = ? AND project_id = ?')
        .get(row.targetId, projectId) as { readonly status: string } | undefined;
      if (!target) return 'target_missing';
      return target.status === 'current' ? 'applied' : 'target_stale';
    }
    case 'timeline_event': {
      const target = connection
        .prepare('SELECT status FROM timeline_events WHERE id = ? AND project_id = ?')
        .get(row.targetId, projectId) as { readonly status: string } | undefined;
      if (!target) return 'target_missing';
      return target.status === 'active' ? 'applied' : 'target_stale';
    }
    case 'foreshadowing':
      return connection
        .prepare('SELECT 1 FROM foreshadowings WHERE id = ? AND project_id = ?')
        .get(row.targetId, projectId)
        ? 'applied'
        : 'target_missing';
    default:
      return 'target_missing';
  }
}

function parseConversion(connection: DatabaseSync, row: ConversionRow): IdeaConversion {
  return IdeaConversionSchema.parse({
    ...row,
    status: targetStatus(connection, row.projectId, row),
  });
}

function conversionFor(
  connection: DatabaseSync,
  projectId: string,
  ideaId: string,
): IdeaConversion | null {
  const row = connection
    .prepare(`${conversionSelect} WHERE project_id = ? AND idea_id = ?`)
    .get(projectId, ideaId) as ConversionRow | undefined;
  return row ? parseConversion(connection, row) : null;
}

function detail(connection: DatabaseSync, projectId: string, ideaId: string): IdeaDetail {
  return IdeaDetailSchema.parse({
    idea: parseIdea(ideaRow(connection, projectId, ideaId)),
    conversion: conversionFor(connection, projectId, ideaId),
  });
}

function applyTarget(
  connection: DatabaseSync,
  projectId: string,
  ideaId: string,
  target: IdeaConversionTarget,
  now: string,
  idFactory: () => string,
): string {
  switch (target.targetType) {
    case 'project_brief':
      return applyProjectBriefUpdateInTransaction(
        connection,
        { projectId, ...target.draft },
        now,
        idFactory,
      );
    case 'plot_node':
      return applyPlotNodeCreateInTransaction(connection, { projectId, ...target.draft }, idFactory);
    case 'entity':
      return applyEntityCreate(
        connection,
        { projectId, authority: 'author', ...target.draft },
        now,
        idFactory,
      );
    case 'canon_fact':
      return applyCanonFact(
        connection,
        {
          projectId,
          authority: 'author',
          ...target.draft,
          sourceType: 'author',
          sourceId: ideaId,
        },
        now,
        idFactory,
      );
    case 'timeline_event': {
      const eventId = idFactory();
      applyTimelineEvent(
        connection,
        { projectId, authority: 'author', eventId: null, ...target.draft },
        eventId,
        now,
      );
      return eventId;
    }
    case 'foreshadowing':
      return applyForeshadowingSaveInTransaction(
        connection,
        { projectId, authority: 'author', foreshadowingId: null, ...target.draft },
        now,
        idFactory,
      );
  }
}

export class IdeaCapsuleService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;

  constructor(workspace: ProjectWorkspaceService, options: IdeaCapsuleServiceOptions = {}) {
    this.#workspace = workspace;
    this.#clock = options.clock ?? systemClock;
    this.#idFactory = options.idFactory ?? randomUUID;
  }

  list(raw: IdeaListInput): IdeaList {
    const input = IdeaListInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (connection) => {
      const cursorAt = input.cursor?.updatedAt ?? null;
      const cursorId = input.cursor?.id ?? null;
      const rows = connection
        .prepare(
          `${ideaSelect}
            WHERE project_id = ?
              AND (? IS NULL OR status = ?)
              AND (
                ? IS NULL
                OR updated_at < ?
                OR (updated_at = ? AND id < ?)
              )
            ORDER BY updated_at DESC, id DESC
            LIMIT ?`,
        )
        .all(
          input.projectId,
          input.status,
          input.status,
          cursorAt,
          cursorAt,
          cursorAt,
          cursorId,
          input.limit + 1,
        ) as unknown as IdeaRow[];
      const page = rows.slice(0, input.limit);
      const last = page.at(-1);
      return IdeaListSchema.parse({
        projectId: input.projectId,
        ideas: page.map(parseIdea),
        nextCursor:
          rows.length > input.limit && last ? { updatedAt: last.updatedAt, id: last.id } : null,
      });
    });
  }

  get(raw: IdeaGetInput): IdeaDetail {
    const input = IdeaGetInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (connection) =>
      detail(connection, input.projectId, input.ideaId),
    );
  }

  create(requestId: string, raw: IdeaCreateInput): Promise<IdeaCard> {
    const input = IdeaCreateInputSchema.parse(raw);
    return this.#workspace.writeProject(
      requestId,
      input.projectId,
      (connection) => {
        assertSourceContext(connection, input.projectId, input.sourceContext);
        const id = this.#idFactory();
        const now = this.#clock.now().toISOString();
        connection
          .prepare(
            `INSERT INTO idea_cards(
               id, project_id, idea_kind, title, summary, content,
               divergence_level, depth_level, source_context_json,
               generation_run_id, status, created_at, updated_at
             ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'active', ?, ?)`,
          )
          .run(
            id,
            input.projectId,
            input.ideaKind,
            input.title,
            input.summary,
            input.content,
            input.divergenceLevel,
            input.depthLevel,
            JSON.stringify(input.sourceContext),
            now,
            now,
          );
        return parseIdea(ideaRow(connection, input.projectId, id));
      },
      { operation: 'idea.create', input },
    );
  }

  setStatus(requestId: string, raw: IdeaSetStatusInput): Promise<IdeaCard> {
    const input = IdeaSetStatusInputSchema.parse(raw);
    return this.#workspace.writeProject(
      requestId,
      input.projectId,
      (connection) => {
        const current = parseIdea(ideaRow(connection, input.projectId, input.ideaId));
        if (current.status === 'converted') {
          throw new IdeaCapsuleServiceError('IDEA_CONFLICT', 'Converted Ideas are immutable.');
        }
        if (current.status === 'discarded') {
          throw new IdeaCapsuleServiceError('IDEA_CONFLICT', 'Discarded Ideas are terminal.');
        }
        connection
          .prepare('UPDATE idea_cards SET status = ?, updated_at = ? WHERE id = ? AND project_id = ?')
          .run(input.status, this.#clock.now().toISOString(), input.ideaId, input.projectId);
        return parseIdea(ideaRow(connection, input.projectId, input.ideaId));
      },
      { operation: 'idea.setStatus', input },
    );
  }

  previewConversion(raw: IdeaConversionPreviewInput): IdeaConversionPreview {
    const input = IdeaConversionPreviewInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (connection) => {
      const idea = parseIdea(ideaRow(connection, input.projectId, input.ideaId));
      if (idea.status === 'converted' || idea.status === 'discarded') {
        throw new IdeaCapsuleServiceError(
          'IDEA_CONFLICT',
          'Only active or favorite Ideas can be converted.',
        );
      }
      if (conversionFor(connection, input.projectId, input.ideaId)) {
        throw new IdeaCapsuleServiceError('IDEA_CONFLICT', 'The Idea is already converted.');
      }
      return IdeaConversionPreviewSchema.parse({
        projectId: input.projectId,
        ideaId: input.ideaId,
        ideaUpdatedAt: idea.updatedAt,
        target: input.target,
        previewHash: previewHash(idea, input.target),
        summary: previewSummary(input.target),
      });
    });
  }

  applyConversion(
    requestId: string,
    raw: IdeaConversionApplyInput,
  ): Promise<IdeaConversionApplyResult> {
    const input = IdeaConversionApplyInputSchema.parse(raw);
    return this.#workspace.writeProject(
      requestId,
      input.projectId,
      (connection) => {
        const idea = parseIdea(ideaRow(connection, input.projectId, input.ideaId));
        if (idea.status === 'converted' || idea.status === 'discarded') {
          throw new IdeaCapsuleServiceError(
            'IDEA_CONFLICT',
            'Only active or favorite Ideas can be converted.',
          );
        }
        if (conversionFor(connection, input.projectId, input.ideaId)) {
          throw new IdeaCapsuleServiceError('IDEA_CONFLICT', 'The Idea is already converted.');
        }
        const expectedHash = previewHash(idea, input.target);
        if (expectedHash !== input.previewHash) {
          throw new IdeaCapsuleServiceError(
            'IDEA_CONFLICT',
            'The Idea conversion preview is stale; preview it again before applying.',
          );
        }
        const now = this.#clock.now().toISOString();
        const targetId = applyTarget(
          connection,
          input.projectId,
          input.ideaId,
          input.target,
          now,
          this.#idFactory,
        );
        const conversionId = this.#idFactory();
        connection
          .prepare(
            `INSERT INTO idea_conversions(
               id, project_id, idea_id, target_type, target_id,
               preview_hash, status, created_at
             ) VALUES(?, ?, ?, ?, ?, ?, 'applied', ?)`,
          )
          .run(
            conversionId,
            input.projectId,
            input.ideaId,
            input.target.targetType,
            targetId,
            input.previewHash,
            now,
          );
        connection
          .prepare(
            `UPDATE idea_cards
                SET status = 'converted', updated_at = ?
              WHERE id = ? AND project_id = ?`,
          )
          .run(now, input.ideaId, input.projectId);
        const result = detail(connection, input.projectId, input.ideaId);
        if (!result.conversion) {
          throw new IdeaCapsuleServiceError(
            'IDEA_INVARIANT',
            'The Idea conversion audit record was not persisted.',
          );
        }
        return IdeaConversionApplyResultSchema.parse({
          idea: result.idea,
          conversion: result.conversion,
        });
      },
      { operation: 'idea.applyConversion', input },
    );
  }
}
