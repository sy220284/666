import type { DatabaseSync } from 'node:sqlite';

import type { StateProposal, StateProposalDraft } from '@worldforge/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { contractInput } from '../testkit/strict-test-doubles.js';

const calls = vi.hoisted(() => ({
  validateChapterRange: vi.fn(),
  entityState: vi.fn(),
  knowledge: vi.fn(),
  timeline: vi.fn(),
  relationship: vi.fn(() => 'relationship-id'),
  entityCreate: vi.fn(() => 'entity-id'),
  canonFact: vi.fn(() => 'fact-id'),
  milestone: vi.fn(),
  foreshadowing: vi.fn(),
}));

vi.mock('../../packages/core-service/src/continuity-validation.js', () => ({
  validateChapterRange: calls.validateChapterRange,
}));
vi.mock('../../packages/core-service/src/continuity-state.js', () => ({
  applyEntityStateInTransaction: calls.entityState,
  applyKnowledgeState: calls.knowledge,
}));
vi.mock('../../packages/core-service/src/continuity-timeline.js', () => ({
  applyTimelineEvent: calls.timeline,
}));
vi.mock('../../packages/core-service/src/continuity-relationship.js', () => ({
  applyCharacterRelationshipInTransaction: calls.relationship,
}));
vi.mock('../../packages/core-service/src/entity-canon.js', () => ({
  applyEntityCreate: calls.entityCreate,
  applyCanonFact: calls.canonFact,
}));
vi.mock('../../packages/core-service/src/narrative-planning/character-arc-operations.js', () => ({
  applyArcMilestoneTransitionInTransaction: calls.milestone,
}));
vi.mock('../../packages/core-service/src/narrative-planning/foreshadowing-operations.js', () => ({
  applyForeshadowingTransition: calls.foreshadowing,
}));

import {
  applyStateProposalInTransaction,
  stateProposalInsertShape,
} from '../../packages/core-service/src/state/proposal-authority-operations.js';
import { StateProposalServiceError } from '../../packages/core-service/src/state/state-row-mappers.js';

const ids = {
  project: '11111111-1111-4111-8111-111111111111',
  chapter: '22222222-2222-4222-8222-222222222222',
  entity: '33333333-3333-4333-8333-333333333333',
  secondEntity: '44444444-4444-4444-8444-444444444444',
  timeline: '55555555-5555-4555-8555-555555555555',
  foreshadowing: '66666666-6666-4666-8666-666666666666',
  milestone: '77777777-7777-4777-8777-777777777777',
  proposal: '88888888-8888-4888-8888-888888888888',
  batch: '99999999-9999-4999-8999-999999999999',
  version: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
};

interface DbRows {
  readonly entities?: Readonly<Record<string, string>>;
  readonly entityState?: unknown;
  readonly knowledge?: unknown;
  readonly timeline?: unknown;
  readonly relationship?: unknown;
  readonly foreshadowing?: unknown;
  readonly milestone?: unknown;
  readonly duplicate?: unknown;
  readonly canonFact?: unknown;
}

function database(rows: DbRows = {}): DatabaseSync {
  return contractInput<DatabaseSync>({
    prepare: (sql: string) => ({
      get: (...args: unknown[]) => {
        if (sql.includes('FROM entities WHERE id = ?')) {
          const entityId = String(args[0]);
          const entityType = rows.entities?.[entityId];
          return entityType ? { entityType } : undefined;
        }
        if (sql.includes('FROM entity_states')) return rows.entityState;
        if (sql.includes('FROM knowledge_states')) return rows.knowledge;
        if (sql.includes('FROM timeline_events')) return rows.timeline;
        if (sql.includes('FROM character_relationships')) return rows.relationship;
        if (sql.includes('FROM foreshadowings')) return rows.foreshadowing;
        if (sql.includes('FROM arc_milestones')) return rows.milestone;
        if (sql.includes('lower(name) = lower(?)')) return rows.duplicate;
        if (sql.includes('FROM canon_facts')) return rows.canonFact;
        throw new Error(`UNEXPECTED_SQL:${sql}`);
      },
    }),
  });
}

function draft(value: unknown): StateProposalDraft {
  return contractInput<StateProposalDraft>(value);
}

function proposal(
  value: Partial<StateProposal> & Pick<StateProposal, 'proposalType' | 'target'>,
): StateProposal {
  return contractInput<StateProposal>({
    id: ids.proposal,
    batchId: ids.batch,
    generationRunId: null,
    projectId: ids.project,
    chapterId: ids.chapter,
    sourceVersionId: ids.version,
    source: 'provider_stub',
    previousValue: null,
    proposedValue: null,
    evidence: [{ kind: 'logicalBlock', targetId: 'block-1', note: 'evidence' }],
    confidence: 0.8,
    status: 'pending',
    freshness: 'current',
    actionability: 'accept',
    resolvedValue: null,
    createdAt: '2026-08-17T00:00:00.000Z',
    resolvedAt: null,
    ...value,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.relationship.mockReturnValue('relationship-id');
  calls.entityCreate.mockReturnValue('entity-id');
  calls.canonFact.mockReturnValue('fact-id');
});

describe('proposal authority insert-shape edge coverage', () => {
  it('captures current entity/knowledge/relationship/fact values and normalizes keys', () => {
    const db = database({
      entities: { [ids.entity]: 'character', [ids.secondEntity]: 'character' },
      entityState: { valueJson: '"dead"', semanticKind: 'life_status', validUntilChapterId: null },
      knowledge: { knowledgeStatus: 'knows', validUntilChapterId: null, notes: 'known' },
      relationship: { validUntilChapterId: ids.chapter },
      canonFact: { valueJson: '42', description: 'answer' },
    });
    expect(
      stateProposalInsertShape(
        db,
        ids.project,
        ids.chapter,
        draft({
          proposalType: 'entity_state',
          entityId: ids.entity,
          stateKey: '  Alive  ',
          semanticKind: 'life_status',
          proposedValue: 'alive',
          validUntilChapterId: null,
        }),
      ),
    ).toMatchObject({
      target: { targetType: 'entity_state', stateKey: 'Alive' },
      previousValue: { value: 'dead', semanticKind: 'life_status' },
    });
    expect(
      stateProposalInsertShape(
        db,
        ids.project,
        ids.chapter,
        draft({
          proposalType: 'knowledge_state',
          characterId: ids.entity,
          informationKey: ' Secret ',
          proposedKnowledge: { knowledgeStatus: 'knows', validUntilChapterId: null, notes: '' },
        }),
      ),
    ).toMatchObject({
      previousValue: { knowledgeStatus: 'knows' },
      targetKey: `knowledge:${ids.entity}:Secret`,
    });
    expect(
      stateProposalInsertShape(
        db,
        ids.project,
        ids.chapter,
        draft({
          proposalType: 'character_relationship',
          fromCharacterId: ids.entity,
          toCharacterId: ids.secondEntity,
          proposedRelationship: {
            category: 'alliance',
            label: ' 同伴 ',
            validUntilChapterId: null,
          },
        }),
      ),
    ).toMatchObject({
      target: { targetType: 'character_relationship', label: '同伴' },
      previousValue: { validUntilChapterId: ids.chapter },
      proposedValue: { label: '同伴' },
    });
    expect(
      stateProposalInsertShape(
        db,
        ids.project,
        ids.chapter,
        draft({
          proposalType: 'canon_fact',
          entityId: ids.entity,
          factKey: ' Origin ',
          proposedFact: { value: '江南', description: '' },
        }),
      ),
    ).toMatchObject({
      previousValue: { value: 42, description: 'answer' },
      targetKey: `canon-fact:${ids.entity}:Origin`,
    });
    expect(calls.validateChapterRange).toHaveBeenCalledTimes(3);
  });

  it('preserves a null stored state value in defensive row mapping', () => {
    const shape = stateProposalInsertShape(
      database({
        entities: { [ids.entity]: 'character' },
        entityState: { valueJson: null, semanticKind: 'health', validUntilChapterId: null },
      }),
      ids.project,
      ids.chapter,
      draft({
        proposalType: 'entity_state',
        entityId: ids.entity,
        stateKey: 'health',
        semanticKind: 'health',
        proposedValue: 'healthy',
        validUntilChapterId: null,
      }),
    );
    expect(shape.previousValue).toEqual({
      value: null,
      semanticKind: 'health',
      validUntilChapterId: null,
    });
  });

  it('covers missing active entities and expected character type mismatch', () => {
    expect(() =>
      stateProposalInsertShape(
        database(),
        ids.project,
        ids.chapter,
        draft({
          proposalType: 'entity_state',
          entityId: ids.entity,
          stateKey: 'alive',
          semanticKind: 'life_status',
          proposedValue: 'alive',
          validUntilChapterId: null,
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'STATE_PROPOSAL_NOT_FOUND' }));
    expect(() =>
      stateProposalInsertShape(
        database({ entities: { [ids.entity]: 'location' } }),
        ids.project,
        ids.chapter,
        draft({
          proposalType: 'knowledge_state',
          characterId: ids.entity,
          informationKey: 'secret',
          proposedKnowledge: { knowledgeStatus: 'knows', validUntilChapterId: null, notes: '' },
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'STATE_PROPOSAL_NOT_FOUND' }));
  });

  it('covers new/existing/missing timeline targets and generated target keys', () => {
    const baseEvent = {
      eventId: null,
      title: '雨夜',
      startValue: '夜',
      endValue: null,
      precision: 'exact',
      locationId: null,
      description: '',
      participantIds: [],
      witnessIds: [],
      subjectIds: [],
      dependencyIds: [],
    };
    expect(
      stateProposalInsertShape(
        database(),
        ids.project,
        ids.chapter,
        draft({ proposalType: 'timeline_event', proposedEvent: baseEvent }),
      ),
    ).toMatchObject({
      target: { eventId: null },
      previousValue: null,
      targetKey: 'timeline:夜:雨夜',
    });
    const current = {
      eventId: ids.timeline,
      title: '旧事件',
      startValue: '晨',
      endValue: null,
      precision: 'exact',
      locationId: null,
      description: '',
    };
    expect(
      stateProposalInsertShape(
        database({ timeline: current }),
        ids.project,
        ids.chapter,
        draft({
          proposalType: 'timeline_event',
          proposedEvent: { ...baseEvent, eventId: ids.timeline },
        }),
      ),
    ).toMatchObject({ previousValue: current, targetKey: `timeline:${ids.timeline}` });
    expect(() =>
      stateProposalInsertShape(
        database(),
        ids.project,
        ids.chapter,
        draft({
          proposalType: 'timeline_event',
          proposedEvent: { ...baseEvent, eventId: ids.timeline },
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'STATE_PROPOSAL_NOT_FOUND' }));
  });

  it('covers foreshadowing and milestone missing/conflict/success plus entity-create duplication', () => {
    expect(() =>
      stateProposalInsertShape(
        database(),
        ids.project,
        ids.chapter,
        draft({
          proposalType: 'foreshadowing',
          proposedForeshadowing: { foreshadowingId: ids.foreshadowing, status: 'revealed' },
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'STATE_PROPOSAL_NOT_FOUND' }));
    expect(
      stateProposalInsertShape(
        database({ foreshadowing: { status: 'planted' } }),
        ids.project,
        ids.chapter,
        draft({
          proposalType: 'foreshadowing',
          proposedForeshadowing: { foreshadowingId: ids.foreshadowing, status: 'revealed' },
        }),
      ),
    ).toMatchObject({ previousValue: { status: 'planted' } });

    const milestoneDraft = draft({
      proposalType: 'arc_milestone',
      arcMilestoneId: ids.milestone,
      proposedStatus: 'hit',
      actualChapterId: ids.chapter,
    });
    expect(() =>
      stateProposalInsertShape(database(), ids.project, ids.chapter, milestoneDraft),
    ).toThrowError(expect.objectContaining({ code: 'STATE_PROPOSAL_NOT_FOUND' }));
    expect(() =>
      stateProposalInsertShape(
        database({ milestone: { status: 'hit', actualChapterId: ids.chapter } }),
        ids.project,
        ids.chapter,
        milestoneDraft,
      ),
    ).toThrowError(expect.objectContaining({ code: 'STATE_PROPOSAL_CONFLICT' }));
    expect(
      stateProposalInsertShape(
        database({ milestone: { status: 'planned', actualChapterId: null } }),
        ids.project,
        ids.chapter,
        milestoneDraft,
      ),
    ).toMatchObject({
      target: { targetType: 'arc_milestone' },
      proposedValue: { status: 'hit', actualChapterId: ids.chapter },
    });

    const entityDraft = draft({
      proposalType: 'entity_create',
      proposedEntity: { entityType: 'character', name: ' 阿灯 ', aliases: [], summary: '' },
    });
    expect(() =>
      stateProposalInsertShape(
        database({ duplicate: { 1: 1 } }),
        ids.project,
        ids.chapter,
        entityDraft,
      ),
    ).toThrowError(expect.objectContaining({ code: 'STATE_PROPOSAL_CONFLICT' }));
    expect(
      stateProposalInsertShape(database(), ids.project, ids.chapter, entityDraft),
    ).toMatchObject({
      target: { name: '阿灯' },
      targetKey: 'entity-create:character:阿灯',
    });
  });

  it('returns null previous values when no current state/knowledge/relationship/fact exists', () => {
    const db = database({
      entities: { [ids.entity]: 'character', [ids.secondEntity]: 'character' },
    });
    const shapes = [
      stateProposalInsertShape(
        db,
        ids.project,
        ids.chapter,
        draft({
          proposalType: 'entity_state',
          entityId: ids.entity,
          stateKey: 'alive',
          semanticKind: 'life_status',
          proposedValue: 'alive',
          validUntilChapterId: null,
        }),
      ),
      stateProposalInsertShape(
        db,
        ids.project,
        ids.chapter,
        draft({
          proposalType: 'knowledge_state',
          characterId: ids.entity,
          informationKey: 'secret',
          proposedKnowledge: { knowledgeStatus: 'knows', validUntilChapterId: null, notes: '' },
        }),
      ),
      stateProposalInsertShape(
        db,
        ids.project,
        ids.chapter,
        draft({
          proposalType: 'character_relationship',
          fromCharacterId: ids.entity,
          toCharacterId: ids.secondEntity,
          proposedRelationship: { category: 'alliance', label: '同伴', validUntilChapterId: null },
        }),
      ),
      stateProposalInsertShape(
        db,
        ids.project,
        ids.chapter,
        draft({
          proposalType: 'canon_fact',
          entityId: ids.entity,
          factKey: 'origin',
          proposedFact: { value: '江南', description: '' },
        }),
      ),
    ];
    expect(shapes.map((shape) => shape.previousValue)).toEqual([null, null, null, null]);
  });
});

describe('proposal authority apply transaction edge coverage', () => {
  const db = database();
  const now = '2026-08-17T00:00:00.000Z';
  const idFactory = vi.fn(() => 'generated-id');

  it('dispatches all proposal types with author authority and returns generated identities', () => {
    expect(
      applyStateProposalInTransaction(
        db,
        proposal({
          proposalType: 'entity_state',
          target: { targetType: 'entity_state', entityId: ids.entity, stateKey: 'alive' },
        }),
        { value: 'dead', semanticKind: 'life_status', validUntilChapterId: null },
        now,
        idFactory,
      ),
    ).toMatchObject({ value: 'dead', semanticKind: 'life_status' });
    expect(calls.entityState).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ authority: 'author', validFromChapterId: ids.chapter }),
      now,
      idFactory,
    );

    expect(
      applyStateProposalInTransaction(
        db,
        proposal({
          proposalType: 'knowledge_state',
          target: {
            targetType: 'knowledge_state',
            characterId: ids.entity,
            informationKey: 'secret',
          },
        }),
        { knowledgeStatus: 'knows', validUntilChapterId: null, notes: 'known' },
        now,
        idFactory,
      ),
    ).toMatchObject({ knowledgeStatus: 'knows' });
    expect(calls.knowledge).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ sourceLogicalBlockId: 'block-1' }),
      now,
      idFactory,
    );

    expect(
      applyStateProposalInTransaction(
        db,
        proposal({
          proposalType: 'timeline_event',
          target: { targetType: 'timeline_event', eventId: null },
        }),
        {
          eventId: null,
          title: '雨夜',
          startValue: '夜',
          endValue: null,
          precision: 'exact',
          locationId: null,
          description: '',
          participantIds: [],
          witnessIds: [],
          subjectIds: [],
          dependencyIds: [],
        },
        now,
        idFactory,
      ),
    ).toMatchObject({ eventId: 'generated-id' });

    expect(
      applyStateProposalInTransaction(
        db,
        proposal({
          proposalType: 'character_relationship',
          target: {
            targetType: 'character_relationship',
            fromCharacterId: ids.entity,
            toCharacterId: ids.secondEntity,
            category: 'alliance',
            label: '同伴',
          },
        }),
        { category: 'alliance', label: ' 同伴 ', validUntilChapterId: null },
        now,
        idFactory,
      ),
    ).toMatchObject({ relationshipId: 'relationship-id' });

    expect(
      applyStateProposalInTransaction(
        db,
        proposal({
          proposalType: 'foreshadowing',
          target: { targetType: 'foreshadowing', foreshadowingId: ids.foreshadowing },
        }),
        { foreshadowingId: ids.foreshadowing, status: 'revealed' },
        now,
        idFactory,
      ),
    ).toMatchObject({ status: 'revealed' });
    expect(
      applyStateProposalInTransaction(
        db,
        proposal({
          proposalType: 'arc_milestone',
          target: { targetType: 'arc_milestone', arcMilestoneId: ids.milestone },
        }),
        { status: 'hit', actualChapterId: ids.chapter },
        now,
        idFactory,
      ),
    ).toMatchObject({ status: 'hit' });
    expect(
      applyStateProposalInTransaction(
        db,
        proposal({
          proposalType: 'entity_create',
          target: { targetType: 'entity_create', entityType: 'character', name: '阿灯' },
        }),
        { entityType: 'character', name: '阿灯', aliases: [], summary: '' },
        now,
        idFactory,
      ),
    ).toMatchObject({ entityId: 'entity-id' });
    expect(
      applyStateProposalInTransaction(
        db,
        proposal({
          proposalType: 'canon_fact',
          target: { targetType: 'canon_fact', entityId: ids.entity, factKey: 'origin' },
        }),
        { value: '江南', description: '' },
        now,
        idFactory,
      ),
    ).toMatchObject({ factId: 'fact-id' });
  });

  it('covers knowledge evidence without logical block and existing timeline ids', () => {
    const noBlock = proposal({
      proposalType: 'knowledge_state',
      target: { targetType: 'knowledge_state', characterId: ids.entity, informationKey: 'secret' },
      evidence: [{ kind: 'version', targetId: ids.version, note: '' }],
    });
    applyStateProposalInTransaction(
      db,
      noBlock,
      { knowledgeStatus: 'knows', validUntilChapterId: null, notes: '' },
      now,
      idFactory,
    );
    expect(calls.knowledge).toHaveBeenLastCalledWith(
      db,
      expect.objectContaining({ sourceLogicalBlockId: null }),
      now,
      idFactory,
    );
    applyStateProposalInTransaction(
      db,
      proposal({
        proposalType: 'timeline_event',
        target: { targetType: 'timeline_event', eventId: ids.timeline },
      }),
      {
        eventId: ids.timeline,
        title: '旧事件',
        startValue: '晨',
        endValue: null,
        precision: 'exact',
        locationId: null,
        description: '',
        participantIds: [],
        witnessIds: [],
        subjectIds: [],
        dependencyIds: [],
      },
      now,
      idFactory,
    );
    expect(calls.timeline).toHaveBeenLastCalledWith(
      db,
      expect.objectContaining({ eventId: ids.timeline }),
      ids.timeline,
      now,
    );
  });

  it('rejects timeline/relationship identity changes with domain errors', () => {
    expect(() =>
      applyStateProposalInTransaction(
        db,
        proposal({
          proposalType: 'timeline_event',
          target: { targetType: 'timeline_event', eventId: ids.timeline },
        }),
        {
          eventId: null,
          title: '换目标',
          startValue: '夜',
          endValue: null,
          precision: 'exact',
          locationId: null,
          description: '',
          participantIds: [],
          witnessIds: [],
          subjectIds: [],
          dependencyIds: [],
        },
        now,
        idFactory,
      ),
    ).toThrowError(expect.objectContaining({ code: 'STATE_PROPOSAL_INVALID' }));
    expect(() =>
      applyStateProposalInTransaction(
        db,
        proposal({
          proposalType: 'character_relationship',
          target: {
            targetType: 'character_relationship',
            fromCharacterId: ids.entity,
            toCharacterId: ids.secondEntity,
            category: 'alliance',
            label: '同伴',
          },
        }),
        { category: 'rivalry', label: '敌手', validUntilChapterId: null },
        now,
        idFactory,
      ),
    ).toThrowError(expect.objectContaining({ code: 'STATE_PROPOSAL_INVALID' }));
  });

  it('rejects every mismatched proposal target through the invariant guard', () => {
    const wrongTarget = {
      targetType: 'entity_state',
      entityId: ids.entity,
      stateKey: 'alive',
    } as const;
    for (const proposalType of [
      'knowledge_state',
      'timeline_event',
      'character_relationship',
      'foreshadowing',
      'arc_milestone',
      'canon_fact',
    ] as const) {
      expect(() =>
        applyStateProposalInTransaction(
          db,
          proposal({ proposalType, target: contractInput(wrongTarget) }),
          {},
          now,
          idFactory,
        ),
      ).toThrowError(expect.objectContaining({ code: 'STATE_PROPOSAL_INVARIANT' }));
    }
    expect(() =>
      applyStateProposalInTransaction(
        db,
        proposal({
          proposalType: 'entity_state',
          target: contractInput({
            targetType: 'knowledge_state',
            characterId: ids.entity,
            informationKey: 'x',
          }),
        }),
        {},
        now,
        idFactory,
      ),
    ).toThrowError(expect.objectContaining({ code: 'STATE_PROPOSAL_INVARIANT' }));
  });

  it('wraps validation/dependency failures while preserving StateProposalServiceError', () => {
    expect(() =>
      applyStateProposalInTransaction(
        db,
        proposal({
          proposalType: 'entity_state',
          target: { targetType: 'entity_state', entityId: ids.entity, stateKey: 'alive' },
        }),
        { value: undefined },
        now,
        idFactory,
      ),
    ).toThrowError(expect.objectContaining({ code: 'STATE_PROPOSAL_CONFLICT' }));

    calls.entityCreate.mockImplementationOnce(() => {
      throw 'non-error-failure';
    });
    expect(() =>
      applyStateProposalInTransaction(
        db,
        proposal({
          proposalType: 'entity_create',
          target: { targetType: 'entity_create', entityType: 'character', name: '阿灯' },
        }),
        { entityType: 'character', name: '阿灯', aliases: [], summary: '' },
        now,
        idFactory,
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'STATE_PROPOSAL_CONFLICT',
        message: 'The StateProposal could not be applied.',
      }),
    );

    calls.foreshadowing.mockImplementationOnce(() => {
      throw new StateProposalServiceError('STATE_PROPOSAL_NOT_FOUND', 'gone');
    });
    expect(() =>
      applyStateProposalInTransaction(
        db,
        proposal({
          proposalType: 'foreshadowing',
          target: { targetType: 'foreshadowing', foreshadowingId: ids.foreshadowing },
        }),
        { foreshadowingId: ids.foreshadowing, status: 'revealed' },
        now,
        idFactory,
      ),
    ).toThrowError(expect.objectContaining({ code: 'STATE_PROPOSAL_NOT_FOUND', message: 'gone' }));
  });
});
