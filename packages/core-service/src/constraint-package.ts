import { createHash } from 'node:crypto';
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
  readonly eligibleChapterIds: readonly string[];
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
    required: (input.required ?? input.priority === 'P0') || input.priority === 'P1',
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
  const values = [...byId.values()];
  const authoritativeHashes = new Set(
    values
      .filter((source) => source.sourceType !== 'supplemental_search')
      .map((source) => source.contentHash),
  );
  const supplementalHashes = new Set<string>();
  return values.filter((source) => {
    if (source.sourceType !== 'supplemental_search') return true;
    if (authoritativeHashes.has(source.contentHash) || supplementalHashes.has(source.contentHash)) {
      return false;
    }
    supplementalHashes.add(source.contentHash);
    return true;
  });
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
  const chapterIndex = chapters.findIndex((row) => row.id === chapterId);
  const rawChapter = chapters[chapterIndex];
  if (chapterIndex < 0 || !rawChapter) {
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
    eligibleChapterIds: chapters
      .slice(0, chapterIndex + 1)
      .map((row) => text(row.id, 'chapter.id')),
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
    temporalStatus: item.sourceType === 'version' ? 'historical' : 'current',
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
    const snapshotResult = context.chapter.previousChapterId
      ? this.#stateProposal.readSnapshot({
          projectId: input.projectId,
          chapterId: context.chapter.previousChapterId,
        })
      : {
          snapshotSource: 'fallback_live_query' as const,
          snapshot: null,
          content: {
            entityStates: [],
            knowledgeStates: [],
            foreshadowings: [],
            arcMilestones: [],
          },
        };
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
        sourceType: 'entity',
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
          revealByChapterId: nullableText(
            item.revealByChapterId,
            'foreshadowing.revealByChapterId',
          ),
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
    const draftPriority: ConstraintPriority = [
      'rewrite',
      'merge',
      'validate',
      'state_extract',
    ].includes(input.taskType)
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
      const eligibleChapterIds = new Set(context.eligibleChapterIds);
      result.items
        .filter((item) => item.chapterId === null || eligibleChapterIds.has(item.chapterId))
        .forEach((item, index) =>
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
        budget: {
          maxInputTokens: input.maxInputTokens,
          safetyMarginTokens: input.safetyMarginTokens,
        },
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
