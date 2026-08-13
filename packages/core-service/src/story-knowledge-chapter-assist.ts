import type { DatabaseSync } from 'node:sqlite';

import type { StoryKnowledgeProjectionInput } from '@worldforge/contracts';
import { sqliteResult } from './database/sqlite-result.js';

type ChapterAssistInput = Extract<
  StoryKnowledgeProjectionInput,
  { readonly view: 'chapter_assist' }
>;
type ForeshadowingInput = Extract<
  StoryKnowledgeProjectionInput,
  { readonly view: 'foreshadowing' }
>;

const CHAPTER_ASSIST_CHARACTER_LIMIT = 20;
const CHAPTER_ASSIST_PER_CHARACTER_LIMIT = 20;
const CHAPTER_ASSIST_TIMELINE_SIDE_LIMIT = 20;

interface EntityRow {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
}

interface ForeshadowingRow {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: string;
  readonly attention: 'none' | 'due' | 'overdue' | 'blocked';
  readonly revealFromChapterId: string | null;
  readonly revealByChapterId: string | null;
}

interface TimelineRow {
  readonly id: string;
  readonly title: string;
  readonly chapterId: string;
  readonly chapterTitle: string;
  readonly startValue: string;
  readonly endValue: string | null;
  readonly precision: string;
  readonly locationId: string | null;
}

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}

function chapterTitle(connection: DatabaseSync, projectId: string, chapterId: string): string {
  const row = sqliteResult<{ readonly title: string } | undefined>(
    connection
      .prepare(
        `SELECT chapter.title
         FROM chapters chapter
         JOIN volumes volume ON volume.id = chapter.volume_id
        WHERE chapter.id = ? AND volume.project_id = ?
          AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL`,
      )
      .get(chapterId, projectId),
  );
  if (!row) throw new Error('STORY_KNOWLEDGE_CHAPTER_MISSING');
  return row.title;
}

function previousChapter(connection: DatabaseSync, projectId: string, chapterId: string) {
  return (
    sqliteResult<
      | {
          readonly chapterId: string;
          readonly chapterTitle: string;
          readonly finalVersionId: string | null;
        }
      | undefined
    >(
      connection
        .prepare(
          `WITH anchor AS (
           SELECT chapter.order_key AS chapterOrder, volume.order_key AS volumeOrder
             FROM chapters chapter
             JOIN volumes volume ON volume.id = chapter.volume_id
            WHERE chapter.id = ? AND volume.project_id = ?
              AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL
         )
         SELECT chapter.id AS chapterId, chapter.title AS chapterTitle,
                chapter.final_version_id AS finalVersionId
           FROM chapters chapter
           JOIN volumes volume ON volume.id = chapter.volume_id
           CROSS JOIN anchor
          WHERE volume.project_id = ?
            AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL
            AND (
              volume.order_key < anchor.volumeOrder OR
              (volume.order_key = anchor.volumeOrder AND chapter.order_key < anchor.chapterOrder)
            )
          ORDER BY volume.order_key DESC, chapter.order_key DESC, chapter.id DESC
          LIMIT 1`,
        )
        .get(chapterId, projectId, projectId),
    ) ?? null
  );
}

function chapterGoal(connection: DatabaseSync, projectId: string, chapterId: string) {
  return (
    sqliteResult<
      | {
          readonly title: string;
          readonly goal: string;
          readonly coreConflict: string;
          readonly expectedResult: string;
        }
      | undefined
    >(
      connection
        .prepare(
          `SELECT node.title, node.goal, node.core_conflict AS coreConflict,
                node.expected_result AS expectedResult
           FROM scene_beats beat
           JOIN plot_nodes node
             ON node.id = beat.plot_node_id AND node.project_id = beat.project_id
          WHERE beat.project_id = ? AND beat.chapter_id = ? AND beat.deleted_at IS NULL
          ORDER BY beat.order_key, beat.id, node.order_key, node.id
          LIMIT 1`,
        )
        .get(projectId, chapterId),
    ) ?? null
  );
}

function sceneBeats(connection: DatabaseSync, projectId: string, chapterId: string, limit: number) {
  const rows = sqliteResult<
    Array<{
      readonly id: string;
      readonly title: string;
      readonly goal: string;
      readonly required: number | bigint;
      readonly wordTargetPercent: number | bigint;
    }>
  >(
    connection
      .prepare(
        `SELECT id, title, goal, is_required AS required,
              word_target_percent AS wordTargetPercent
         FROM scene_beats
        WHERE project_id = ? AND chapter_id = ? AND deleted_at IS NULL
        ORDER BY order_key, id
        LIMIT ?`,
      )
      .all(projectId, chapterId, limit),
  );
  return rows.map((row) => ({
    ...row,
    required: Number(row.required) === 1,
    wordTargetPercent: Number(row.wordTargetPercent),
  }));
}

function chapterCharacterRows(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
  limit: number,
): EntityRow[] {
  return sqliteResult<EntityRow[]>(
    connection
      .prepare(
        `SELECT DISTINCT entity.id, entity.name, entity.summary
         FROM scene_beat_entities link
         JOIN scene_beats beat
           ON beat.id = link.scene_beat_id AND beat.project_id = link.project_id
         JOIN entities entity
           ON entity.id = link.entity_id AND entity.project_id = link.project_id
        WHERE beat.project_id = ? AND beat.chapter_id = ? AND beat.deleted_at IS NULL
          AND entity.entity_type = 'character' AND entity.status = 'active'
        ORDER BY entity.name, entity.id
        LIMIT ?`,
      )
      .all(projectId, chapterId, limit),
  );
}

function characterStates(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
  characterId: string,
  limit: number,
) {
  const rows = sqliteResult<
    Array<{
      readonly key: string;
      readonly valueJson: string;
    }>
  >(
    connection
      .prepare(
        `WITH anchor AS (
         SELECT chapter.order_key AS chapterOrder, volume.order_key AS volumeOrder
           FROM chapters chapter
           JOIN volumes volume ON volume.id = chapter.volume_id
          WHERE chapter.id = ? AND volume.project_id = ?
            AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL
       ), ranked AS (
         SELECT state.state_key AS key, state.value_json AS valueJson,
                ROW_NUMBER() OVER (
                  PARTITION BY state.state_key
                  ORDER BY start_volume.order_key DESC, start_chapter.order_key DESC,
                           state.created_at DESC, state.id DESC
                ) AS rank
           FROM entity_states state
           JOIN chapters start_chapter ON start_chapter.id = state.valid_from_chapter_id
           JOIN volumes start_volume ON start_volume.id = start_chapter.volume_id
           LEFT JOIN chapters end_chapter ON end_chapter.id = state.valid_until_chapter_id
           LEFT JOIN volumes end_volume ON end_volume.id = end_chapter.volume_id
           CROSS JOIN anchor
          WHERE state.project_id = ? AND state.entity_id = ?
            AND state.record_status NOT IN ('invalid', 'superseded')
            AND (
              start_volume.order_key < anchor.volumeOrder OR
              (start_volume.order_key = anchor.volumeOrder
                AND start_chapter.order_key <= anchor.chapterOrder)
            )
            AND (
              state.valid_until_chapter_id IS NULL OR
              anchor.volumeOrder < end_volume.order_key OR
              (anchor.volumeOrder = end_volume.order_key
                AND anchor.chapterOrder < end_chapter.order_key)
            )
       )
       SELECT key, valueJson
         FROM ranked
        WHERE rank = 1
        ORDER BY key
        LIMIT ?`,
      )
      .all(chapterId, projectId, projectId, characterId, limit),
  );
  return rows.map((row) => ({ key: row.key, value: parseJson(row.valueJson) }));
}

function characterKnowledge(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
  characterId: string,
  limit: number,
) {
  return sqliteResult<
    Array<{
      readonly information: string;
      readonly status: 'knows' | 'believes' | 'suspects' | 'misunderstands' | 'unknown';
    }>
  >(
    connection
      .prepare(
        `WITH anchor AS (
         SELECT chapter.order_key AS chapterOrder, volume.order_key AS volumeOrder
           FROM chapters chapter
           JOIN volumes volume ON volume.id = chapter.volume_id
          WHERE chapter.id = ? AND volume.project_id = ?
            AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL
       ), ranked AS (
         SELECT state.information_key AS information, state.knowledge_status AS status,
                ROW_NUMBER() OVER (
                  PARTITION BY state.information_key
                  ORDER BY start_volume.order_key DESC, start_chapter.order_key DESC,
                           state.created_at DESC, state.id DESC
                ) AS rank
           FROM knowledge_states state
           JOIN chapters start_chapter ON start_chapter.id = state.valid_from_chapter_id
           JOIN volumes start_volume ON start_volume.id = start_chapter.volume_id
           LEFT JOIN chapters end_chapter ON end_chapter.id = state.valid_until_chapter_id
           LEFT JOIN volumes end_volume ON end_volume.id = end_chapter.volume_id
           CROSS JOIN anchor
          WHERE state.project_id = ? AND state.character_id = ?
            AND state.record_status <> 'invalid'
            AND (
              start_volume.order_key < anchor.volumeOrder OR
              (start_volume.order_key = anchor.volumeOrder
                AND start_chapter.order_key <= anchor.chapterOrder)
            )
            AND (
              state.valid_until_chapter_id IS NULL OR
              anchor.volumeOrder < end_volume.order_key OR
              (anchor.volumeOrder = end_volume.order_key
                AND anchor.chapterOrder < end_chapter.order_key)
            )
       )
       SELECT information, status
         FROM ranked
        WHERE rank = 1
        ORDER BY information
        LIMIT ?`,
      )
      .all(chapterId, projectId, projectId, characterId, limit),
  );
}

function chapterCharacters(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
  limit: number,
) {
  const perCharacterLimit = Math.min(limit, CHAPTER_ASSIST_PER_CHARACTER_LIMIT);
  return chapterCharacterRows(
    connection,
    projectId,
    chapterId,
    Math.min(limit, CHAPTER_ASSIST_CHARACTER_LIMIT),
  ).map((row) => ({
    ...row,
    states: characterStates(connection, projectId, chapterId, row.id, perCharacterLimit),
    knowledge: characterKnowledge(connection, projectId, chapterId, row.id, perCharacterLimit),
  }));
}

function chapterRelationships(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
  limit: number,
) {
  return sqliteResult<
    Array<{
      readonly id: string;
      readonly fromCharacterId: string;
      readonly fromCharacterName: string;
      readonly toCharacterId: string;
      readonly toCharacterName: string;
      readonly category: string;
      readonly label: string;
      readonly validFromChapterId: string;
      readonly validUntilChapterId: string | null;
    }>
  >(
    connection
      .prepare(
        `WITH anchor AS (
         SELECT chapter.order_key AS chapterOrder, volume.order_key AS volumeOrder
           FROM chapters chapter
           JOIN volumes volume ON volume.id = chapter.volume_id
          WHERE chapter.id = ? AND volume.project_id = ?
            AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL
       ), chapter_characters AS (
         SELECT DISTINCT link.entity_id AS entityId
           FROM scene_beat_entities link
           JOIN scene_beats beat
             ON beat.id = link.scene_beat_id AND beat.project_id = link.project_id
           JOIN entities entity
             ON entity.id = link.entity_id AND entity.project_id = link.project_id
          WHERE beat.project_id = ? AND beat.chapter_id = ? AND beat.deleted_at IS NULL
            AND entity.entity_type = 'character' AND entity.status = 'active'
          LIMIT ${CHAPTER_ASSIST_CHARACTER_LIMIT}
       )
       SELECT relationship.id,
              relationship.from_character_id AS fromCharacterId,
              source.name AS fromCharacterName,
              relationship.to_character_id AS toCharacterId,
              target.name AS toCharacterName,
              relationship.category, relationship.label,
              relationship.valid_from_chapter_id AS validFromChapterId,
              relationship.valid_until_chapter_id AS validUntilChapterId
         FROM character_relationships relationship
         JOIN entities source
           ON source.id = relationship.from_character_id
          AND source.project_id = relationship.project_id
         JOIN entities target
           ON target.id = relationship.to_character_id
          AND target.project_id = relationship.project_id
         JOIN chapters start_chapter ON start_chapter.id = relationship.valid_from_chapter_id
         JOIN volumes start_volume ON start_volume.id = start_chapter.volume_id
         LEFT JOIN chapters end_chapter ON end_chapter.id = relationship.valid_until_chapter_id
         LEFT JOIN volumes end_volume ON end_volume.id = end_chapter.volume_id
         CROSS JOIN anchor
        WHERE relationship.project_id = ? AND relationship.record_status <> 'invalid'
          AND (
            relationship.from_character_id IN (SELECT entityId FROM chapter_characters)
            OR relationship.to_character_id IN (SELECT entityId FROM chapter_characters)
          )
          AND (
            start_volume.order_key < anchor.volumeOrder OR
            (start_volume.order_key = anchor.volumeOrder
              AND start_chapter.order_key <= anchor.chapterOrder)
          )
          AND (
            relationship.valid_until_chapter_id IS NULL OR
            anchor.volumeOrder < end_volume.order_key OR
            (anchor.volumeOrder = end_volume.order_key
              AND anchor.chapterOrder < end_chapter.order_key)
          )
        ORDER BY relationship.category, relationship.label,
                 source.name, target.name, relationship.id
        LIMIT ?`,
      )
      .all(chapterId, projectId, projectId, chapterId, projectId, limit),
  );
}

function timelineSide(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
  direction: 'before' | 'after',
  limit: number,
): TimelineRow[] {
  const before = direction === 'before';
  return sqliteResult<TimelineRow[]>(
    connection
      .prepare(
        `WITH anchor AS (
         SELECT chapter.order_key AS chapterOrder, volume.order_key AS volumeOrder
           FROM chapters chapter
           JOIN volumes volume ON volume.id = chapter.volume_id
          WHERE chapter.id = ? AND volume.project_id = ?
            AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL
       )
       SELECT event.id, event.title, event.chapter_id AS chapterId,
              chapter.title AS chapterTitle, event.start_value AS startValue,
              event.end_value AS endValue, event.precision, event.location_id AS locationId
         FROM timeline_events event
         JOIN chapters chapter ON chapter.id = event.chapter_id
         JOIN volumes volume ON volume.id = chapter.volume_id
         CROSS JOIN anchor
        WHERE event.project_id = ? AND event.status = 'active'
          AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL
          AND (
            volume.order_key ${before ? '<' : '>'} anchor.volumeOrder OR
            (volume.order_key = anchor.volumeOrder
              AND chapter.order_key ${before ? '<=' : '>'} anchor.chapterOrder)
          )
        ORDER BY volume.order_key ${before ? 'DESC' : 'ASC'},
                 chapter.order_key ${before ? 'DESC' : 'ASC'},
                 event.start_value ${before ? 'DESC' : 'ASC'}, event.id ${before ? 'DESC' : 'ASC'}
        LIMIT ?`,
      )
      .all(chapterId, projectId, projectId, limit),
  );
}

function chapterTimeline(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
  limit: number,
) {
  const sideLimit = Math.min(limit, CHAPTER_ASSIST_TIMELINE_SIDE_LIMIT);
  const before = timelineSide(connection, projectId, chapterId, 'before', sideLimit);
  const after = timelineSide(connection, projectId, chapterId, 'after', sideLimit);
  return [...before.reverse(), ...after].slice(0, limit);
}

function foreshadowingRows(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
  limit: number,
): { readonly items: ForeshadowingRow[]; readonly truncated: boolean } {
  const rows = sqliteResult<ForeshadowingRow[]>(
    connection
      .prepare(
        `WITH anchor AS (
         SELECT chapter.order_key AS chapterOrder, volume.order_key AS volumeOrder
           FROM chapters chapter
           JOIN volumes volume ON volume.id = chapter.volume_id
          WHERE chapter.id = ? AND volume.project_id = ?
            AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL
       )
       SELECT item.id, item.title, item.description, item.status,
              CASE
                WHEN item.status = 'revealed' THEN 'none'
                WHEN EXISTS (
                  SELECT 1
                    FROM foreshadowing_relations relation
                    JOIN foreshadowings target
                      ON target.id = relation.target_foreshadowing_id
                     AND target.project_id = relation.project_id
                   WHERE relation.project_id = item.project_id
                     AND relation.source_foreshadowing_id = item.id
                     AND relation.relation_kind IN ('depends_on', 'blocks')
                     AND target.status NOT IN ('revealed', 'cancelled')
                ) THEN 'blocked'
                WHEN item.reveal_by_chapter_id IS NOT NULL AND (
                  reveal_by_volume.order_key < anchor.volumeOrder OR
                  (reveal_by_volume.order_key = anchor.volumeOrder
                    AND reveal_by.order_key < anchor.chapterOrder)
                ) THEN 'overdue'
                WHEN item.reveal_from_chapter_id IS NOT NULL AND (
                  reveal_from_volume.order_key < anchor.volumeOrder OR
                  (reveal_from_volume.order_key = anchor.volumeOrder
                    AND reveal_from.order_key <= anchor.chapterOrder)
                ) THEN 'due'
                ELSE 'none'
              END AS attention,
              item.reveal_from_chapter_id AS revealFromChapterId,
              item.reveal_by_chapter_id AS revealByChapterId
         FROM foreshadowings item
         LEFT JOIN chapters reveal_from ON reveal_from.id = item.reveal_from_chapter_id
         LEFT JOIN volumes reveal_from_volume ON reveal_from_volume.id = reveal_from.volume_id
         LEFT JOIN chapters reveal_by ON reveal_by.id = item.reveal_by_chapter_id
         LEFT JOIN volumes reveal_by_volume ON reveal_by_volume.id = reveal_by.volume_id
         CROSS JOIN anchor
        WHERE item.project_id = ? AND item.status <> 'cancelled'
          AND (
            EXISTS (
              SELECT 1
                FROM foreshadowing_chapters link
               WHERE link.project_id = item.project_id
                 AND link.foreshadowing_id = item.id AND link.chapter_id = ?
            )
            OR item.reveal_from_chapter_id = ?
            OR item.reveal_by_chapter_id = ?
            OR item.status <> 'revealed'
          )
        ORDER BY attention = 'blocked' DESC, attention = 'overdue' DESC,
                 attention = 'due' DESC, item.status = 'revealed',
                 COALESCE(reveal_from_volume.order_key, 2147483647),
                 COALESCE(reveal_from.order_key, 2147483647), item.updated_at DESC, item.id
        LIMIT ?`,
      )
      .all(chapterId, projectId, projectId, chapterId, chapterId, chapterId, limit + 1),
  );
  return { items: rows.slice(0, limit), truncated: rows.length > limit };
}

function chapterMilestones(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
  limit: number,
) {
  const rows = sqliteResult<
    Array<{
      readonly id: string;
      readonly arcId: string;
      readonly arcTitle: string;
      readonly title: string;
      readonly description: string;
      readonly status: string;
      readonly plannedChapterId: string | null;
      readonly actualChapterId: string | null;
      readonly sortIndex: number | bigint;
    }>
  >(
    connection
      .prepare(
        `WITH chapter_characters AS (
         SELECT DISTINCT link.entity_id AS entityId
           FROM scene_beat_entities link
           JOIN scene_beats beat
             ON beat.id = link.scene_beat_id AND beat.project_id = link.project_id
           JOIN entities entity
             ON entity.id = link.entity_id AND entity.project_id = link.project_id
          WHERE beat.project_id = ? AND beat.chapter_id = ? AND beat.deleted_at IS NULL
            AND entity.entity_type = 'character' AND entity.status = 'active'
          LIMIT ${CHAPTER_ASSIST_CHARACTER_LIMIT}
       )
       SELECT milestone.id, milestone.arc_id AS arcId, arc.title AS arcTitle,
              milestone.title, milestone.description, milestone.status,
              milestone.planned_chapter_id AS plannedChapterId,
              milestone.actual_chapter_id AS actualChapterId,
              milestone.sort_index AS sortIndex
         FROM character_arcs arc
         JOIN arc_milestones milestone
           ON milestone.project_id = arc.project_id AND milestone.arc_id = arc.id
        WHERE arc.project_id = ? AND arc.status <> 'abandoned'
          AND arc.character_id IN (SELECT entityId FROM chapter_characters)
        ORDER BY arc.updated_at DESC, arc.id, milestone.sort_index, milestone.id
        LIMIT ?`,
      )
      .all(projectId, chapterId, projectId, limit),
  );
  return rows.map((row) => ({ ...row, sortIndex: Number(row.sortIndex) }));
}

function chapterTodos(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
  limit: number,
) {
  return connection
    .prepare(
      `SELECT id AS todoId, project_id AS projectId, chapter_id AS chapterId,
              scene_beat_id AS sceneBeatId, logical_block_id AS logicalBlockId,
              validation_issue_id AS validationIssueId, title, status,
              created_at AS createdAt, updated_at AS updatedAt, completed_at AS completedAt
         FROM story_todos
        WHERE project_id = ? AND chapter_id = ? AND status = 'open'
        ORDER BY updated_at DESC, id
        LIMIT ?`,
    )
    .all(projectId, chapterId, limit);
}

export function projectForeshadowingLane(connection: DatabaseSync, input: ForeshadowingInput) {
  const result = foreshadowingRows(connection, input.projectId, input.chapterId, input.limit);
  return {
    view: input.view,
    projectId: input.projectId,
    bounded: true as const,
    anchorChapterId: input.chapterId,
    ...result,
  };
}

export function projectChapterAssist(connection: DatabaseSync, input: ChapterAssistInput) {
  return {
    view: input.view,
    projectId: input.projectId,
    bounded: true as const,
    chapterId: input.chapterId,
    chapterTitle: chapterTitle(connection, input.projectId, input.chapterId),
    goal: chapterGoal(connection, input.projectId, input.chapterId),
    sceneBeats: sceneBeats(connection, input.projectId, input.chapterId, input.limit),
    characters: chapterCharacters(connection, input.projectId, input.chapterId, input.limit),
    relationships: chapterRelationships(connection, input.projectId, input.chapterId, input.limit),
    timeline: chapterTimeline(connection, input.projectId, input.chapterId, input.limit),
    foreshadowings: foreshadowingRows(connection, input.projectId, input.chapterId, input.limit)
      .items,
    milestones: chapterMilestones(connection, input.projectId, input.chapterId, input.limit),
    todos: chapterTodos(connection, input.projectId, input.chapterId, input.limit),
    previousChapter: previousChapter(connection, input.projectId, input.chapterId),
  };
}
