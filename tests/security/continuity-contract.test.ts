import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  CONTINUITY_COMMANDS,
  ContinuityListCommandSchema,
  EntityStateSetCommandSchema,
  KnowledgeStateSetCommandSchema,
  PROTOCOL_VERSION,
  TimelineEventSaveCommandSchema,
} from '@worldforge/contracts';

const envelope = (command: string, payload: unknown) => ({
  protocolVersion: PROTOCOL_VERSION,
  requestId: randomUUID(),
  command,
  payload,
  sentAt: '2026-07-19T12:00:00.000Z',
});

describe('continuity IPC contracts', () => {
  it('rejects unknown command and payload fields before Core execution', () => {
    expect(
      ContinuityListCommandSchema.safeParse({
        ...envelope(CONTINUITY_COMMANDS.listContinuity, {
          projectId: randomUUID(),
          query: '',
          includeHistory: true,
          effectiveAtChapterId: null,
          databasePath: '/tmp/project.sqlite',
        }),
      }).success,
    ).toBe(false);

    expect(
      EntityStateSetCommandSchema.safeParse({
        ...envelope(CONTINUITY_COMMANDS.setEntityState, {
          projectId: randomUUID(),
          authority: 'author',
          entityId: randomUUID(),
          stateKey: 'health',
          value: 'well',
          validFromChapterId: randomUUID(),
          validUntilChapterId: null,
          evidence: [],
          sourceVersionId: randomUUID(),
          id: randomUUID(),
        }),
      }).success,
    ).toBe(false);

    expect(
      TimelineEventSaveCommandSchema.safeParse({
        ...envelope(CONTINUITY_COMMANDS.saveTimelineEvent, {
          projectId: randomUUID(),
          authority: 'author',
          eventId: null,
          title: '事件',
          startValue: '2026-01-01',
          endValue: null,
          precision: 'day',
          chapterId: null,
          locationId: null,
          description: '',
          participantIds: [],
          dependencyIds: [],
          orderKey: '1024',
        }),
      }).success,
    ).toBe(false);

    expect(
      KnowledgeStateSetCommandSchema.safeParse({
        ...envelope(CONTINUITY_COMMANDS.setKnowledgeState, {
          projectId: randomUUID(),
          authority: 'author',
          informationKey: 'secret',
          characterId: randomUUID(),
          knowledgeStatus: 'unknown',
          acquiredChapterId: null,
          sourceBlockId: null,
          sourceVersionId: null,
          notes: '',
          sql: 'DELETE FROM knowledge_states',
        }),
      }).success,
    ).toBe(false);
  });
});
