import type { DatabaseSync } from 'node:sqlite';

import {
  compareChapterPosition,
  dependencyDefinitelyOutOfOrder,
  eventTimeRange,
  findDependencyCycle,
  timeRangesOverlap,
} from '@worldforge/domain';

import type { RuleIssue } from './validation-rule-model.js';
import type { VersionRow } from './validation-model.js';
import { sqliteResult } from '../database/sqlite-result.js';

interface StateFactRow {
  readonly id: string;
  readonly entityId: string;
  readonly semanticKind: string;
  readonly valueJson: string;
  readonly validFromChapterId: string;
  readonly validUntilChapterId: string | null;
  readonly evidenceJson: string;
  readonly sourceVersionId: string;
}

interface TimelineFactRow {
  readonly id: string;
  readonly title: string;
  readonly startValue: string;
  readonly endValue: string | null;
  readonly precision: 'exact' | 'day' | 'month' | 'year' | 'approximate' | 'unknown';
  readonly locationId: string | null;
}

type ChapterPosition = readonly [number, number];

export function authorityConflictRules(database: DatabaseSync, version: VersionRow): RuleIssue[] {
  const positions = chapterPositions(database, version.projectId);
  const issues: RuleIssue[] = [];
  issues.push(...stateConflictRules(database, version, positions));
  issues.push(...timelineConflictRules(database, version));
  issues.push(...knowledgeConflictRules(database, version, positions));
  issues.push(...foreshadowingConflictRules(database, version, positions));
  return issues;
}

function issue(
  version: VersionRow,
  input: {
    readonly type: string;
    readonly severity: RuleIssue['severity'];
    readonly rationale: string;
    readonly suggestion: string;
    readonly currentEvidenceIds: readonly string[];
    readonly conflictEvidenceIds: readonly string[];
    readonly entityIds?: readonly string[];
  },
): RuleIssue {
  return {
    issueType: input.type,
    severity: input.severity,
    rationale: input.rationale,
    suggestion: input.suggestion,
    logicalBlockId: null,
    expectedBlockHash: null,
    textQuote: null,
    rangeHint: null,
    evidenceIds: unique([...input.currentEvidenceIds, ...input.conflictEvidenceIds]),
    currentEvidenceIds: unique(input.currentEvidenceIds),
    conflictEvidenceIds: unique(input.conflictEvidenceIds),
    ...(input.entityIds ? { entityIds: input.entityIds } : {}),
    ruleId: input.type,
  };
}

function chapterPositions(database: DatabaseSync, projectId: string): Map<string, ChapterPosition> {
  const rows = sqliteResult<
    Array<{
      readonly id: string;
      readonly volumeOrder: number | bigint;
      readonly chapterOrder: number | bigint;
    }>
  >(
    database
      .prepare(
        `SELECT chapter.id, volume.order_key AS volumeOrder, chapter.order_key AS chapterOrder
         FROM chapters chapter
         JOIN volumes volume ON volume.id = chapter.volume_id
        WHERE volume.project_id = ? AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL`,
      )
      .all(projectId),
  );
  return new Map(
    rows.map((row) => [row.id, [Number(row.volumeOrder), Number(row.chapterOrder)] as const]),
  );
}

function position(positions: Map<string, ChapterPosition>, chapterId: string): ChapterPosition {
  return positions.get(chapterId) ?? [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
}

function stateConflictRules(
  database: DatabaseSync,
  version: VersionRow,
  positions: Map<string, ChapterPosition>,
): RuleIssue[] {
  const rows = sqliteResult<StateFactRow[]>(
    database
      .prepare(
        `SELECT id, entity_id AS entityId,
              semantic_kind AS semanticKind, value_json AS valueJson,
              valid_from_chapter_id AS validFromChapterId,
              valid_until_chapter_id AS validUntilChapterId,
              evidence_json AS evidenceJson, source_version_id AS sourceVersionId
         FROM entity_states
        WHERE project_id = ? AND record_status <> 'invalid'
        ORDER BY entity_id, state_key, created_at, id`,
      )
      .all(version.projectId),
  );
  const issues: RuleIssue[] = [];
  const byEntity = group(rows, (row) => row.entityId);
  for (const [entityId, entityRows] of byEntity) {
    const ordered = [...entityRows].sort((left, right) =>
      compareChapterPosition(
        position(positions, left.validFromChapterId),
        position(positions, right.validFromChapterId),
      ),
    );
    const deathIndex = ordered.findIndex(
      (row) => row.semanticKind === 'life_status' && json(row.valueJson) === 'dead',
    );
    if (deathIndex >= 0) {
      const death = ordered[deathIndex]!;
      const resurrectionIndex = ordered.findIndex(
        (row, index) =>
          index > deathIndex &&
          row.semanticKind === 'life_status' &&
          json(row.valueJson) === 'alive',
      );
      const afterDeath = ordered
        .slice(deathIndex + 1, resurrectionIndex < 0 ? undefined : resurrectionIndex)
        .find(
          (row) =>
            !(row.semanticKind === 'life_status' && json(row.valueJson) === 'dead') &&
            compareChapterPosition(
              position(positions, death.validFromChapterId),
              position(positions, row.validFromChapterId),
            ) < 0,
        );
      if (afterDeath) {
        issues.push(
          issue(version, {
            type: 'authority.character_after_death',
            severity: 'high',
            rationale: `人物 ${entityId} 已有死亡记录，但后续章节仍发生权威状态更新。`,
            suggestion: '核对死亡记录、生效章节或后续状态；复活应有明确的新权威事实。',
            currentEvidenceIds: rowEvidence(death),
            conflictEvidenceIds: rowEvidence(afterDeath),
            entityIds: [entityId],
          }),
        );
      }
    }

    const ages = ordered.filter((row) => row.semanticKind === 'age');
    for (let index = 1; index < ages.length; index += 1) {
      const previous = ages[index - 1]!;
      const current = ages[index]!;
      const previousAge = numericValue(json(previous.valueJson));
      const currentAge = numericValue(json(current.valueJson));
      if (previousAge !== null && currentAge !== null && currentAge < previousAge) {
        issues.push(
          issue(version, {
            type: 'authority.age_reversal',
            severity: 'high',
            rationale: `人物 ${entityId} 的后续年龄 ${currentAge} 小于先前年龄 ${previousAge}。`,
            suggestion: '核对章节顺序、年龄值或是否需要明确的特殊世界规则。',
            currentEvidenceIds: rowEvidence(previous),
            conflictEvidenceIds: rowEvidence(current),
            entityIds: [entityId],
          }),
        );
        break;
      }
    }

    issues.push(...overlapStateIssues(version, entityId, ordered, positions));
  }
  issues.push(...uniquePossessionIssues(version, rows, positions));
  return issues;
}

function overlapStateIssues(
  version: VersionRow,
  entityId: string,
  rows: readonly StateFactRow[],
  positions: Map<string, ChapterPosition>,
): RuleIssue[] {
  const issues: RuleIssue[] = [];
  for (const semanticKind of ['location', 'life_status']) {
    const facts = rows.filter((row) => row.semanticKind === semanticKind);
    for (let leftIndex = 0; leftIndex < facts.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < facts.length; rightIndex += 1) {
        const left = facts[leftIndex]!;
        const right = facts[rightIndex]!;
        if (
          JSON.stringify(json(left.valueJson)) === JSON.stringify(json(right.valueJson)) ||
          !rangesOverlap(left, right, positions)
        ) {
          continue;
        }
        issues.push(
          issue(version, {
            type:
              semanticKind === 'location'
                ? 'authority.exclusive_location_overlap'
                : 'authority.life_state_overlap',
            severity: 'high',
            rationale:
              semanticKind === 'location'
                ? `人物 ${entityId} 在重叠故事区间被记录于两个互斥地点。`
                : `人物 ${entityId} 在重叠故事区间同时存在互斥的生死状态。`,
            suggestion: '调整其中一条状态的生效或失效章节，并保留真实的转变顺序。',
            currentEvidenceIds: rowEvidence(left),
            conflictEvidenceIds: rowEvidence(right),
            entityIds: [entityId],
          }),
        );
        return issues;
      }
    }
  }
  return issues;
}

function uniquePossessionIssues(
  version: VersionRow,
  rows: readonly StateFactRow[],
  positions: Map<string, ChapterPosition>,
): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const holderFacts = group(
    rows.filter((row) => row.semanticKind === 'holder'),
    (row) => row.entityId,
  );
  for (const [itemEntityId, facts] of holderFacts) {
    for (let leftIndex = 0; leftIndex < facts.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < facts.length; rightIndex += 1) {
        const left = facts[leftIndex]!;
        const right = facts[rightIndex]!;
        const leftHolder = json(left.valueJson);
        const rightHolder = json(right.valueJson);
        if (leftHolder === rightHolder || !rangesOverlap(left, right, positions)) continue;
        issues.push(
          issue(version, {
            type: 'authority.unique_item_multiple_holders',
            severity: 'high',
            rationale: `唯一物品 ${itemEntityId} 在重叠区间被记录为由不同人物持有。`,
            suggestion: '确认物品转移章节，并结束上一位持有者的有效区间。',
            currentEvidenceIds: rowEvidence(left),
            conflictEvidenceIds: rowEvidence(right),
            entityIds: [itemEntityId, String(leftHolder), String(rightHolder)],
          }),
        );
        break;
      }
    }
  }
  return issues;
}

function timelineConflictRules(database: DatabaseSync, version: VersionRow): RuleIssue[] {
  const events = sqliteResult<TimelineFactRow[]>(
    database
      .prepare(
        `SELECT id, title, start_value AS startValue, end_value AS endValue, precision,
              location_id AS locationId
         FROM timeline_events WHERE project_id = ? AND status = 'active'`,
      )
      .all(version.projectId),
  );
  const eventById = new Map(events.map((event) => [event.id, event]));
  const dependencies = sqliteResult<
    Array<{
      readonly eventId: string;
      readonly dependencyId: string;
    }>
  >(
    database
      .prepare(
        `SELECT event_id AS eventId, dependency_event_id AS dependencyId
         FROM timeline_event_dependencies WHERE project_id = ?`,
      )
      .all(version.projectId),
  );
  const issues: RuleIssue[] = [];
  const graph = new Map<string, string[]>();
  for (const relation of dependencies) {
    graph.set(relation.eventId, [...(graph.get(relation.eventId) ?? []), relation.dependencyId]);
    const event = eventById.get(relation.eventId);
    const dependency = eventById.get(relation.dependencyId);
    if (!event || !dependency) {
      issues.push(
        issue(version, {
          type: 'authority.timeline_dependency_missing',
          severity: 'high',
          rationale: '时间线事件引用了不存在或已归档的依赖事件。',
          suggestion: '恢复依赖事件或移除失效依赖。',
          currentEvidenceIds: [relation.eventId],
          conflictEvidenceIds: [relation.dependencyId],
        }),
      );
      continue;
    }
    const eventRange = eventTimeRange(event.startValue, event.endValue, event.precision);
    const dependencyRange = eventTimeRange(
      dependency.startValue,
      dependency.endValue,
      dependency.precision,
    );
    if (
      eventRange &&
      dependencyRange &&
      dependencyDefinitelyOutOfOrder(dependencyRange, eventRange)
    ) {
      issues.push(
        issue(version, {
          type: 'authority.timeline_dependency_reversed',
          severity: 'high',
          rationale: `事件“${event.title}”发生在其依赖事件“${dependency.title}”之前。`,
          suggestion: '调整事件时间或依赖方向。',
          currentEvidenceIds: [dependency.id],
          conflictEvidenceIds: [event.id],
        }),
      );
    }
  }
  const cycle = findDependencyCycle(graph);
  if (cycle) {
    issues.push(
      issue(version, {
        type: 'authority.timeline_dependency_cycle',
        severity: 'high',
        rationale: '时间线事件依赖形成循环，无法确定先后顺序。',
        suggestion: '移除或改向至少一条循环依赖。',
        currentEvidenceIds: [cycle[0]!],
        conflictEvidenceIds: cycle.slice(1),
      }),
    );
  }
  issues.push(...timelineLocationConflicts(database, version, events));
  return issues;
}

function timelineLocationConflicts(
  database: DatabaseSync,
  version: VersionRow,
  events: readonly TimelineFactRow[],
): RuleIssue[] {
  const presenceRows = sqliteResult<
    Array<{
      readonly eventId: string;
      readonly entityId: string;
    }>
  >(
    database
      .prepare(
        `SELECT event_id AS eventId, entity_id AS entityId
         FROM timeline_event_entities
        WHERE project_id = ? AND role IN ('participant', 'witness')`,
      )
      .all(version.projectId),
  );
  const presence = new Map<string, Set<string>>();
  for (const row of presenceRows) {
    const entityIds = presence.get(row.eventId) ?? new Set<string>();
    entityIds.add(row.entityId);
    presence.set(row.eventId, entityIds);
  }
  const issues: RuleIssue[] = [];
  for (let leftIndex = 0; leftIndex < events.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < events.length; rightIndex += 1) {
      const left = events[leftIndex]!;
      const right = events[rightIndex]!;
      if (!left.locationId || !right.locationId || left.locationId === right.locationId) continue;
      const leftRange = eventTimeRange(left.startValue, left.endValue, left.precision);
      const rightRange = eventTimeRange(right.startValue, right.endValue, right.precision);
      if (!leftRange || !rightRange || !timeRangesOverlap(leftRange, rightRange)) continue;
      const rightPresence = presence.get(right.id) ?? new Set<string>();
      const shared = [...(presence.get(left.id) ?? [])].filter((id) => rightPresence.has(id));
      if (shared.length === 0) continue;
      issues.push(
        issue(version, {
          type: 'authority.timeline_simultaneous_locations',
          severity: 'high',
          rationale: `人物 ${shared.join('、')} 在重叠时间内出现在两个不同地点。`,
          suggestion: '调整事件时间、地点或人物在场角色；若为特殊叙事，请记住合理例外。',
          currentEvidenceIds: [left.id, left.locationId],
          conflictEvidenceIds: [right.id, right.locationId],
          entityIds: shared,
        }),
      );
    }
  }
  return issues;
}

function knowledgeConflictRules(
  database: DatabaseSync,
  version: VersionRow,
  positions: Map<string, ChapterPosition>,
): RuleIssue[] {
  const rows = sqliteResult<
    Array<{
      readonly id: string;
      readonly characterId: string;
      readonly informationKey: string;
      readonly validFromChapterId: string;
      readonly sourceVersionId: string;
      readonly sourceLogicalBlockId: string | null;
      readonly sourceChapterId: string;
    }>
  >(
    database
      .prepare(
        `SELECT knowledge.id, knowledge.character_id AS characterId,
              knowledge.information_key AS informationKey,
              knowledge.valid_from_chapter_id AS validFromChapterId,
              knowledge.source_version_id AS sourceVersionId,
              knowledge.source_logical_block_id AS sourceLogicalBlockId,
              source_chapter.id AS sourceChapterId
         FROM knowledge_states knowledge
         JOIN versions source_version ON source_version.id = knowledge.source_version_id
         JOIN chapters source_chapter ON source_chapter.id = source_version.chapter_id
        WHERE knowledge.project_id = ? AND knowledge.record_status <> 'invalid'
          AND knowledge.knowledge_status <> 'unknown'`,
      )
      .all(version.projectId),
  );
  return rows
    .filter(
      (row) =>
        compareChapterPosition(
          position(positions, row.validFromChapterId),
          position(positions, row.sourceChapterId),
        ) < 0,
    )
    .map((row) =>
      issue(version, {
        type: 'authority.knowledge_before_source',
        severity: 'high',
        rationale: `人物 ${row.characterId} 在来源出现前已被记录为知晓“${row.informationKey}”。`,
        suggestion: '调整知情生效章节，或绑定更早且真实的来源证据。',
        currentEvidenceIds: [row.sourceLogicalBlockId ?? row.sourceVersionId],
        conflictEvidenceIds: [row.id, row.validFromChapterId],
        entityIds: [row.characterId],
      }),
    );
}

function foreshadowingConflictRules(
  database: DatabaseSync,
  version: VersionRow,
  positions: Map<string, ChapterPosition>,
): RuleIssue[] {
  const links = sqliteResult<
    Array<{
      readonly id: string;
      readonly title: string;
      readonly status: string;
      readonly revealByChapterId: string | null;
      readonly chapterId: string | null;
      readonly role: string | null;
    }>
  >(
    database
      .prepare(
        `SELECT foreshadowing.id, foreshadowing.title, foreshadowing.status,
              foreshadowing.reveal_by_chapter_id AS revealByChapterId,
              link.chapter_id AS chapterId, link.role
         FROM foreshadowings foreshadowing
         LEFT JOIN foreshadowing_chapters link ON link.foreshadowing_id = foreshadowing.id
        WHERE foreshadowing.project_id = ?`,
      )
      .all(version.projectId),
  );
  const byId = group(links, (row) => row.id);
  const issues: RuleIssue[] = [];
  for (const [id, rows] of byId) {
    const first = rows[0]!;
    const plant = earliestChapter(
      rows.filter((row) => row.role === 'plant'),
      positions,
    );
    const reveal = earliestChapter(
      rows.filter((row) => row.role === 'reveal' || row.role === 'partial_reveal'),
      positions,
    );
    if (reveal && (!plant || compareChapterPosition(reveal.position, plant.position) < 0)) {
      issues.push(
        issue(version, {
          type: 'authority.foreshadowing_reveal_before_plant',
          severity: 'high',
          rationale: `伏笔“${first.title}”的揭示早于埋设。`,
          suggestion: '调整伏笔章节角色，使埋设先于部分揭示或揭示。',
          currentEvidenceIds: plant ? [id, plant.chapterId] : [id],
          conflictEvidenceIds: [reveal.chapterId],
        }),
      );
    }
    if (
      first.revealByChapterId &&
      !['revealed', 'cancelled'].includes(first.status) &&
      compareChapterPosition(
        position(positions, first.revealByChapterId),
        position(positions, version.chapterId),
      ) < 0
    ) {
      issues.push(
        issue(version, {
          type: 'authority.foreshadowing_overdue',
          severity: 'medium',
          rationale: `伏笔“${first.title}”已超过计划回收章节但仍未揭示。`,
          suggestion: '安排回收、调整计划回收章节或由作者明确取消。',
          currentEvidenceIds: [id, first.revealByChapterId],
          conflictEvidenceIds: [version.versionId, version.chapterId],
        }),
      );
    }
  }
  const unmet = sqliteResult<
    Array<{
      readonly sourceId: string;
      readonly sourceTitle: string;
      readonly targetId: string;
      readonly targetStatus: string;
    }>
  >(
    database
      .prepare(
        `SELECT source.id AS sourceId, source.title AS sourceTitle,
              target.id AS targetId, target.status AS targetStatus
         FROM foreshadowing_relations relation
         JOIN foreshadowings source ON source.id = relation.source_foreshadowing_id
         JOIN foreshadowings target ON target.id = relation.target_foreshadowing_id
        WHERE relation.project_id = ? AND relation.relation_kind = 'depends_on'
          AND source.status IN ('planted', 'reinforced', 'partially_revealed', 'revealed')
          AND target.status IN ('planned', 'cancelled')`,
      )
      .all(version.projectId),
  );
  for (const row of unmet) {
    issues.push(
      issue(version, {
        type: 'authority.foreshadowing_dependency_unmet',
        severity: 'high',
        rationale: `伏笔“${row.sourceTitle}”已推进，但其依赖伏笔尚未满足。`,
        suggestion: '先推进依赖伏笔，或修正依赖关系。',
        currentEvidenceIds: [row.targetId],
        conflictEvidenceIds: [row.sourceId],
      }),
    );
  }
  return issues;
}

function earliestChapter(
  rows: readonly { readonly chapterId: string | null }[],
  positions: Map<string, ChapterPosition>,
): { readonly chapterId: string; readonly position: ChapterPosition } | null {
  const candidates = rows
    .filter((row): row is { readonly chapterId: string } => row.chapterId !== null)
    .map((row) => ({ chapterId: row.chapterId, position: position(positions, row.chapterId) }))
    .sort((left, right) => compareChapterPosition(left.position, right.position));
  return candidates[0] ?? null;
}

function rangesOverlap(
  left: StateFactRow,
  right: StateFactRow,
  positions: Map<string, ChapterPosition>,
): boolean {
  const leftStart = position(positions, left.validFromChapterId);
  const rightStart = position(positions, right.validFromChapterId);
  const leftEnd = left.validUntilChapterId ? position(positions, left.validUntilChapterId) : null;
  const rightEnd = right.validUntilChapterId
    ? position(positions, right.validUntilChapterId)
    : null;
  return (
    (!leftEnd || compareChapterPosition(rightStart, leftEnd) < 0) &&
    (!rightEnd || compareChapterPosition(leftStart, rightEnd) < 0)
  );
}

function rowEvidence(row: StateFactRow): string[] {
  const anchors = json(row.evidenceJson);
  const ids = Array.isArray(anchors)
    ? anchors.flatMap((anchor) =>
        anchor && typeof anchor === 'object' && 'targetId' in anchor
          ? [String((anchor as { readonly targetId: unknown }).targetId)]
          : [],
      )
    : [];
  return unique([row.id, row.sourceVersionId, ...ids]);
}

function json(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function numericValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function group<Row>(rows: readonly Row[], key: (row: Row) => string): Map<string, Row[]> {
  const grouped = new Map<string, Row[]>();
  for (const row of rows) grouped.set(key(row), [...(grouped.get(key(row)) ?? []), row]);
  return grouped;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
