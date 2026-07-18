import { describe, expect, it } from 'vitest';

import {
  CandidateApplyInputSchema,
  CandidatePreviewCancelInputSchema,
  CandidatePreviewInputSchema,
  CandidateUndoInputSchema,
  CandidateUndoPreviewInputSchema,
  DraftPatchOperationSchema,
} from '@worldforge/contracts';
import { draftOperations } from '../../packages/core-service/src/candidate-state.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const chapterId = '22222222-2222-4222-8222-222222222222';
const candidateId = '33333333-3333-4333-8333-333333333333';
const draftId = '44444444-4444-4444-8444-444444444444';
const applyRecordId = '55555555-5555-4555-8555-555555555555';

describe('M2-03 Candidate apply contracts', () => {
  it('exports strict preview, cancellation, apply and undo schemas', () => {
    const preview = CandidatePreviewInputSchema.parse({ projectId, chapterId, candidateId });
    expect(preview).toEqual({ projectId, chapterId, candidateId });
    expect(CandidatePreviewCancelInputSchema.parse({ previewRequestId: candidateId })).toEqual({
      previewRequestId: candidateId,
    });

    const apply = CandidateApplyInputSchema.parse({
      projectId,
      chapterId,
      candidateId,
      draftId,
      baseRevision: 1,
      selection: { mode: 'all' },
    });
    expect(apply).toMatchObject({ draftId, baseRevision: 1 });

    const undoPreview = CandidateUndoPreviewInputSchema.parse({
      projectId,
      chapterId,
      applyRecordId,
    });
    expect(undoPreview).toEqual({ projectId, chapterId, applyRecordId });

    const undo = CandidateUndoInputSchema.parse({
      projectId,
      chapterId,
      applyRecordId,
      draftId,
      baseRevision: 2,
    });
    expect(undo).toMatchObject({ draftId, baseRevision: 2 });
  });

  it('rejects authority fields that are not part of the renderer input', () => {
    expect(() =>
      CandidateApplyInputSchema.parse({
        projectId,
        chapterId,
        candidateId,
        draftId,
        baseRevision: 1,
        selection: { mode: 'all' },
        status: 'accepted',
      }),
    ).toThrow();
  });

  it('persists forward and inverse audit trails as canonical Draft Patch operations', () => {
    const first = {
      recordId: '66666666-6666-4666-8666-666666666666',
      logicalBlockId: '77777777-7777-4777-8777-777777777777',
      orderKey: '1024',
      blockType: 'paragraph' as const,
      text: '旧内容',
      attributes: {},
      source: 'manual' as const,
      locked: false,
      contentHash: 'a'.repeat(64),
      revision: 1,
    };
    const second = {
      ...first,
      recordId: '88888888-8888-4888-8888-888888888888',
      logicalBlockId: '99999999-9999-4999-8999-999999999999',
      orderKey: '2048',
      text: '保留内容',
      contentHash: 'b'.repeat(64),
    };
    const inserted = {
      ...first,
      recordId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      logicalBlockId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      orderKey: '2048',
      text: '新增内容',
      source: 'ai' as const,
      contentHash: 'c'.repeat(64),
      revision: 2,
    };
    const updatedAndMoved = {
      ...first,
      orderKey: '3072',
      text: '新内容',
      source: 'mixed' as const,
      contentHash: 'd'.repeat(64),
      revision: 2,
    };

    const forward = draftOperations([first, second], [second, inserted, updatedAndMoved]);
    const inverse = draftOperations([second, inserted, updatedAndMoved], [first, second]);

    expect(() => DraftPatchOperationSchema.array().parse(forward)).not.toThrow();
    expect(() => DraftPatchOperationSchema.array().parse(inverse)).not.toThrow();
    expect(forward).toContainEqual(
      expect.objectContaining({ type: 'move', expectedHash: updatedAndMoved.contentHash }),
    );
  });
});
