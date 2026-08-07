import { createHash } from 'node:crypto';

import {
  ConstraintPackageSchema,
  ConstraintSourceSchema,
  type ConstraintConflict,
  type ConstraintPackage,
  type ConstraintPackageBuildInput,
  type ConstraintPriority,
  type ConstraintSource,
  type ConstraintTemporalStatus,
} from '@worldforge/contracts';
import { estimateConstraintTokens, stableSerialize, trimConstraints } from '@worldforge/domain';

import type { ProjectWorkspaceService } from './project-workspace.js';

interface AuthorityProjection {
  readonly chapterOrder: ReadonlyMap<string, number>;
  readonly targetOrder: number;
  readonly archivedEntities: readonly Record<string, unknown>[];
  readonly archivedCanonFacts: readonly Record<string, unknown>[];
  readonly foreshadowing: ReadonlyMap<
    string,
    { status: string; temporalStatus: ConstraintTemporalStatus }
  >;
}

const PRIORITIES: readonly ConstraintPriority[] = ['P0', 'P1', 'P2', 'P3', 'P4'];

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`CONSTRAINT_AUTHORITY_INVALID_${field}`);
  return value;
}

function parseStringArray(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string') ? parsed : [];
}

function parseContent(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function normalizedContent(value: unknown): string {
  return typeof value === 'string' ? value.trim() : stableSerialize(value);
}

function refreshSource(
  source: ConstraintSource,
  content: unknown,
  temporalStatus: ConstraintTemporalStatus = source.temporalStatus,
): ConstraintSource {
  const normalized = normalizedContent(content);
  return ConstraintSourceSchema.parse({
    ...source,
    content: normalized,
    temporalStatus,
    contentHash: sha256(normalized),
    estimatedTokens: estimateConstraintTokens(`${source.label}\n${normalized}`),
  });
}

function makeSource(input: {
  readonly priority: ConstraintPriority;
  readonly sourceType: ConstraintSource['sourceType'];
  readonly sourceId: string;
  readonly chapterId?: string | null;
  readonly entityId?: string | null;
  readonly semanticKey: string;
  readonly label: string;
  readonly content: unknown;
  readonly relevance: number;
  readonly temporalStatus?: ConstraintTemporalStatus;
}): ConstraintSource {
  const content = normalizedContent(input.content);
  return ConstraintSourceSchema.parse({
    id: `${input.sourceType}:${input.sourceId}:${input.semanticKey}`,
    priority: input.priority,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceVersionId: null,
    chapterId: input.chapterId ?? null,
    entityId: input.entityId ?? null,
    semanticKey: input.semanticKey,
    label: input.label,
    content,
    relevance: input.relevance,
    required: input.priority === 'P0' || input.priority === 'P1',
    temporalStatus: input.temporalStatus ?? 'current',
    estimatedTokens: estimateConstraintTokens(`${input.label}\n${content}`),
    contentHash: sha256(content),
  });
}

function allSources(value: ConstraintPackage): ConstraintSource[] {
  return PRIORITIES.flatMap((priority) => value.sections[priority]);
}

function deduplicate(sources: readonly ConstraintSource[]): ConstraintSource[] {
  const byId = new Map<string, ConstraintSource>();
  for (const source of sources) {
    const current = byId.get(source.id);
    if (!current || source.relevance > current.relevance) byId.set(source.id, source);
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

function roleStatus(role: string | null): string {
  switch (role) {
    case null:
      return 'planned';
    case 'plant':
      return 'planted';
    case 'reinforce':
      return 'reinforced';
    case 'partial_reveal':
      return 'partially_revealed';
    case 'reveal':
      return 'revealed';
    default:
      return 'planned';
  }
}

function loadProjection(
  workspace: ProjectWorkspaceService,
  input: ConstraintPackageBuildInput,
  packageValue: ConstraintPackage,
): AuthorityProjection {
  const foreshadowingIds = allSources(packageValue)
    .filter((source) => source.sourceType === 'foreshadowing')
    .map((source) => source.sourceId);

  return workspace.readProject(input.projectId, (connection) => {
    const chapterRows = connection
      .prepare(
        `SELECT chapter.id
           FROM chapters chapter
           JOIN volumes volume ON volume.id = chapter.volume_id
          WHERE volume.project_id = ? AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL
          ORDER BY volume.order_key, chapter.order_key, chapter.id`,
      )
      .all(input.projectId) as unknown as Record<string, unknown>[];
    const chapterOrder = new Map(
      chapterRows.map((row, index) => [text(row.id, 'chapter.id'), index] as const),
    );
    const targetOrder = chapterOrder.get(input.chapterId);
    if (targetOrder === undefined) throw new Error('CONSTRAINT_AUTHORITY_TARGET_CHAPTER_NOT_FOUND');

    const archivedEntities = connection
      .prepare(
        `SELECT DISTINCT entity.id, entity.entity_type AS entityType, entity.name,
                entity.aliases_json AS aliasesJson, entity.summary
           FROM scene_beat_entities link
           JOIN scene_beats beat ON beat.id = link.scene_beat_id
           JOIN entities entity ON entity.id = link.entity_id AND entity.project_id = link.project_id
          WHERE link.project_id = ? AND beat.chapter_id = ? AND beat.deleted_at IS NULL
            AND entity.status = 'archived'
          ORDER BY entity.entity_type, lower(entity.name), entity.id`,
      )
      .all(input.projectId, input.chapterId) as unknown as Record<string, unknown>[];
    const archivedEntityIds = archivedEntities.map((row) => text(row.id, 'entity.id'));
    const archivedCanonFacts =
      archivedEntityIds.length === 0
        ? []
        : (connection
            .prepare(
              `SELECT id, entity_id AS entityId, fact_key AS factKey,
                      value_json AS valueJson, description
                 FROM canon_facts
                WHERE project_id = ? AND status = 'current'
                  AND entity_id IN (${archivedEntityIds.map(() => '?').join(',')})
                ORDER BY entity_id, fact_key, id`,
            )
            .all(input.projectId, ...archivedEntityIds) as unknown as Record<string, unknown>[]);

    const foreshadowing = new Map<
      string,
      { status: string; temporalStatus: ConstraintTemporalStatus }
    >();
    const roleBefore = connection.prepare(
      `SELECT link.role, chapter.id AS chapterId
         FROM foreshadowing_chapters link
         JOIN chapters chapter ON chapter.id = link.chapter_id
         JOIN volumes volume ON volume.id = chapter.volume_id
        WHERE link.project_id = ? AND link.foreshadowing_id = ?
          AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL
        ORDER BY volume.order_key, chapter.order_key, chapter.id`,
    );
    for (const foreshadowingId of foreshadowingIds) {
      const rows = roleBefore.all(input.projectId, foreshadowingId) as unknown as Record<
        string,
        unknown
      >[];
      const eligible = rows.filter((row) => {
        const order = chapterOrder.get(text(row.chapterId, 'foreshadowing.chapterId'));
        return order !== undefined && order <= targetOrder;
      });
      const latest = eligible.at(-1);
      foreshadowing.set(foreshadowingId, {
        status: roleStatus(latest ? text(latest.role, 'foreshadowing.role') : null),
        temporalStatus: latest ? 'current' : rows.length > 0 ? 'upcoming' : 'current',
      });
    }

    return { chapterOrder, targetOrder, archivedEntities, archivedCanonFacts, foreshadowing };
  });
}

function projectArcSource(
  source: ConstraintSource,
  projection: AuthorityProjection,
): ConstraintSource {
  if (source.sourceType !== 'character_arc') return source;
  const parsed = parseContent(source.content);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return source;
  const content = parsed as Record<string, unknown>;
  if (!Array.isArray(content.milestones)) return source;
  const milestones = content.milestones.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    const milestone = entry as Record<string, unknown>;
    const status = typeof milestone.status === 'string' ? milestone.status : 'planned';
    const actualChapterId =
      typeof milestone.actualChapterId === 'string' ? milestone.actualChapterId : null;
    const plannedChapterId =
      typeof milestone.plannedChapterId === 'string' ? milestone.plannedChapterId : null;
    const temporalChapterId = actualChapterId ?? plannedChapterId;
    const order = temporalChapterId ? projection.chapterOrder.get(temporalChapterId) : undefined;
    const upcoming = order !== undefined && order > projection.targetOrder;
    if (!upcoming) return { ...milestone, temporalStatus: 'current' };
    return {
      ...milestone,
      status: status === 'hit' || status === 'skipped' ? 'planned' : status,
      actualChapterId: null,
      temporalStatus: 'upcoming',
    };
  });
  return refreshSource(source, { ...content, milestones });
}

function projectForeshadowingSource(
  source: ConstraintSource,
  projection: AuthorityProjection,
): ConstraintSource {
  if (source.sourceType !== 'foreshadowing') return source;
  const state = projection.foreshadowing.get(source.sourceId);
  if (!state) return source;
  const parsed = parseContent(source.content);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return source;
  return refreshSource(
    source,
    { ...(parsed as Record<string, unknown>), status: state.status },
    state.temporalStatus,
  );
}

function archivedSources(projection: AuthorityProjection): ConstraintSource[] {
  const result: ConstraintSource[] = [];
  for (const entity of projection.archivedEntities) {
    const entityId = text(entity.id, 'entity.id');
    result.push(
      makeSource({
        priority: 'P2',
        sourceType: 'entity',
        sourceId: entityId,
        entityId,
        semanticKey: `entity:${entityId}:profile`,
        label: text(entity.name, 'entity.name'),
        content: {
          entityType: text(entity.entityType, 'entity.entityType'),
          aliases: parseStringArray(entity.aliasesJson),
          summary: text(entity.summary, 'entity.summary'),
          catalogStatus: 'archived_reference',
        },
        relevance: 0.98,
      }),
    );
  }
  for (const fact of projection.archivedCanonFacts) {
    const entityId = text(fact.entityId, 'canonFact.entityId');
    const factKey = text(fact.factKey, 'canonFact.factKey');
    result.push(
      makeSource({
        priority: 'P2',
        sourceType: 'canon_fact',
        sourceId: text(fact.id, 'canonFact.id'),
        entityId,
        semanticKey: `entity:${entityId}:${factKey}`,
        label: `Canon ${factKey}`,
        content: {
          value: parseContent(text(fact.valueJson, 'canonFact.valueJson')),
          description: text(fact.description, 'canonFact.description'),
          catalogStatus: 'archived_reference',
        },
        relevance: 0.97,
      }),
    );
  }
  return result;
}

export function applyConstraintAuthorityPolicy(
  workspace: ProjectWorkspaceService,
  input: ConstraintPackageBuildInput,
  packageValue: ConstraintPackage,
): ConstraintPackage {
  const projection = loadProjection(workspace, input, packageValue);
  const excludeCurrentDraft = input.taskType === 'validate' || input.taskType === 'state_extract';
  const sources = allSources(packageValue)
    .filter((source) => !(excludeCurrentDraft && source.sourceType === 'current_draft'))
    .map((source) => projectArcSource(projectForeshadowingSource(source, projection), projection));
  sources.push(...archivedSources(projection));

  const unique = deduplicate(sources);
  const trimmed = trimConstraints(unique, packageValue.budget.usableTokens);
  const sections = Object.fromEntries(
    PRIORITIES.map((priority) => [
      priority,
      trimmed.kept.filter((source) => source.priority === priority),
    ]),
  ) as ConstraintPackage['sections'];
  const sourceVersionIds = [
    ...new Set(trimmed.kept.flatMap((source) => source.sourceVersionId ?? [])),
  ].sort();
  const contentHash = sha256(
    stableSerialize(
      Object.fromEntries(
        PRIORITIES.map((priority) => [
          priority,
          sections[priority].map((source) => source.content),
        ]),
      ),
    ),
  );
  const constraintHash = sha256(
    stableSerialize({
      projectId: input.projectId,
      chapterId: input.chapterId,
      taskType: input.taskType,
      snapshotSource: packageValue.snapshotSource,
      sources: trimmed.kept.map((source) => ({
        id: source.id,
        priority: source.priority,
        semanticKey: source.semanticKey,
        contentHash: source.contentHash,
        sourceVersionId: source.sourceVersionId,
        temporalStatus: source.temporalStatus,
      })),
      trimLog: [...packageValue.trimLog, ...trimmed.trimLog],
      budget: {
        maxInputTokens: packageValue.budget.maxInputTokens,
        safetyMarginTokens: packageValue.budget.safetyMarginTokens,
      },
    }),
  );

  return ConstraintPackageSchema.parse({
    ...packageValue,
    sections,
    sourceVersionIds,
    estimatedTokens: trimmed.estimatedTokens,
    contentHash,
    constraintHash,
    trimLog: [...packageValue.trimLog, ...trimmed.trimLog],
    conflicts: conflictsFor(trimmed.kept),
  });
}
