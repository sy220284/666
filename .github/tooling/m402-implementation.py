from pathlib import Path

EXPECTED_HEAD = "665f2022eb87f85c6f95ac12680b210e88bad54f"
TARGET_BRANCH = "work/m4-02-constraint-package"

contracts = r'''import { z } from 'zod';

import { SnapshotSourceSchema } from './state-proposal.js';
import { ProjectIdSchema } from './task-protocol.js';

export const ConstraintTaskTypeSchema = z.enum([
  'skeleton',
  'chapter',
  'rewrite',
  'merge',
  'validate',
  'state_extract',
]);
export const ConstraintPrioritySchema = z.enum(['P0', 'P1', 'P2', 'P3', 'P4']);
export const ConstraintSourceTypeSchema = z.enum([
  'project_brief',
  'chapter',
  'scene_beat',
  'ending_snapshot',
  'entity_state',
  'knowledge_state',
  'foreshadowing',
  'canon_fact',
  'character_arc',
  'current_draft',
  'supplemental_search',
]);
export const ConstraintTemporalStatusSchema = z.enum([
  'current',
  'historical',
  'upcoming',
  'snapshot',
]);
export const ConstraintHashSchema = z.string().regex(/^[0-9a-f]{64}$/u);

export const ConstraintSourceSchema = z.strictObject({
  id: z.string().min(1).max(1_000),
  priority: ConstraintPrioritySchema,
  sourceType: ConstraintSourceTypeSchema,
  sourceId: z.string().min(1).max(500),
  sourceVersionId: z.uuid().nullable(),
  chapterId: z.uuid().nullable(),
  entityId: z.uuid().nullable(),
  semanticKey: z.string().min(1).max(500),
  label: z.string().min(1).max(500),
  content: z.string().min(1).max(200_000),
  relevance: z.number().finite().min(0).max(1),
  required: z.boolean(),
  temporalStatus: ConstraintTemporalStatusSchema,
  estimatedTokens: z.number().int().positive(),
  contentHash: ConstraintHashSchema,
});

export const ConstraintConflictSchema = z.strictObject({
  semanticKey: z.string().min(1).max(500),
  sourceIds: z.array(z.string().min(1).max(1_000)).min(2),
  contentHashes: z.array(ConstraintHashSchema).min(2),
});

export const ConstraintTrimEntrySchema = z.strictObject({
  sourceId: z.string().min(1).max(1_000),
  priority: ConstraintPrioritySchema,
  estimatedTokens: z.number().int().positive(),
  reason: z.literal('token_budget'),
});

export const ConstraintPackageBuildInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: z.uuid(),
  taskType: ConstraintTaskTypeSchema,
  query: z.string().trim().min(1).max(500).optional(),
  maxInputTokens: z.number().int().min(512).max(262_144).default(32_768),
  safetyMarginTokens: z.number().int().min(0).max(65_536).default(2_048),
  maxSupplementalResults: z.number().int().min(0).max(50).default(12),
});

export const ConstraintSectionsSchema = z.strictObject({
  P0: z.array(ConstraintSourceSchema),
  P1: z.array(ConstraintSourceSchema),
  P2: z.array(ConstraintSourceSchema),
  P3: z.array(ConstraintSourceSchema),
  P4: z.array(ConstraintSourceSchema),
});

export const ConstraintPackageSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: z.uuid(),
  taskType: ConstraintTaskTypeSchema,
  snapshotSource: SnapshotSourceSchema,
  sections: ConstraintSectionsSchema,
  sourceVersionIds: z.array(z.uuid()),
  estimatedTokens: z.number().int().nonnegative(),
  budget: z.strictObject({
    maxInputTokens: z.number().int().positive(),
    safetyMarginTokens: z.number().int().nonnegative(),
    usableTokens: z.number().int().positive(),
  }),
  contentHash: ConstraintHashSchema,
  constraintHash: ConstraintHashSchema,
  trimLog: z.array(ConstraintTrimEntrySchema),
  conflicts: z.array(ConstraintConflictSchema),
});

export type ConstraintTaskType = z.infer<typeof ConstraintTaskTypeSchema>;
export type ConstraintPriority = z.infer<typeof ConstraintPrioritySchema>;
export type ConstraintSourceType = z.infer<typeof ConstraintSourceTypeSchema>;
export type ConstraintTemporalStatus = z.infer<typeof ConstraintTemporalStatusSchema>;
export type ConstraintSource = z.infer<typeof ConstraintSourceSchema>;
export type ConstraintConflict = z.infer<typeof ConstraintConflictSchema>;
export type ConstraintTrimEntry = z.infer<typeof ConstraintTrimEntrySchema>;
export type ConstraintPackageBuildInput = z.input<typeof ConstraintPackageBuildInputSchema>;
export type ConstraintPackage = z.infer<typeof ConstraintPackageSchema>;
'''

domain = r'''export type ConstraintPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

export interface TrimmableConstraint {
  readonly id: string;
  readonly priority: ConstraintPriority;
  readonly required: boolean;
  readonly relevance: number;
  readonly estimatedTokens: number;
}

export interface ConstraintTrimRecord {
  readonly sourceId: string;
  readonly priority: ConstraintPriority;
  readonly estimatedTokens: number;
  readonly reason: 'token_budget';
}

export class ConstraintBudgetError extends Error {
  readonly mandatoryTokens: number;
  readonly usableTokens: number;

  constructor(mandatoryTokens: number, usableTokens: number) {
    super(
      `Mandatory P0/P1 constraints require ${mandatoryTokens} tokens but only ${usableTokens} are usable.`,
    );
    this.name = 'ConstraintBudgetError';
    this.mandatoryTokens = mandatoryTokens;
    this.usableTokens = usableTokens;
  }
}

const priorityOrder: Readonly<Record<ConstraintPriority, number>> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
};

const trimOrder: Readonly<Record<ConstraintPriority, number>> = {
  P4: 0,
  P3: 1,
  P2: 2,
  P1: 3,
  P0: 4,
};

function normalizeStableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeStableValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right, 'en'))
        .map(([key, entry]) => [key, normalizeStableValue(entry)]),
    );
  }
  return value;
}

export function stableSerialize(value: unknown): string {
  return JSON.stringify(normalizeStableValue(value));
}

export function estimateConstraintTokens(value: string): number {
  let cjk = 0;
  let other = 0;
  for (const character of value) {
    if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(character)) {
      cjk += 1;
    } else if (!/\s/u.test(character)) {
      other += 1;
    }
  }
  return Math.max(1, cjk + Math.ceil(other / 4) + 8);
}

export function sortConstraints<T extends TrimmableConstraint>(items: readonly T[]): T[] {
  return [...items].sort(
    (left, right) =>
      priorityOrder[left.priority] - priorityOrder[right.priority] ||
      Number(right.required) - Number(left.required) ||
      right.relevance - left.relevance ||
      left.id.localeCompare(right.id, 'en'),
  );
}

export function trimConstraints<T extends TrimmableConstraint>(
  input: readonly T[],
  usableTokens: number,
): { readonly kept: T[]; readonly trimLog: ConstraintTrimRecord[]; readonly estimatedTokens: number } {
  if (!Number.isInteger(usableTokens) || usableTokens <= 0) {
    throw new RangeError('usableTokens must be a positive integer.');
  }
  const ordered = sortConstraints(input);
  const mandatoryTokens = ordered
    .filter((item) => item.priority === 'P0' || item.priority === 'P1' || item.required)
    .reduce((total, item) => total + item.estimatedTokens, 0);
  if (mandatoryTokens > usableTokens) throw new ConstraintBudgetError(mandatoryTokens, usableTokens);

  let total = ordered.reduce((sum, item) => sum + item.estimatedTokens, 0);
  const removed = new Set<string>();
  const trimLog: ConstraintTrimRecord[] = [];
  const candidates = ordered
    .filter((item) => !item.required && item.priority !== 'P0' && item.priority !== 'P1')
    .sort(
      (left, right) =>
        trimOrder[left.priority] - trimOrder[right.priority] ||
        left.relevance - right.relevance ||
        right.estimatedTokens - left.estimatedTokens ||
        left.id.localeCompare(right.id, 'en'),
    );

  for (const item of candidates) {
    if (total <= usableTokens) break;
    removed.add(item.id);
    total -= item.estimatedTokens;
    trimLog.push({
      sourceId: item.id,
      priority: item.priority,
      estimatedTokens: item.estimatedTokens,
      reason: 'token_budget',
    });
  }
  return {
    kept: ordered.filter((item) => !removed.has(item.id)),
    trimLog,
    estimatedTokens: total,
  };
}
'''

core = r'''import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  ConstraintPackageBuildInputSchema,
  ConstraintPackageSchema,
  ConstraintSourceSchema,
  type ConstraintConflict,
  type ConstraintPackage,
  type ConstraintPackageBuildInput,
  type ConstraintPriority,
  type ConstraintSource,
  type ConstraintSourceType,
  type ConstraintTemporalStatus,
  type EndingSnapshotContent,
  type SearchResultItem,
} from '@worldforge/contracts';
import {
  ConstraintBudgetError,
  estimateConstraintTokens,
  stableSerialize,
  trimConstraints,
} from '@worldforge/domain';

import type { ProjectWorkspaceService } from './project-workspace.js';
import { SearchIndexService } from './search-index.js';
import { StateProposalService } from './state-proposal.js';

export type ConstraintPackageServiceErrorCode =
  | 'CONSTRAINT_PACKAGE_NOT_FOUND'
  | 'CONSTRAINT_PACKAGE_BUDGET_EXCEEDED'
  | 'CONSTRAINT_PACKAGE_INVARIANT';

export class ConstraintPackageServiceError extends Error {
  readonly code: ConstraintPackageServiceErrorCode;

  constructor(code: ConstraintPackageServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ConstraintPackageServiceError';
    this.code = code;
  }
}

export interface ConstraintPackageServiceOptions {
  readonly searchIndex?: SearchIndexService;
  readonly stateProposal?: StateProposalService;
}

interface SourceInput {
  readonly priority: ConstraintPriority;
  readonly sourceType: ConstraintSourceType;
  readonly sourceId: string;
  readonly sourceVersionId?: string | null;
  readonly chapterId?: string | null;
  readonly entityId?: string | null;
  readonly semanticKey: string;
  readonly label: string;
  readonly content: unknown;
  readonly relevance: number;
  readonly required?: boolean;
  readonly temporalStatus?: ConstraintTemporalStatus;
}

interface ChapterRow extends Record<string, unknown> {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly targetWordMin: number | null;
  readonly targetWordMax: number | null;
  readonly previousChapterId: string | null;
}

interface BaseContext {
  readonly project: Record<string, unknown>;
  readonly chapter: ChapterRow;
  readonly brief: Record<string, unknown> | null;
  readonly beats: readonly Record<string, unknown>[];
  readonly linkedEntities: readonly Record<string, unknown>[];
  readonly canonFacts: readonly Record<string, unknown>[];
  readonly foreshadowings: readonly Record<string, unknown>[];
  readonly arcs: readonly Record<string, unknown>[];
  readonly draftBlocks: readonly Record<string, unknown>[];
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new ConstraintPackageServiceError(
      'CONSTRAINT_PACKAGE_INVARIANT',
      `Persisted field ${field} is not text.`,
    );
  }
  return value;
}

function nullableText(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  return text(value, field);
}

function numberOrNull(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' && typeof value !== 'bigint') {
    throw new ConstraintPackageServiceError(
      'CONSTRAINT_PACKAGE_INVARIANT',
      `Persisted field ${field} is not numeric.`,
    );
  }
  return Number(value);
}

function parseJson(value: unknown, field: string): unknown {
  try {
    return JSON.parse(text(value, field)) as unknown;
  } catch (error) {
    throw new ConstraintPackageServiceError(
      'CONSTRAINT_PACKAGE_INVARIANT',
      `Persisted field ${field} is not valid JSON.`,
      { cause: error },
    );
  }
}

function parseStringArray(value: unknown, field: string): string[] {
  const parsed = parseJson(value, field);
  if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === 'string')) {
    throw new ConstraintPackageServiceError(
      'CONSTRAINT_PACKAGE_INVARIANT',
      `Persisted field ${field} is not a string array.`,
    );
  }
  return parsed;
}

function normalizedContent(value: unknown): string {
  const serialized = typeof value === 'string' ? value.trim() : stableSerialize(value);
  if (!serialized) {
    throw new ConstraintPackageServiceError(
      'CONSTRAINT_PACKAGE_INVARIANT',
      'Constraint source content cannot be empty.',
    );
  }
  return serialized;
}

function makeSource(input: SourceInput): ConstraintSource {
  const content = normalizedContent(input.content);
  const id = `${input.sourceType}:${input.sourceId}:${input.semanticKey}`;
  return ConstraintSourceSchema.parse({
    id,
    priority: input.priority,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceVersionId: input.sourceVersionId ?? null,
    chapterId: input.chapterId ?? null,
    entityId: input.entityId ?? null,
    semanticKey: input.semanticKey,
    label: input.label,
    content,
    relevance: input.relevance,
    required: input.required ?? input.priority === 'P0' || input.priority === 'P1',
    temporalStatus: input.temporalStatus ?? 'current',
    estimatedTokens: estimateConstraintTokens(`${input.label}\n${content}`),
    contentHash: sha256(content),
  });
}

function deduplicateSources(sources: readonly ConstraintSource[]): ConstraintSource[] {
  const byId = new Map<string, ConstraintSource>();
  for (const source of sources) {
    const existing = byId.get(source.id);
    if (!existing || source.relevance > existing.relevance) byId.set(source.id, source);
  }
  return [...byId.values()];
}

function conflictsFor(sources: readonly ConstraintSource[]): ConstraintConflict[] {
  const groups = new Map<string, ConstraintSource[]>();
  for (const source of sources) {
    const group = groups.get(source.semanticKey) ?? [];
    group.push(source);
    groups.set(source.semanticKey, group);
  }
  return [...groups]
    .flatMap(([semanticKey, group]) => {
      const hashes = [...new Set(group.map((source) => source.contentHash))].sort();
      if (hashes.length < 2) return [];
      return [
        {
          semanticKey,
          sourceIds: group.map((source) => source.id).sort(),
          contentHashes: hashes,
        },
      ];
    })
    .sort((left, right) => left.semanticKey.localeCompare(right.semanticKey, 'en'));
}

function loadBaseContext(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
): BaseContext {
  const project = connection
    .prepare('SELECT id, name, channel FROM projects WHERE id = ?')
    .get(projectId) as Record<string, unknown> | undefined;
  if (!project) {
    throw new ConstraintPackageServiceError('CONSTRAINT_PACKAGE_NOT_FOUND', 'Project not found.');
  }
  const chapters = connection
    .prepare(
      `SELECT chapter.id, chapter.title, chapter.status,
              chapter.target_word_min AS targetWordMin,
              chapter.target_word_max AS targetWordMax,
              LAG(chapter.id) OVER (
                ORDER BY volume.order_key, chapter.order_key, chapter.id
              ) AS previousChapterId
         FROM chapters chapter
         JOIN volumes volume ON volume.id = chapter.volume_id
        WHERE volume.project_id = ? AND volume.deleted_at IS NULL
          AND chapter.deleted_at IS NULL
        ORDER BY volume.order_key, chapter.order_key, chapter.id`,
    )
    .all(projectId) as unknown as Record<string, unknown>[];
  const rawChapter = chapters.find((row) => row.id === chapterId);
  if (!rawChapter) {
    throw new ConstraintPackageServiceError(
      'CONSTRAINT_PACKAGE_NOT_FOUND',
      'Chapter not found in the project.',
    );
  }
  const chapter: ChapterRow = {
    id: text(rawChapter.id, 'chapter.id'),
    title: text(rawChapter.title, 'chapter.title'),
    status: text(rawChapter.status, 'chapter.status'),
    targetWordMin: numberOrNull(rawChapter.targetWordMin, 'chapter.targetWordMin'),
    targetWordMax: numberOrNull(rawChapter.targetWordMax, 'chapter.targetWordMax'),
    previousChapterId: nullableText(rawChapter.previousChapterId, 'chapter.previousChapterId'),
  };
  const brief = connection
    .prepare(
      `SELECT concept, reading_promise AS readingPromise,
              protagonist_goal AS protagonistGoal, core_conflict AS coreConflict,
              ending_intent AS endingIntent, required_json AS requiredJson,
              forbidden_json AS forbiddenJson
         FROM project_briefs WHERE project_id = ?`,
    )
    .get(projectId) as Record<string, unknown> | undefined;
  const beats = connection
    .prepare(
      `SELECT id, title, goal, core_conflict AS coreConflict,
              expected_result AS expectedResult, beat_type AS beatType,
              word_target_percent AS wordTargetPercent, is_required AS isRequired,
              order_key AS orderKey
         FROM scene_beats
        WHERE project_id = ? AND chapter_id = ? AND deleted_at IS NULL
        ORDER BY order_key, id`,
    )
    .all(projectId, chapterId) as unknown as Record<string, unknown>[];
  const linkedEntities = connection
    .prepare(
      `SELECT DISTINCT entity.id, entity.entity_type AS entityType, entity.name,
              entity.aliases_json AS aliasesJson, entity.summary
         FROM scene_beat_entities link
         JOIN scene_beats beat ON beat.id = link.scene_beat_id
         JOIN entities entity ON entity.id = link.entity_id AND entity.project_id = link.project_id
        WHERE link.project_id = ? AND beat.chapter_id = ? AND beat.deleted_at IS NULL
          AND entity.status = 'active'
        ORDER BY entity.entity_type, lower(entity.name), entity.id`,
    )
    .all(projectId, chapterId) as unknown as Record<string, unknown>[];
  const entityIds = linkedEntities.map((row) => text(row.id, 'entity.id'));
  const canonFacts =
    entityIds.length === 0
      ? []
      : (connection
          .prepare(
            `SELECT id, entity_id AS entityId, fact_key AS factKey,
                    value_json AS valueJson, description, confirmed_at AS confirmedAt
               FROM canon_facts
              WHERE project_id = ? AND status = 'current'
                AND entity_id IN (${entityIds.map(() => '?').join(',')})
              ORDER BY entity_id, fact_key, id`,
          )
          .all(projectId, ...entityIds) as unknown as Record<string, unknown>[]);
  const foreshadowings = connection
    .prepare(
      `SELECT DISTINCT item.id, item.title, item.description, item.status,
              item.reveal_from_chapter_id AS revealFromChapterId,
              item.reveal_by_chapter_id AS revealByChapterId
         FROM foreshadowings item
         LEFT JOIN foreshadowing_chapters link
           ON link.foreshadowing_id = item.id AND link.project_id = item.project_id
        WHERE item.project_id = ? AND item.status <> 'cancelled'
          AND (link.chapter_id = ? OR item.reveal_from_chapter_id = ? OR item.reveal_by_chapter_id = ?)
        ORDER BY item.updated_at DESC, item.id`,
    )
    .all(projectId, chapterId, chapterId, chapterId) as unknown as Record<string, unknown>[];
  const arcs =
    entityIds.length === 0
      ? []
      : (connection
          .prepare(
            `SELECT arc.id, arc.character_id AS characterId, arc.title,
                    arc.arc_type AS arcType, arc.status, arc.author_intent AS authorIntent,
                    COALESCE(json_group_array(json_object(
                      'id', milestone.id,
                      'title', milestone.title,
                      'description', milestone.description,
                      'status', milestone.status,
                      'sortIndex', milestone.sort_index,
                      'plannedChapterId', milestone.planned_chapter_id,
                      'actualChapterId', milestone.actual_chapter_id
                    )) FILTER (WHERE milestone.id IS NOT NULL), '[]') AS milestonesJson
               FROM character_arcs arc
               LEFT JOIN arc_milestones milestone
                 ON milestone.arc_id = arc.id AND milestone.project_id = arc.project_id
              WHERE arc.project_id = ? AND arc.status IN ('planned', 'active')
                AND arc.character_id IN (${entityIds.map(() => '?').join(',')})
              GROUP BY arc.id
              ORDER BY arc.updated_at DESC, arc.id`,
          )
          .all(projectId, ...entityIds) as unknown as Record<string, unknown>[]);
  const draftBlocks = connection
    .prepare(
      `SELECT block.logical_block_id AS logicalBlockId, block.order_key AS orderKey,
              block.block_type AS blockType, block.text
         FROM chapters chapter
         JOIN drafts draft ON draft.id = chapter.active_draft_id AND draft.status = 'active'
         JOIN draft_blocks block ON block.draft_id = draft.id
         JOIN volumes volume ON volume.id = chapter.volume_id
        WHERE chapter.id = ? AND volume.project_id = ?
          AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL
        ORDER BY block.order_key, block.id`,
    )
    .all(chapterId, projectId) as unknown as Record<string, unknown>[];
  return {
    project,
    chapter,
    brief: brief ?? null,
    beats,
    linkedEntities,
    canonFacts,
    foreshadowings,
    arcs,
    draftBlocks,
  };
}

function addSnapshotSources(
  target: ConstraintSource[],
  content: EndingSnapshotContent,
  chapterId: string,
  sourceVersionId: string | null,
): void {
  for (const state of content.entityStates) {
    target.push(
      makeSource({
        priority: 'P2',
        sourceType: 'entity_state',
        sourceId: `${chapterId}:${state.entityId}:${state.stateKey}`,
        sourceVersionId: state.sourceVersionId,
        chapterId,
        entityId: state.entityId,
        semanticKey: `entity:${state.entityId}:${state.stateKey}`,
        label: `实体状态 ${state.stateKey}`,
        content: { stateKey: state.stateKey, value: state.value },
        relevance: 0.95,
        temporalStatus: 'snapshot',
      }),
    );
  }
  for (const knowledge of content.knowledgeStates) {
    target.push(
      makeSource({
        priority: 'P2',
        sourceType: 'knowledge_state',
        sourceId: `${chapterId}:${knowledge.characterId}:${knowledge.informationKey}`,
        sourceVersionId,
        chapterId,
        entityId: knowledge.characterId,
        semanticKey: `knowledge:${knowledge.characterId}:${knowledge.informationKey}`,
        label: `人物知情 ${knowledge.informationKey}`,
        content: knowledge,
        relevance: 0.94,
        temporalStatus: 'snapshot',
      }),
    );
  }
  for (const item of content.foreshadowings) {
    target.push(
      makeSource({
        priority: 'P2',
        sourceType: 'foreshadowing',
        sourceId: `${chapterId}:${item.id}`,
        sourceVersionId,
        chapterId,
        semanticKey: `foreshadowing:${item.id}:status`,
        label: '伏笔状态',
        content: item,
        relevance: 0.9,
        temporalStatus: 'snapshot',
      }),
    );
  }
  for (const milestone of content.arcMilestones) {
    target.push(
      makeSource({
        priority: 'P2',
        sourceType: 'character_arc',
        sourceId: `${chapterId}:${milestone.id}`,
        sourceVersionId,
        chapterId,
        semanticKey: `arc-milestone:${milestone.id}:status`,
        label: '人物弧光里程碑状态',
        content: milestone,
        relevance: 0.9,
        temporalStatus: 'snapshot',
      }),
    );
  }
}

function supplementalSource(item: SearchResultItem, relevance: number): ConstraintSource {
  return makeSource({
    priority: 'P4',
    sourceType: 'supplemental_search',
    sourceId: `${item.sourceType}:${item.targetId}:${item.anchorId ?? 'root'}`,
    sourceVersionId: item.sourceType === 'version' ? item.targetId : null,
    chapterId: item.chapterId,
    semanticKey: `supplemental:${item.sourceType}:${item.targetId}:${item.anchorId ?? 'root'}`,
    label: item.title || `${item.sourceType}补充召回`,
    content: item.excerpt,
    relevance,
    temporalStatus: 'current',
  });
}

export class ConstraintPackageService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #searchIndex: SearchIndexService;
  readonly #stateProposal: StateProposalService;

  constructor(workspace: ProjectWorkspaceService, options: ConstraintPackageServiceOptions = {}) {
    this.#workspace = workspace;
    this.#searchIndex = options.searchIndex ?? new SearchIndexService(workspace);
    this.#stateProposal = options.stateProposal ?? new StateProposalService(workspace);
  }

  build(raw: ConstraintPackageBuildInput): ConstraintPackage {
    const input = ConstraintPackageBuildInputSchema.parse(raw);
    if (input.safetyMarginTokens >= input.maxInputTokens) {
      throw new ConstraintPackageServiceError(
        'CONSTRAINT_PACKAGE_BUDGET_EXCEEDED',
        'The token safety margin must be smaller than the maximum input budget.',
      );
    }
    const context = this.#workspace.readProject(input.projectId, (connection) =>
      loadBaseContext(connection, input.projectId, input.chapterId),
    );
    const snapshotChapterId = context.chapter.previousChapterId ?? input.chapterId;
    const snapshotResult = this.#stateProposal.readSnapshot({
      projectId: input.projectId,
      chapterId: snapshotChapterId,
    });
    const sources: ConstraintSource[] = [];
    const add = (source: SourceInput) => sources.push(makeSource(source));

    if (context.brief) {
      const required = parseStringArray(context.brief.requiredJson, 'brief.requiredJson');
      const forbidden = parseStringArray(context.brief.forbiddenJson, 'brief.forbiddenJson');
      required.forEach((value, index) =>
        add({
          priority: 'P0',
          sourceType: 'project_brief',
          sourceId: `required:${index}`,
          semanticKey: `brief:required:${index}`,
          label: '作品必守规则',
          content: value,
          relevance: 1,
        }),
      );
      forbidden.forEach((value, index) =>
        add({
          priority: 'P0',
          sourceType: 'project_brief',
          sourceId: `forbidden:${index}`,
          semanticKey: `brief:forbidden:${index}`,
          label: '作品禁止事项',
          content: value,
          relevance: 1,
        }),
      );
      for (const [field, label] of [
        ['protagonistGoal', '主角目标'],
        ['coreConflict', '核心冲突'],
      ] as const) {
        const value = text(context.brief[field], `brief.${field}`).trim();
        if (value) {
          add({
            priority: 'P0',
            sourceType: 'project_brief',
            sourceId: field,
            semanticKey: `brief:${field}`,
            label,
            content: value,
            relevance: 1,
          });
        }
      }
      const readingPromise = text(context.brief.readingPromise, 'brief.readingPromise').trim();
      if (readingPromise) {
        add({
          priority: 'P3',
          sourceType: 'project_brief',
          sourceId: 'reading-promise',
          semanticKey: 'style:reading-promise',
          label: '阅读承诺与声音',
          content: readingPromise,
          relevance: 0.9,
        });
      }
      for (const [field, label] of [
        ['concept', '作品概念'],
        ['endingIntent', '结局意图'],
      ] as const) {
        const value = text(context.brief[field], `brief.${field}`).trim();
        if (value) {
          add({
            priority: 'P4',
            sourceType: 'project_brief',
            sourceId: field,
            semanticKey: `background:${field}`,
            label,
            content: value,
            relevance: field === 'concept' ? 0.75 : 0.55,
          });
        }
      }
    }

    add({
      priority: 'P1',
      sourceType: 'chapter',
      sourceId: input.chapterId,
      chapterId: input.chapterId,
      semanticKey: `chapter:${input.chapterId}:target`,
      label: '当前章节目标',
      content: {
        title: context.chapter.title,
        status: context.chapter.status,
        targetWordMin: context.chapter.targetWordMin,
        targetWordMax: context.chapter.targetWordMax,
      },
      relevance: 1,
    });
    for (const beat of context.beats) {
      const beatId = text(beat.id, 'sceneBeat.id');
      add({
        priority: 'P1',
        sourceType: 'scene_beat',
        sourceId: beatId,
        chapterId: input.chapterId,
        semanticKey: `scene-beat:${beatId}`,
        label: text(beat.title, 'sceneBeat.title'),
        content: {
          goal: text(beat.goal, 'sceneBeat.goal'),
          coreConflict: text(beat.coreConflict, 'sceneBeat.coreConflict'),
          expectedResult: text(beat.expectedResult, 'sceneBeat.expectedResult'),
          beatType: text(beat.beatType, 'sceneBeat.beatType'),
          wordTargetPercent: numberOrNull(beat.wordTargetPercent, 'sceneBeat.wordTargetPercent'),
          required: Number(beat.isRequired) === 1,
          orderKey: numberOrNull(beat.orderKey, 'sceneBeat.orderKey'),
        },
        relevance: 1,
      });
    }

    if (snapshotResult.snapshot) {
      add({
        priority: 'P2',
        sourceType: 'ending_snapshot',
        sourceId: snapshotResult.snapshot.id,
        sourceVersionId: snapshotResult.snapshot.sourceVersionId,
        chapterId: snapshotChapterId,
        semanticKey: `ending-snapshot:${snapshotChapterId}`,
        label: '前章有效尾快照',
        content: { sourceVersionId: snapshotResult.snapshot.sourceVersionId },
        relevance: 1,
        temporalStatus: 'snapshot',
      });
    }
    addSnapshotSources(
      sources,
      snapshotResult.content,
      snapshotChapterId,
      snapshotResult.snapshot?.sourceVersionId ?? null,
    );

    for (const entity of context.linkedEntities) {
      const entityId = text(entity.id, 'entity.id');
      add({
        priority: 'P2',
        sourceType: 'canon_fact',
        sourceId: entityId,
        entityId,
        semanticKey: `entity:${entityId}:profile`,
        label: text(entity.name, 'entity.name'),
        content: {
          entityType: text(entity.entityType, 'entity.entityType'),
          aliases: parseStringArray(entity.aliasesJson, 'entity.aliasesJson'),
          summary: text(entity.summary, 'entity.summary'),
        },
        relevance: 0.98,
      });
    }
    for (const fact of context.canonFacts) {
      const entityId = text(fact.entityId, 'canonFact.entityId');
      const factKey = text(fact.factKey, 'canonFact.factKey');
      add({
        priority: 'P2',
        sourceType: 'canon_fact',
        sourceId: text(fact.id, 'canonFact.id'),
        entityId,
        semanticKey: `entity:${entityId}:${factKey}`,
        label: `Canon ${factKey}`,
        content: {
          value: parseJson(fact.valueJson, 'canonFact.valueJson'),
          description: text(fact.description, 'canonFact.description'),
        },
        relevance: 0.97,
      });
    }
    for (const item of context.foreshadowings) {
      const id = text(item.id, 'foreshadowing.id');
      add({
        priority: 'P2',
        sourceType: 'foreshadowing',
        sourceId: id,
        chapterId: input.chapterId,
        semanticKey: `foreshadowing:${id}:detail`,
        label: text(item.title, 'foreshadowing.title'),
        content: {
          description: text(item.description, 'foreshadowing.description'),
          status: text(item.status, 'foreshadowing.status'),
          revealFromChapterId: nullableText(
            item.revealFromChapterId,
            'foreshadowing.revealFromChapterId',
          ),
          revealByChapterId: nullableText(item.revealByChapterId, 'foreshadowing.revealByChapterId'),
        },
        relevance: 0.93,
      });
    }
    for (const arc of context.arcs) {
      const id = text(arc.id, 'arc.id');
      add({
        priority: 'P2',
        sourceType: 'character_arc',
        sourceId: id,
        entityId: text(arc.characterId, 'arc.characterId'),
        semanticKey: `character-arc:${id}`,
        label: text(arc.title, 'arc.title'),
        content: {
          arcType: text(arc.arcType, 'arc.arcType'),
          status: text(arc.status, 'arc.status'),
          authorIntent: text(arc.authorIntent, 'arc.authorIntent'),
          milestones: parseJson(arc.milestonesJson, 'arc.milestonesJson'),
        },
        relevance: 0.92,
      });
    }

    const channel = text(context.project.channel, 'project.channel').trim();
    if (channel) {
      add({
        priority: 'P3',
        sourceType: 'project_brief',
        sourceId: 'channel',
        semanticKey: 'style:channel',
        label: '作品频道',
        content: channel,
        relevance: 0.8,
      });
    }
    const draftPriority: ConstraintPriority = ['rewrite', 'merge', 'validate', 'state_extract'].includes(
      input.taskType,
    )
      ? 'P3'
      : 'P4';
    for (const block of context.draftBlocks) {
      const content = text(block.text, 'draftBlock.text').trim();
      if (!content) continue;
      const logicalBlockId = text(block.logicalBlockId, 'draftBlock.logicalBlockId');
      add({
        priority: draftPriority,
        sourceType: 'current_draft',
        sourceId: logicalBlockId,
        chapterId: input.chapterId,
        semanticKey: `current-draft:${logicalBlockId}`,
        label: `当前稿块 ${numberOrNull(block.orderKey, 'draftBlock.orderKey') ?? 0}`,
        content,
        relevance: draftPriority === 'P3' ? 0.88 : 0.5,
      });
    }

    const query =
      input.query ??
      (context.beats[0] ? text(context.beats[0].title, 'sceneBeat.title') : context.chapter.title);
    if (input.maxSupplementalResults > 0 && query.trim()) {
      const result = this.#searchIndex.search({
        projectId: input.projectId,
        query: query.slice(0, 500),
        sourceTypes: ['draft', 'version', 'entity'],
        includeArchived: false,
        limit: input.maxSupplementalResults,
      });
      result.items.forEach((item, index) =>
        sources.push(supplementalSource(item, Math.max(0.2, 0.7 - index * 0.02))),
      );
    }

    const uniqueSources = deduplicateSources(sources);
    const usableTokens = input.maxInputTokens - input.safetyMarginTokens;
    let trimmed;
    try {
      trimmed = trimConstraints(uniqueSources, usableTokens);
    } catch (error) {
      if (error instanceof ConstraintBudgetError) {
        throw new ConstraintPackageServiceError(
          'CONSTRAINT_PACKAGE_BUDGET_EXCEEDED',
          error.message,
          { cause: error },
        );
      }
      throw error;
    }
    const sections = {
      P0: trimmed.kept.filter((source) => source.priority === 'P0'),
      P1: trimmed.kept.filter((source) => source.priority === 'P1'),
      P2: trimmed.kept.filter((source) => source.priority === 'P2'),
      P3: trimmed.kept.filter((source) => source.priority === 'P3'),
      P4: trimmed.kept.filter((source) => source.priority === 'P4'),
    };
    const sourceVersionIds = [
      ...new Set(trimmed.kept.flatMap((source) => source.sourceVersionId ?? [])),
    ].sort();
    const contentHash = sha256(
      stableSerialize(
        Object.fromEntries(
          Object.entries(sections).map(([priority, items]) => [
            priority,
            items.map((source) => source.content),
          ]),
        ),
      ),
    );
    const constraintHash = sha256(
      stableSerialize({
        projectId: input.projectId,
        chapterId: input.chapterId,
        taskType: input.taskType,
        snapshotSource: snapshotResult.snapshotSource,
        sources: trimmed.kept.map((source) => ({
          id: source.id,
          priority: source.priority,
          semanticKey: source.semanticKey,
          contentHash: source.contentHash,
          sourceVersionId: source.sourceVersionId,
        })),
        trimLog: trimmed.trimLog,
        budget: { maxInputTokens: input.maxInputTokens, safetyMarginTokens: input.safetyMarginTokens },
      }),
    );
    return ConstraintPackageSchema.parse({
      projectId: input.projectId,
      chapterId: input.chapterId,
      taskType: input.taskType,
      snapshotSource: snapshotResult.snapshotSource,
      sections,
      sourceVersionIds,
      estimatedTokens: trimmed.estimatedTokens,
      budget: {
        maxInputTokens: input.maxInputTokens,
        safetyMarginTokens: input.safetyMarginTokens,
        usableTokens,
      },
      contentHash,
      constraintHash,
      trimLog: trimmed.trimLog,
      conflicts: conflictsFor(trimmed.kept),
    });
  }
}
'''

serializer = r'''import type { ConstraintPackage, ConstraintPriority } from '@worldforge/contracts';

const priorities: readonly ConstraintPriority[] = ['P0', 'P1', 'P2', 'P3', 'P4'];

export function serializeConstraintPackage(value: ConstraintPackage): string {
  const lines = [
    `constraintHash: ${value.constraintHash}`,
    `contentHash: ${value.contentHash}`,
    `snapshotSource: ${value.snapshotSource}`,
    `estimatedTokens: ${value.estimatedTokens}/${value.budget.usableTokens}`,
  ];
  for (const priority of priorities) {
    lines.push('', `## ${priority}`);
    const sources = value.sections[priority];
    if (sources.length === 0) {
      lines.push('- （无）');
      continue;
    }
    for (const source of sources) {
      lines.push(
        `- [${source.sourceType}] ${source.label}`,
        `  source: ${source.sourceId}`,
        `  semanticKey: ${source.semanticKey}`,
        `  content: ${source.content}`,
      );
    }
  }
  if (value.conflicts.length > 0) {
    lines.push('', '## conflicts');
    for (const conflict of value.conflicts) {
      lines.push(`- ${conflict.semanticKey}: ${conflict.sourceIds.join(', ')}`);
    }
  }
  if (value.trimLog.length > 0) {
    lines.push('', '## trimLog');
    for (const entry of value.trimLog) {
      lines.push(`- ${entry.priority} ${entry.sourceId}: -${entry.estimatedTokens} tokens`);
    }
  }
  return `${lines.join('\n')}\n`;
}
'''

unit_test = r'''import { describe, expect, it } from 'vitest';

import {
  ConstraintBudgetError,
  estimateConstraintTokens,
  stableSerialize,
  trimConstraints,
} from '../../packages/domain/src/constraint-package.js';

const item = (
  id: string,
  priority: 'P0' | 'P1' | 'P2' | 'P3' | 'P4',
  estimatedTokens: number,
  relevance: number,
  required = priority === 'P0' || priority === 'P1',
) => ({ id, priority, estimatedTokens, relevance, required });

describe('M4-02 constraint package domain', () => {
  it('uses stable serialization and deterministic token estimation', () => {
    expect(stableSerialize({ z: 1, a: { y: 2, x: 3 } })).toBe('{"a":{"x":3,"y":2},"z":1}');
    expect(estimateConstraintTokens('玄烛城 ABC')).toBe(12);
    expect(estimateConstraintTokens('玄烛城 ABC')).toBe(estimateConstraintTokens('玄烛城 ABC'));
  });

  it('trims P4 then P3 then low-relevance P2 without removing P0 or P1', () => {
    const result = trimConstraints(
      [
        item('p0', 'P0', 30, 1),
        item('p1', 'P1', 30, 1),
        item('p2-low', 'P2', 20, 0.2, false),
        item('p2-high', 'P2', 20, 0.9, false),
        item('p3', 'P3', 20, 0.5, false),
        item('p4', 'P4', 20, 0.8, false),
      ],
      90,
    );
    expect(result.kept.map((entry) => entry.id)).toEqual(['p0', 'p1', 'p2-high']);
    expect(result.trimLog.map((entry) => entry.sourceId)).toEqual(['p4', 'p3', 'p2-low']);
    expect(result.estimatedTokens).toBe(80);
  });

  it('fails explicitly when mandatory P0 and P1 exceed the usable budget', () => {
    expect(() => trimConstraints([item('p0', 'P0', 300, 1), item('p1', 'P1', 300, 1)], 512)).toThrow(
      ConstraintBudgetError,
    );
  });
});
'''

integration_test = r'''import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { serializeConstraintPackage } from '../../packages/prompts/src/constraint-package-serializer.js';
import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ConstraintPackageService } from '../../packages/core-service/src/constraint-package.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { SearchIndexService } from '../../packages/core-service/src/search-index.js';

const temporaryDirectories: string[] = [];
const now = '2026-07-24T12:00:00.000Z';
const clock = { now: () => new Date(now) };

interface Harness {
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly search: SearchIndexService;
  readonly constraints: ConstraintPackageService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-constraint-package-'));
  temporaryDirectories.push(root);
  const parent = path.join(root, 'projects');
  await mkdir(parent, { recursive: true });
  const appRuntime = await openAppRuntime({
    databasePath: path.join(root, 'app.sqlite'),
    migrationsDirectory: 'migrations/app',
    recoveryDirectory: path.join(root, 'app-recovery'),
    appVersion: '0.1.0',
    clock,
  });
  const workspace = new ProjectWorkspaceService({
    projectMigrationsDirectory: 'migrations/project',
    projectMigrationRecoveryDirectory: path.join(root, 'project-migration-recovery'),
    appVersion: '0.1.0',
    recentProjects: appRuntime.recentProjects,
    clock,
  });
  const search = new SearchIndexService(workspace, { clock });
  return {
    parent,
    appRuntime,
    workspace,
    structure: new ProjectStructureService(workspace, { clock }),
    search,
    constraints: new ConstraintPackageService(workspace, { searchIndex: search }),
  };
}

async function closeHarness(harness: Harness): Promise<void> {
  await harness.workspace.shutdown();
  await harness.appRuntime.close();
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M4-02 constraint package integration', () => {
  it('assembles traceable P0-P4 inputs, uses valid snapshots, and falls back from stale snapshots', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '约束包项目', channel: '悬疑长篇' },
        harness.parent,
      );
      const initial = harness.structure.list(project.projectId);
      const volume = initial.volumes[0]!;
      const first = volume.chapters[0]!;
      const withSecond = await harness.structure.createChapter(randomUUID(), {
        projectId: project.projectId,
        volumeId: volume.id,
        title: '玄烛追索',
        placement: { kind: 'end' },
      });
      const second = withSecond.volumes[0]!.chapters[1]!;
      const entityId = randomUUID();
      const beatId = randomUUID();
      const versionId = randomUUID();
      const snapshotId = randomUUID();
      await harness.workspace.writeProject(randomUUID(), project.projectId, (connection) => {
        connection
          .prepare(
            `INSERT INTO project_briefs(
               id, project_id, concept, reading_promise, protagonist_goal,
               core_conflict, ending_intent, required_json, forbidden_json, updated_at
             ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            randomUUID(),
            project.projectId,
            '一座被遗忘的雨城',
            '线索清晰且人物克制',
            '找到失踪的守灯人',
            '真相与城市秩序冲突',
            '揭开玄烛来源',
            JSON.stringify(['不得改变主角身份']),
            JSON.stringify(['不得让反派提前知晓暗号']),
            now,
          );
        connection
          .prepare(
            `INSERT INTO entities(
               id, project_id, entity_type, name, aliases_json, summary,
               status, archived_at, created_at, updated_at
             ) VALUES(?, ?, 'character', ?, ?, ?, 'active', NULL, ?, ?)`,
          )
          .run(entityId, project.projectId, '玄烛使', JSON.stringify(['守灯人']), '雨城守灯者', now, now);
        connection
          .prepare(
            `INSERT INTO canon_facts(
               id, project_id, entity_id, fact_key, value_json, description,
               source_type, source_id, status, confirmed_at, superseded_at, created_at
             ) VALUES(?, ?, ?, 'location', ?, ?, 'author', NULL, 'current', ?, NULL, ?)`,
          )
          .run(randomUUID(), project.projectId, entityId, JSON.stringify('钟楼'), '当前驻守地点', now, now);
        connection
          .prepare(
            `INSERT INTO scene_beats(
               id, project_id, chapter_id, plot_node_id, title, goal, core_conflict,
               expected_result, beat_type, word_target_percent, is_required, order_key,
               character_ids_json, location_ids_json, deleted_at, updated_at
             ) VALUES(?, ?, ?, NULL, ?, ?, ?, ?, 'turn', 100, 1, 1024, ?, '[]', NULL, ?)`,
          )
          .run(
            beatId,
            project.projectId,
            second.id,
            '玄烛使现身',
            '确认守灯人的真实身份',
            '主角不信任证词',
            '得到钟楼暗号',
            JSON.stringify([entityId]),
            now,
          );
        connection
          .prepare(
            `INSERT INTO scene_beat_entities(project_id, scene_beat_id, entity_id, role, created_at)
             VALUES(?, ?, ?, 'character', ?)`,
          )
          .run(project.projectId, beatId, entityId, now);
        connection
          .prepare(
            `INSERT INTO versions(
               id, chapter_id, source_draft_id, source_revision, title, description,
               label, word_count, content_hash, created_at
             ) VALUES(?, ?, ?, 0, ?, '', NULL, 0, ?, ?)`,
          )
          .run(versionId, first.id, first.activeDraftId, '第一章定稿', 'a'.repeat(64), now);
        connection.prepare('UPDATE chapters SET final_version_id = ? WHERE id = ?').run(versionId, first.id);
        connection
          .prepare(
            `INSERT INTO ending_snapshots(
               id, project_id, chapter_id, source_version_id, status,
               content_json, stale_reasons_json, created_at, stale_at
             ) VALUES(?, ?, ?, ?, 'valid', ?, '[]', ?, NULL)`,
          )
          .run(
            snapshotId,
            project.projectId,
            first.id,
            versionId,
            JSON.stringify({
              entityStates: [
                { entityId, stateKey: 'location', value: '城门', sourceVersionId: versionId },
              ],
              knowledgeStates: [
                { characterId: entityId, informationKey: '暗号', knowledgeStatus: 'knows' },
              ],
              foreshadowings: [],
              arcMilestones: [],
            }),
            now,
          );
      });
      await harness.search.rebuild(randomUUID(), project.projectId);

      const input = {
        projectId: project.projectId,
        chapterId: second.id,
        taskType: 'chapter' as const,
        query: '玄烛使',
        maxInputTokens: 8_192,
        safetyMarginTokens: 512,
        maxSupplementalResults: 5,
      };
      const firstBuild = harness.constraints.build(input);
      const repeated = harness.constraints.build(input);
      expect(firstBuild.snapshotSource).toBe('snapshot');
      expect(firstBuild.sections.P0.map((source) => source.content)).toEqual(
        expect.arrayContaining(['不得改变主角身份', '不得让反派提前知晓暗号']),
      );
      expect(firstBuild.sections.P1.some((source) => source.sourceType === 'scene_beat')).toBe(true);
      expect(firstBuild.sections.P2.some((source) => source.sourceType === 'entity_state')).toBe(true);
      expect(firstBuild.sections.P2.some((source) => source.sourceType === 'canon_fact')).toBe(true);
      expect(firstBuild.sections.P4.some((source) => source.sourceType === 'supplemental_search')).toBe(
        true,
      );
      expect(firstBuild.sourceVersionIds).toContain(versionId);
      expect(firstBuild.constraintHash).toBe(repeated.constraintHash);
      expect(firstBuild.contentHash).toBe(repeated.contentHash);
      expect(serializeConstraintPackage(firstBuild)).toBe(serializeConstraintPackage(repeated));
      expect(firstBuild.conflicts.some((conflict) => conflict.semanticKey.includes('location'))).toBe(
        true,
      );

      await harness.workspace.writeProject(randomUUID(), project.projectId, (connection) => {
        connection
          .prepare(
            `UPDATE ending_snapshots
                SET status = 'stale', stale_reasons_json = '["entity_state"]', stale_at = ?
              WHERE id = ?`,
          )
          .run(now, snapshotId);
        connection
          .prepare(
            `INSERT INTO entity_states(
               id, project_id, entity_id, state_key, value_json,
               valid_from_chapter_id, valid_until_chapter_id, record_status,
               evidence_json, source_version_id, created_at, superseded_at
             ) VALUES(?, ?, ?, 'location', ?, ?, NULL, 'current', '[]', ?, ?, NULL)`,
          )
          .run(randomUUID(), project.projectId, entityId, JSON.stringify('钟楼'), first.id, versionId, now);
      });
      const fallback = harness.constraints.build(input);
      expect(fallback.snapshotSource).toBe('fallback_live_query');
      expect(fallback.sections.P2.some((source) => source.sourceType === 'ending_snapshot')).toBe(false);
      expect(
        fallback.sections.P2.some(
          (source) => source.sourceType === 'entity_state' && source.content.includes('钟楼'),
        ),
      ).toBe(true);
    } finally {
      await closeHarness(harness);
    }
  });
});
'''

Path('packages/contracts/src/constraint-package.ts').write_text(contracts)
Path('packages/domain/src/constraint-package.ts').write_text(domain)
Path('packages/core-service/src/constraint-package.ts').write_text(core)
Path('packages/prompts/src/constraint-package-serializer.ts').write_text(serializer)
Path('tests/unit/constraint-package-domain.test.ts').write_text(unit_test)
Path('tests/integration/constraint-package.test.ts').write_text(integration_test)

patches = {
    'packages/contracts/src/public-index.ts': (
        "export * from './search-index.js';\n",
        "export * from './search-index.js';\nexport * from './constraint-package.js';\n",
    ),
    'packages/domain/src/index.ts': (
        "export * from './continuity.js';\n",
        "export * from './continuity.js';\nexport * from './constraint-package.js';\n",
    ),
    'packages/core-service/src/index.ts': (
        "export * from './search-index.js';\n",
        "export * from './search-index.js';\nexport * from './constraint-package.js';\n",
    ),
    'packages/prompts/src/index.ts': (
        "export * from './types.js';\n",
        "export * from './types.js';\nexport * from './constraint-package-serializer.js';\n",
    ),
}
for path, (old, new) in patches.items():
    file = Path(path)
    value = file.read_text()
    if value.count(old) != 1:
        raise SystemExit(f'Patch marker not unique in {path}')
    file.write_text(value.replace(old, new, 1))

summary = Path('docs/test-evidence/M4-02/summary.md')
summary.write_text('''# M4-02 实施证据摘要\n\n## 当前实现\n\n- 定义P0—P4约束包、来源、时序、冲突、Hash与裁剪日志合同。\n- Core从ProjectBrief、当前章、SceneBeat、前章EndingSnapshot或权威回退、EntityState、Knowledge、Foreshadowing、Canon、人物弧光、当前稿和公共检索组装。\n- Domain执行稳定序列化、确定性Token估算和P4→P3→低相关P2裁剪；P0/P1预算不足时明确失败。\n- Prompt层提供确定性序列化，不接入Provider。\n\n## 自动验证\n\n由正式PR的GitHub Actions记录为准；本提交在推送前运行专项单元、集成、Typecheck、Lint、Eval和任务状态校验。\n''')

known = Path('docs/test-evidence/M4-02/known-risks.md')
known.write_text('''# M4-02 已知风险\n\n- Token估算采用确定性保守算法，不等同于任一Provider私有Tokenizer；M4-03/M4-05接入模型档案后可按模型覆盖估算器，但不得改变P0/P1不可裁剪规则。\n- 公共检索补充召回仍受M4-01索引状态影响；stale/rebuilding时会按M4-01合同回退权威LIKE。\n- V1不引入Embedding或Rerank，语义召回质量留待后续任务，当前保证确定性、可追溯和项目隔离。\n''')

commands = Path('docs/test-evidence/M4-02/commands.txt')
commands.write_text('''pnpm exec prettier --check packages/contracts/src/constraint-package.ts packages/domain/src/constraint-package.ts packages/core-service/src/constraint-package.ts packages/prompts/src/constraint-package-serializer.ts tests/unit/constraint-package-domain.test.ts tests/integration/constraint-package.test.ts\npnpm exec vitest run tests/unit/constraint-package-domain.test.ts tests/integration/constraint-package.test.ts\npnpm typecheck\npnpm lint\npnpm test:eval\nnode scripts/taskctl.mjs validate\n''')

import subprocess
subprocess.run([
    'pnpm', 'exec', 'prettier', '--write',
    'packages/contracts/src/constraint-package.ts',
    'packages/contracts/src/public-index.ts',
    'packages/domain/src/constraint-package.ts',
    'packages/domain/src/index.ts',
    'packages/core-service/src/constraint-package.ts',
    'packages/core-service/src/index.ts',
    'packages/prompts/src/constraint-package-serializer.ts',
    'packages/prompts/src/index.ts',
    'tests/unit/constraint-package-domain.test.ts',
    'tests/integration/constraint-package.test.ts',
    'docs/test-evidence/M4-02/summary.md',
    'docs/test-evidence/M4-02/known-risks.md',
], check=True)
subprocess.run(['pnpm', 'exec', 'vitest', 'run', 'tests/unit/constraint-package-domain.test.ts', 'tests/integration/constraint-package.test.ts'], check=True)
subprocess.run(['pnpm', 'typecheck'], check=True)
subprocess.run(['pnpm', 'lint'], check=True)
subprocess.run(['pnpm', 'test:eval'], check=True)
subprocess.run(['node', 'scripts/taskctl.mjs', 'validate'], check=True)
subprocess.run(['git', 'diff', '--check'], check=True)

subprocess.run(['git', 'add', '--all'], check=True)
subprocess.run(['git', 'commit', '-m', '功能：建立M4-02约束包组装与裁剪核心'], check=True)
subprocess.run(['git', 'push', 'origin', f'HEAD:{TARGET_BRANCH}'], check=True)
