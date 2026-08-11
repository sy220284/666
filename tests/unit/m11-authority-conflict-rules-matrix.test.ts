import type { DatabaseSync } from 'node:sqlite';

import { describe, expect, it } from 'vitest';

import { authorityConflictRules } from '../../packages/core-service/src/validation/authority-conflict-rules.js';

const projectId = '00000000-0000-4000-8000-000000000001';
const versionId = '00000000-0000-4000-8000-000000000002';
const chapter1 = '00000000-0000-4000-8000-000000000011';
const chapter2 = '00000000-0000-4000-8000-000000000012';
const chapter3 = '00000000-0000-4000-8000-000000000013';

function database(entityStates?: ReturnType<typeof state>[]): DatabaseSync {
  return {
    prepare(sql: string) {
      return {
        all() {
          if (sql.includes('FROM chapters chapter')) {
            return [
              { id: chapter1, volumeOrder: 1, chapterOrder: 1 },
              { id: chapter2, volumeOrder: 1, chapterOrder: 2 },
              { id: chapter3, volumeOrder: 1, chapterOrder: 3 },
            ];
          }
          if (sql.includes('FROM entity_states')) {
            return (
              entityStates ?? [
                state('dead', 'character-a', 'life_status', 'life_status', 'dead', chapter1, null),
                state('age-30', 'character-a', 'age', 'age', 30, chapter1, chapter2),
                state('age-20', 'character-a', 'age', 'age', 20, chapter2, null),
                state(
                  'location-a',
                  'character-a',
                  'where',
                  'location',
                  'location-a',
                  chapter1,
                  chapter3,
                ),
                state(
                  'location-b',
                  'character-a',
                  'where',
                  'location',
                  'location-b',
                  chapter2,
                  null,
                ),
                state(
                  'item-a',
                  'unique-item',
                  'owner',
                  'holder',
                  'character-a',
                  chapter1,
                  chapter3,
                ),
                state('item-b', 'unique-item', 'owner', 'holder', 'character-b', chapter2, null),
                state('alive-a', 'character-b', '生命', 'life_status', 'alive', chapter1, chapter3),
                state('alive-b', 'character-b', '生命', 'life_status', 'dead', chapter2, null),
              ]
            );
          }
          if (sql.includes('FROM timeline_events')) {
            return [
              event('event-a', '后继事件', '2026-02-01', 'location-a'),
              event('event-b', '前置事件', '2026-03-01', 'location-b'),
              event('event-c', '同时异地事件', '2026-02-01', 'location-b'),
            ];
          }
          if (sql.includes('FROM timeline_event_dependencies')) {
            return [
              { eventId: 'event-a', dependencyId: 'event-b' },
              { eventId: 'event-b', dependencyId: 'event-a' },
              { eventId: 'event-a', dependencyId: 'missing-event' },
            ];
          }
          if (sql.includes('FROM timeline_event_entities')) {
            return [
              { eventId: 'event-a', entityId: 'character-a' },
              { eventId: 'event-b', entityId: 'character-a' },
              { eventId: 'event-c', entityId: 'character-a' },
            ];
          }
          if (sql.includes('FROM knowledge_states knowledge')) {
            return [
              {
                id: 'knowledge-a',
                characterId: 'character-a',
                informationKey: '北城密令',
                validFromChapterId: chapter1,
                sourceVersionId: 'source-version',
                sourceLogicalBlockId: 'source-block',
                sourceChapterId: chapter2,
              },
            ];
          }
          if (sql.includes('LEFT JOIN foreshadowing_chapters')) {
            return [
              {
                id: 'foreshadowing-a',
                title: '密令伏笔',
                status: 'planted',
                revealByChapterId: chapter2,
                chapterId: chapter2,
                role: 'plant',
              },
              {
                id: 'foreshadowing-a',
                title: '密令伏笔',
                status: 'planted',
                revealByChapterId: chapter2,
                chapterId: chapter1,
                role: 'reveal',
              },
            ];
          }
          if (sql.includes('FROM foreshadowing_relations relation')) {
            return [
              {
                sourceId: 'foreshadowing-a',
                sourceTitle: '密令伏笔',
                targetId: 'foreshadowing-b',
                targetStatus: 'planned',
              },
            ];
          }
          throw new Error(`Unexpected query: ${sql}`);
        },
      };
    },
  } as unknown as DatabaseSync;
}

function state(
  id: string,
  entityId: string,
  stateKey: string,
  semanticKind: string,
  value: unknown,
  validFromChapterId: string,
  validUntilChapterId: string | null,
) {
  return {
    id,
    entityId,
    stateKey,
    semanticKind,
    valueJson: JSON.stringify(value),
    validFromChapterId,
    validUntilChapterId,
    evidenceJson: JSON.stringify([{ targetId: `${id}-block` }]),
    sourceVersionId: `${id}-version`,
  };
}

function event(id: string, title: string, startValue: string, locationId: string) {
  return {
    id,
    title,
    startValue,
    endValue: null,
    precision: 'day',
    locationId,
  };
}

describe('M11 authority conflict rule matrix', () => {
  it('covers deterministic state, timeline, knowledge and foreshadowing conflicts', () => {
    const issues = authorityConflictRules(database(), {
      versionId,
      projectId,
      chapterId: chapter3,
      finalVersionId: versionId,
      contentHash: 'a'.repeat(64),
    });
    const types = new Set(issues.map((item) => item.issueType));

    expect(types).toEqual(
      new Set([
        'authority.character_after_death',
        'authority.age_reversal',
        'authority.exclusive_location_overlap',
        'authority.life_state_overlap',
        'authority.unique_item_multiple_holders',
        'authority.timeline_dependency_missing',
        'authority.timeline_dependency_reversed',
        'authority.timeline_dependency_cycle',
        'authority.timeline_simultaneous_locations',
        'authority.knowledge_before_source',
        'authority.foreshadowing_reveal_before_plant',
        'authority.foreshadowing_overdue',
        'authority.foreshadowing_dependency_unmet',
      ]),
    );
    expect(issues.every((item) => item.currentEvidenceIds?.length)).toBe(true);
    expect(issues.every((item) => item.conflictEvidenceIds?.length)).toBe(true);
  });

  it('treats an explicit alive fact as the end of a death interval', () => {
    const issues = authorityConflictRules(
      database([
        state('dead', 'character-a', 'life', 'life_status', 'dead', chapter1, chapter2),
        state('alive', 'character-a', 'life', 'life_status', 'alive', chapter2, null),
        state('health', 'character-a', 'health', 'health', 'well', chapter3, null),
      ]),
      {
        versionId,
        projectId,
        chapterId: chapter3,
        finalVersionId: versionId,
        contentHash: 'a'.repeat(64),
      },
    );

    expect(issues.some((item) => item.issueType === 'authority.character_after_death')).toBe(false);
  });
});
