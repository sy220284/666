import type { DatabaseSync } from 'node:sqlite';

import {
  StoryKnowledgeProjectionInputSchema,
  StoryKnowledgeProjectionSchema,
  type StoryKnowledgeProjection,
  type StoryKnowledgeProjectionInput,
} from '@worldforge/contracts';

import type { ProjectWorkspaceService } from './project-workspace.js';

interface EntityRow {
  readonly id: string;
  readonly entityType: string;
  readonly name: string;
  readonly summary: string;
  readonly status: string;
}

interface RelationshipRow {
  readonly id: string;
  readonly fromCharacterId: string;
  readonly fromCharacterName: string;
  readonly toCharacterId: string;
  readonly toCharacterName: string;
  readonly category: string;
  readonly label: string;
  readonly validFromChapterId: string;
  readonly validUntilChapterId: string | null;
}

interface TimelineRow {
  readonly id: string;
  readonly title: string;
  readonly chapterId: string;
  readonly chapterTitle: string;
  readonly startValue: number;
  readonly endValue: number | null;
  readonly precision: string;
  readonly locationId: string | null;
}

interface ForeshadowingRow {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: string;
  readonly revealFromChapterId: string | null;
  readonly revealByChapterId: string | null;
}

interface ArcMilestoneRow {
  readonly id: string;
  readonly arcId: string;
  readonly arcTitle: string;
  readonly title: string;
  readonly description: string;
  readonly status: string;
  readonly plannedChapterId: string | null;
  readonly actualChapterId: string | null;
  readonly sortIndex: number;
}

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}

function entity(connection: DatabaseSync, projectId: string, entityId: string): EntityRow {
  const row = connection
    .prepare(
      `SELECT id, entity_type AS entityType, name, summary, status
         FROM entities
        WHERE project_id = ? AND id = ?`,
    )
    .get(projectId, entityId) as unknown as EntityRow | undefined;
  if (!row) throw new Error('STORY_KNOWLEDGE_ENTITY_NOT_FOUND');
  return row;
}

function chapterExists(connection: DatabaseSync, projectId: string, chapterId: string): void {
  const row = connection
    .prepare(`SELECT 1 AS found FROM chapters WHERE project_id = ? AND id = ?`)
    .get(projectId, chapterId) as unknown as { readonly found: number } | undefined;
  if (!row) throw new Error('STORY_KNOWLEDGE_CHAPTER_NOT_FOUND');
}

function relationships(
  connection: DatabaseSync,
  projectId: string,
  characterId: string,
  chapterId: string | null,
  limit: number,
): { readonly items: RelationshipRow[]; readonly truncated: boolean } {
  const args: Array<string | number> = [projectId, characterId, characterId];
  const chapterFilter = chapterId
    ? `AND EXISTS (
         SELECT 1
           FROM chapters target
           JOIN volumes target_volume ON target_volume.id = target.volume_id
           JOIN chapters start_chapter ON start_chapter.id = relationship.valid_from_chapter_id
           JOIN volumes start_volume ON start_volume.id = start_chapter.volume_id
           LEFT JOIN chapters end_chapter ON end_chapter.id = relationship.valid_until_chapter_id
           LEFT JOIN volumes end_volume ON end_volume.id = end_chapter.volume_id
          WHERE target.project_id = relationship.project_id
            AND target.id = ?
            AND (
              start_volume.order_key < target_volume.order_key OR
              (start_volume.order_key = target_volume.order_key AND start_chapter.order_key <= target.order_key)
            )
            AND (
              relationship.valid_until_chapter_id IS NULL OR
              target_volume.order_key < end_volume.order_key OR
              (target_volume.order_key = end_volume.order_key AND target.order_key < end_chapter.order_key)
            )
       )`
    : `AND relationship.record_status = 'current'`;
  if (chapterId) args.push(chapterId);
  args.push(limit + 1);
  const rows = connection
    .prepare(
      `SELECT relationship.id,
              relationship.from_character_id AS fromCharacterId,
              source.name AS fromCharacterName,
              relationship.to_character_id AS toCharacterId,
              target.name AS toCharacterName,
              relationship.category, relationship.label,
              relationship.valid_from_chapter_id AS validFromChapterId,
              relationship.valid_until_chapter_id AS validUntilChapterId
         FROM character_relationships relationship
         JOIN entities source ON source.id = relationship.from_character_id
         JOIN entities target ON target.id = relationship.to_character_id
        WHERE relationship.project_id = ?
          AND relationship.record_status <> 'invalid'
          AND (relationship.from_character_id = ? OR relationship.to_character_id = ?)
          ${chapterFilter}
        ORDER BY relationship.category, relationship.label,
                 source.name, target.name, relationship.id
        LIMIT ?`,
    )
    .all(...args) as unknown as RelationshipRow[];
  return { items: rows.slice(0, limit), truncated: rows.length > limit };
}

function timelineSide(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
  characterId: string | null,
  direction: 'before' | 'after',
  limit: number,
): TimelineRow[] {
  if (limit === 0) return [];
  const before = direction === 'before';
  const characterJoin = characterId
    ? `JOIN timeline_event_entities event_entity
         ON event_entity.event_id = event.id AND event_entity.entity_id = ?`
    : '';
  const args: Array<string | number> = characterId ? [characterId, projectId, chapterId] : [projectId, chapterId];
  args.push(limit + 1);
  return connection
    .prepare(
      `WITH anchor AS (
         SELECT chapter.order_key AS chapterOrder, volume.order_key AS volumeOrder
           FROM chapters chapter
           JOIN volumes volume ON volume.id = chapter.volume_id
          WHERE chapter.project_id = ? AND chapter.id = ?
       )
       SELECT event.id, event.title, event.chapter_id AS chapterId,
              chapter.title AS chapterTitle, event.start_value AS startValue,
              event.end_value AS endValue, event.precision,
              event.location_id AS locationId
         FROM timeline_events event
         JOIN chapters chapter ON chapter.id = event.chapter_id
         JOIN volumes volume ON volume.id = chapter.volume_id
         ${characterJoin}
         CROSS JOIN anchor
        WHERE event.project_id = ? AND event.status = 'active'
          AND ${before ? '(' : '('}
            volume.order_key ${before ? '<' : '>'} anchor.volumeOrder OR
            (volume.order_key = anchor.volumeOrder AND chapter.order_key ${before ? '<=' : '>'} anchor.chapterOrder)
          )
        ORDER BY volume.order_key ${before ? 'DESC' : 'ASC'},
                 chapter.order_key ${before ? 'DESC' : 'ASC'},
                 event.start_value ${before ? 'DESC' : 'ASC'}, event.id ${before ? 'DESC' : 'ASC'}
        LIMIT ?`,
    )
    .all(...(characterId ? [projectId, chapterId, characterId, projectId, limit + 1] : [projectId, chapterId, projectId, limit + 1])) as unknown as TimelineRow[];
}

function timeline(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
  characterId: string | null,
  before: number,
  after: number,
) {
  const beforeRows = timelineSide(connection, projectId, chapterId, characterId, 'before', before);
  const afterRows = timelineSide(connection, projectId, chapterId, characterId, 'after', after);
  return {
    items: [...beforeRows.slice(0, before).reverse(), ...afterRows.slice(0, after)],
    truncatedBefore: beforeRows.length > before,
    truncatedAfter: afterRows.length > after,
  };
}

function foreshadowings(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
  limit: number,
): { readonly items: ForeshadowingRow[]; readonly truncated: boolean } {
  const rows = connection
    .prepare(
      `WITH anchor AS (
         SELECT chapter.order_key AS chapterOrder, volume.order_key AS volumeOrder
           FROM chapters chapter
           JOIN volumes volume ON volume.id = chapter.volume_id
          WHERE chapter.project_id = ? AND chapter.id = ?
       )
       SELECT item.id, item.title, item.description, item.status,
              item.reveal_from_chapter_id AS revealFromChapterId,
              item.reveal_by_chapter_id AS revealByChapterId
         FROM foreshadowings item
         LEFT JOIN chapters reveal_from ON reveal_from.id = item.reveal_from_chapter_id
         LEFT JOIN volumes reveal_from_volume ON reveal_from_volume.id = reveal_from.volume_id
         LEFT JOIN chapters reveal_by ON reveal_by.id = item.reveal_by_chapter_id
         LEFT JOIN volumes reveal_by_volume ON reveal_by_volume.id = reveal_by.volume_id
         CROSS JOIN anchor
        WHERE item.project_id = ?
          AND item.status <> 'cancelled'
          AND (
            item.reveal_by_chapter_id IS NULL OR
            anchor.volumeOrder < reveal_by_volume.order_key OR
            (anchor.volumeOrder = reveal_by_volume.order_key AND anchor.chapterOrder <= reveal_by.order_key) OR
            item.status = 'revealed'
          )
        ORDER BY item.status IN ('revealed', 'cancelled'),
                 COALESCE(reveal_from_volume.order_key, 2147483647),
                 COALESCE(reveal_from.order_key, 2147483647), item.updated_at DESC, item.id
        LIMIT ?`,
    )
    .all(projectId, chapterId, projectId, limit + 1) as unknown as ForeshadowingRow[];
  return { items: rows.slice(0, limit), truncated: rows.length > limit };
}

function arcMilestones(
  connection: DatabaseSync,
  projectId: string,
  characterId: string,
  limit: number,
): { readonly items: ArcMilestoneRow[]; readonly truncated: boolean } {
  const rows = connection
    .prepare(
      `SELECT milestone.id, milestone.arc_id AS arcId, arc.title AS arcTitle,
              milestone.title, milestone.description, milestone.status,
              milestone.planned_chapter_id AS plannedChapterId,
              milestone.actual_chapter_id AS actualChapterId,
              milestone.sort_index AS sortIndex
         FROM character_arcs arc
         JOIN arc_milestones milestone
           ON milestone.project_id = arc.project_id AND milestone.arc_id = arc.id
        WHERE arc.project_id = ? AND arc.character_id = ? AND arc.status <> 'abandoned'
        ORDER BY arc.updated_at DESC, arc.id, milestone.sort_index, milestone.id
        LIMIT ?`,
    )
    .all(projectId, characterId, limit + 1) as unknown as ArcMilestoneRow[];
  return { items: rows.slice(0, limit), truncated: rows.length > limit };
}

function versionHistory(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
  beforeCreatedAt: string | null,
  limit: number,
) {
  const rows = connection
    .prepare(
      `SELECT id AS versionId, chapter_id AS chapterId, title, description,
              version_type AS versionType, word_count AS wordCount,
              created_at AS createdAt,
              version_type = 'final' AS finalized
         FROM versions
        WHERE project_id = ? AND chapter_id = ?
          AND (? IS NULL OR created_at < ?)
        ORDER BY created_at DESC, id DESC
        LIMIT ?`,
    )
    .all(projectId, chapterId, beforeCreatedAt, beforeCreatedAt, limit + 1) as unknown as Array<{
      readonly versionId: string;
      readonly chapterId: string;
      readonly title: string;
      readonly description: string;
      readonly versionType: string;
      readonly wordCount: number;
      readonly createdAt: string;
      readonly finalized: number;
    }>;
  const items = rows.slice(0, limit).map((row) => ({ ...row, finalized: row.finalized === 1 }));
  return {
    items,
    nextBeforeCreatedAt: rows.length > limit ? (items.at(-1)?.createdAt ?? null) : null,
  };
}

function characterFacts(connection: DatabaseSync, projectId: string, characterId: string, limit: number) {
  return (
    connection
      .prepare(
        `SELECT id, fact_key AS key, value_json AS valueJson, description
           FROM canon_facts
          WHERE project_id = ? AND entity_id = ? AND status = 'active'
          ORDER BY fact_key, id
          LIMIT ?`,
      )
      .all(projectId, characterId, limit) as unknown as Array<{
      readonly id: string;
      readonly key: string;
      readonly valueJson: string;
      readonly description: string;
    }>
  ).map(({ valueJson, ...row }) => ({ ...row, value: parseJson(valueJson) }));
}

function characterStates(
  connection: DatabaseSync,
  projectId: string,
  characterId: string,
  chapterId: string | null,
  limit: number,
) {
  if (!chapterId) {
    return (
      connection
        .prepare(
          `SELECT id, state_key AS key, semantic_kind AS semanticKind, value_json AS valueJson,
                  valid_from_chapter_id AS validFromChapterId,
                  valid_until_chapter_id AS validUntilChapterId
             FROM entity_states
            WHERE project_id = ? AND entity_id = ? AND record_status = 'current'
            ORDER BY state_key, created_at DESC, id
            LIMIT ?`,
        )
        .all(projectId, characterId, limit) as unknown as Array<{
        readonly id: string;
        readonly key: string;
        readonly semanticKind: string;
        readonly valueJson: string;
        readonly validFromChapterId: string;
        readonly validUntilChapterId: string | null;
      }>
    ).map(({ valueJson, ...row }) => ({ ...row, value: parseJson(valueJson) }));
  }
  return (
    connection
      .prepare(
        `WITH anchor AS (
           SELECT chapter.order_key AS chapterOrder, volume.order_key AS volumeOrder
             FROM chapters chapter
             JOIN volumes volume ON volume.id = chapter.volume_id
            WHERE chapter.project_id = ? AND chapter.id = ?
         ), ranked AS (
           SELECT state.id, state.state_key AS key, state.semantic_kind AS semanticKind,
                  state.value_json AS valueJson,
                  state.valid_from_chapter_id AS validFromChapterId,
                  state.valid_until_chapter_id AS validUntilChapterId,
                  ROW_NUMBER() OVER (PARTITION BY state.state_key
                    ORDER BY start_volume.order_key DESC, start_chapter.order_key DESC,
                             state.created_at DESC, state.id DESC) AS rank
             FROM entity_states state
             JOIN chapters start_chapter ON start_chapter.id = state.valid_from_chapter_id
             JOIN volumes start_volume ON start_volume.id = start_chapter.volume_id
             LEFT JOIN chapters end_chapter ON end_chapter.id = state.valid_until_chapter_id
             LEFT JOIN volumes end_volume ON end_volume.id = end_chapter.volume_id
             CROSS JOIN anchor
            WHERE state.project_id = ? AND state.entity_id = ? AND state.record_status <> 'invalid'
              AND (
                start_volume.order_key < anchor.volumeOrder OR
                (start_volume.order_key = anchor.volumeOrder AND start_chapter.order_key <= anchor.chapterOrder)
              )
              AND (
                state.valid_until_chapter_id IS NULL OR
                anchor.volumeOrder < end_volume.order_key OR
                (anchor.volumeOrder = end_volume.order_key AND anchor.chapterOrder < end_chapter.order_key)
              )
         )
         SELECT id, key, semanticKind, valueJson, validFromChapterId, validUntilChapterId
           FROM ranked WHERE rank = 1
          ORDER BY key, id LIMIT ?`,
      )
      .all(projectId, chapterId, projectId, characterId, limit) as unknown as Array<{
      readonly id: string;
      readonly key: string;
      readonly semanticKind: string;
      readonly valueJson: string;
      readonly validFromChapterId: string;
      readonly validUntilChapterId: string | null;
    }>
  ).map(({ valueJson, ...row }) => ({ ...row, value: parseJson(valueJson) }));
}

function chapterCharacters(connection: DatabaseSync, projectId: string, chapterId: string, limit: number) {
  return connection
    .prepare(
      `SELECT DISTINCT entity.id, entity.entity_type AS entityType, entity.name,
              entity.summary, entity.status
         FROM scene_beat_entities link
         JOIN scene_beats beat ON beat.id = link.scene_beat_id
         JOIN entities entity ON entity.id = link.entity_id
        WHERE beat.project_id = ? AND beat.chapter_id = ?
          AND entity.project_id = ? AND entity.entity_type = 'character'
        ORDER BY entity.name, entity.id
        LIMIT ?`,
    )
    .all(projectId, chapterId, projectId, limit) as unknown as EntityRow[];
}

export class StoryKnowledgeProjectionService {
  constructor(private readonly workspace: ProjectWorkspaceService) {}

  project(rawInput: StoryKnowledgeProjectionInput): StoryKnowledgeProjection {
    const input = StoryKnowledgeProjectionInputSchema.parse(rawInput);
    return this.workspace.readProject(input.projectId, (connection) => {
      if ('chapterId' in input && input.chapterId) chapterExists(connection, input.projectId, input.chapterId);
      switch (input.view) {
        case 'character_card': {
          const character = entity(connection, input.projectId, input.characterId);
          const relationResult = relationships(
            connection,
            input.projectId,
            input.characterId,
            input.chapterId,
            input.limit,
          );
          return StoryKnowledgeProjectionSchema.parse({
            view: input.view,
            projectId: input.projectId,
            bounded: true,
            character,
            facts: characterFacts(connection, input.projectId, input.characterId, input.limit),
            states: characterStates(
              connection,
              input.projectId,
              input.characterId,
              input.chapterId,
              input.limit,
            ),
            relationships: relationResult.items,
          });
        }
        case 'relationships': {
          const center = entity(connection, input.projectId, input.characterId);
          const result = relationships(
            connection,
            input.projectId,
            input.characterId,
            input.chapterId,
            input.limit,
          );
          return StoryKnowledgeProjectionSchema.parse({
            view: input.view,
            projectId: input.projectId,
            bounded: true,
            center,
            relationships: result.items,
            truncated: result.truncated,
          });
        }
        case 'timeline': {
          const result = timeline(
            connection,
            input.projectId,
            input.chapterId,
            input.characterId,
            input.before,
            input.after,
          );
          return StoryKnowledgeProjectionSchema.parse({
            view: input.view,
            projectId: input.projectId,
            bounded: true,
            anchorChapterId: input.chapterId,
            ...result,
          });
        }
        case 'foreshadowing': {
          const result = foreshadowings(connection, input.projectId, input.chapterId, input.limit);
          return StoryKnowledgeProjectionSchema.parse({
            view: input.view,
            projectId: input.projectId,
            bounded: true,
            anchorChapterId: input.chapterId,
            ...result,
          });
        }
        case 'arc': {
          const character = entity(connection, input.projectId, input.characterId);
          const result = arcMilestones(connection, input.projectId, input.characterId, input.limit);
          return StoryKnowledgeProjectionSchema.parse({
            view: input.view,
            projectId: input.projectId,
            bounded: true,
            character,
            milestones: result.items,
            truncated: result.truncated,
          });
        }
        case 'history': {
          const result = versionHistory(
            connection,
            input.projectId,
            input.chapterId,
            input.beforeCreatedAt,
            input.limit,
          );
          return StoryKnowledgeProjectionSchema.parse({
            view: input.view,
            projectId: input.projectId,
            bounded: true,
            chapterId: input.chapterId,
            ...result,
          });
        }
        case 'chapter_assist': {
          const characters = chapterCharacters(connection, input.projectId, input.chapterId, input.limit);
          const characterIds = characters.map((item) => item.id);
          const relationItems = characterIds.flatMap((characterId) =>
            relationships(connection, input.projectId, characterId, input.chapterId, input.limit).items,
          );
          const uniqueRelationships = [...new Map(relationItems.map((item) => [item.id, item])).values()].slice(
            0,
            input.limit,
          );
          const timelineResult = timeline(
            connection,
            input.projectId,
            input.chapterId,
            null,
            Math.min(input.limit, 20),
            Math.min(input.limit, 20),
          );
          const foreshadowingResult = foreshadowings(
            connection,
            input.projectId,
            input.chapterId,
            input.limit,
          );
          const milestoneItems = characterIds
            .flatMap((characterId) =>
              arcMilestones(connection, input.projectId, characterId, input.limit).items,
            )
            .slice(0, input.limit);
          return StoryKnowledgeProjectionSchema.parse({
            view: input.view,
            projectId: input.projectId,
            bounded: true,
            chapterId: input.chapterId,
            characters,
            relationships: uniqueRelationships,
            timeline: timelineResult.items.slice(0, input.limit),
            foreshadowings: foreshadowingResult.items,
            milestones: milestoneItems,
          });
        }
      }
    });
  }
}
