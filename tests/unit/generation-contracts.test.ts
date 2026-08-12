import { describe, expect, it } from 'vitest';

import {
  BeatSourceMappingUnitSchema,
  GenerationIntentSchema,
  GenerationListRunsInputSchema,
  GenerationResultRefSchema,
  GenerationRunSchema,
  GenerationScopeSchema,
  GenerationStartInputSchema,
  ModelSupportProfileSchema,
  TaskEventEnvelopeSchema,
  TaskSnapshotSchema,
} from '../../packages/contracts/src/index.js';

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

describe('M4-04 generation contracts', () => {
  it('keeps Candidate and StateProposal batch result references disjoint', () => {
    expect(
      GenerationResultRefSchema.parse({
        resultType: 'candidate',
        resultId: id('1'),
        candidateKind: 'prose',
      }),
    ).toEqual({
      resultType: 'candidate',
      resultId: id('1'),
      candidateKind: 'prose',
    });
    expect(
      GenerationResultRefSchema.parse({
        resultType: 'state_proposal_batch',
        resultId: id('2'),
      }),
    ).toEqual({
      resultType: 'state_proposal_batch',
      resultId: id('2'),
    });
    expect(
      GenerationResultRefSchema.safeParse({
        resultType: 'state_proposal_batch',
        resultId: id('2'),
        candidateKind: 'prose',
      }).success,
    ).toBe(false);
  });

  it('projects result references through snapshots and completion events compatibly', () => {
    const resultRef = {
      resultType: 'candidate' as const,
      resultId: id('3'),
      candidateKind: 'skeleton' as const,
    };
    expect(
      TaskSnapshotSchema.parse({
        taskId: id('4'),
        taskType: 'skeleton',
        projectId: id('5'),
        status: 'succeeded',
        stage: 'completed',
        lastSequence: 3,
        startedAt: '2026-07-26T00:00:00.000Z',
        elapsedMs: 50,
        resultIds: [resultRef.resultId],
        resultRefs: [resultRef],
      }).resultRefs,
    ).toEqual([resultRef]);
    expect(
      TaskEventEnvelopeSchema.parse({
        protocolVersion: 1,
        eventId: id('6'),
        taskId: id('4'),
        projectId: id('5'),
        sequence: 3,
        emittedAt: '2026-07-26T00:00:00.050Z',
        type: 'ai.completed',
        payload: {
          candidateIds: [resultRef.resultId],
          resultRefs: [resultRef],
        },
      }).payload,
    ).toEqual({
      candidateIds: [resultRef.resultId],
      resultRefs: [resultRef],
    });
  });

  it('normalizes the historical untested support status to unverified', () => {
    const profile = ModelSupportProfileSchema.parse({
      providerId: 'provider',
      model: 'model',
      taskType: 'chapter',
      promptId: 'worldforge.chapter',
      promptVersion: 1,
      status: 'untested',
      limitations: [],
    });
    expect(profile.status).toBe('unverified');
  });

  it('validates a persisted run without exposing prompt or response bodies', () => {
    const chapterId = id('14');
    const run = GenerationRunSchema.parse({
      runId: id('10'),
      requestId: id('11'),
      taskId: id('12'),
      projectId: id('13'),
      scopeType: 'chapter',
      scopeId: chapterId,
      chapterId,
      baseDraftId: id('15'),
      baseDraftRevision: 2,
      runType: 'chapter',
      promptId: 'worldforge.chapter',
      promptVersion: 1,
      outputMode: 'text',
      providerId: 'provider',
      actualModel: 'model',
      supportStatus: 'unverified',
      status: 'running',
      stage: 'receiving_output',
      retryCount: 0,
      inputTokens: null,
      outputTokens: null,
      errorCode: null,
      retryable: null,
      partialStatus: 'unavailable',
      resultRefs: [],
      createdAt: '2026-07-26T00:00:00.000Z',
      startedAt: '2026-07-26T00:00:00.010Z',
      finishedAt: null,
    });
    expect(run).not.toHaveProperty('prompt');
    expect(run).not.toHaveProperty('response');
  });
  it('rejects repeated rewrite block identities before the request reaches Core', () => {
    const blockId = id('20');
    const hash = 'a'.repeat(64);
    const result = GenerationIntentSchema.safeParse({
      runType: 'rewrite',
      scope: {
        scopeType: 'blocks',
        logicalBlockIds: [blockId, blockId],
        expectedBlockHashes: [hash, hash],
      },
      instruction: '保持事实不变并压缩表达。',
      targetLanguage: 'zh-CN',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['scope', 'logicalBlockIds'],
            message: 'Rewrite logicalBlockIds must be unique.',
          }),
        ]),
      );
    }
  });

  it('enforces generic scope ownership and generation start compatibility', () => {
    const projectId = id('30');
    const chapterId = id('31');
    const volumeId = id('32');
    expect(
      GenerationScopeSchema.parse({ projectId, scopeType: 'project', scopeId: projectId }),
    ).toMatchObject({ chapterId: null });
    expect(
      GenerationScopeSchema.safeParse({ projectId, scopeType: 'project', scopeId: volumeId })
        .success,
    ).toBe(false);
    expect(
      GenerationScopeSchema.parse({
        projectId,
        scopeType: 'chapter',
        scopeId: chapterId,
        chapterId,
      }),
    ).toMatchObject({ chapterId });
    expect(
      GenerationScopeSchema.safeParse({
        projectId,
        scopeType: 'chapter',
        scopeId: chapterId,
        chapterId: volumeId,
      }).success,
    ).toBe(false);
    expect(
      GenerationScopeSchema.parse({ projectId, scopeType: 'volume', scopeId: volumeId }),
    ).toMatchObject({ scopeType: 'volume' });

    const ideaIntent = {
      runType: 'idea_explore' as const,
      ideaKind: 'plot' as const,
      divergenceLevel: 'different' as const,
      depthLevel: 'expand' as const,
      authorInstruction: '探索作品的新方向。',
    };
    const base = {
      projectId,
      providerId: 'provider',
      intent: ideaIntent,
    };
    expect(GenerationStartInputSchema.parse({ ...base, scopeType: 'project' }).scopeId).toBe(
      projectId,
    );
    expect(
      GenerationStartInputSchema.parse({ ...base, chapterId, scopeType: 'chapter' }).scopeId,
    ).toBe(chapterId);
    expect(GenerationStartInputSchema.safeParse({ ...base, scopeType: 'volume' }).success).toBe(
      false,
    );
    expect(
      GenerationStartInputSchema.safeParse({
        ...base,
        scopeType: 'chapter',
        scopeId: chapterId,
        chapterId: volumeId,
      }).success,
    ).toBe(false);
    expect(
      GenerationStartInputSchema.safeParse({
        ...base,
        scopeType: 'project',
        intent: {
          runType: 'validate',
          sourceVersionId: id('33'),
        },
      }).success,
    ).toBe(false);
  });

  it('keeps list filters paired and beat sources exclusive', () => {
    const projectId = id('40');
    const scopeId = id('41');
    expect(GenerationListRunsInputSchema.parse({ projectId })).toMatchObject({
      scopeType: null,
      scopeId: null,
    });
    expect(
      GenerationListRunsInputSchema.safeParse({ projectId, scopeType: 'entity' }).success,
    ).toBe(false);
    expect(GenerationListRunsInputSchema.safeParse({ projectId, scopeId }).success).toBe(false);
    expect(
      GenerationListRunsInputSchema.parse({ projectId, scopeType: 'entity', scopeId }),
    ).toMatchObject({ scopeType: 'entity', scopeId });

    const blockId = id('42');
    const beatId = id('43');
    expect(
      BeatSourceMappingUnitSchema.safeParse({
        sceneBeatId: beatId,
        sourceCandidateId: null,
        sourceBlockIds: [],
        keepCurrentDraft: true,
      }).success,
    ).toBe(true);
    expect(
      BeatSourceMappingUnitSchema.safeParse({
        sceneBeatId: beatId,
        sourceCandidateId: id('44'),
        sourceBlockIds: [blockId],
        keepCurrentDraft: true,
      }).success,
    ).toBe(false);
    expect(
      BeatSourceMappingUnitSchema.safeParse({
        sceneBeatId: beatId,
        sourceCandidateId: id('44'),
        sourceBlockIds: [],
        keepCurrentDraft: false,
      }).success,
    ).toBe(false);
  });
});
