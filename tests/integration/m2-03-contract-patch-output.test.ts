import { describe, expect, it } from 'vitest';

import {
  CandidateApplyInputSchema,
  CandidatePreviewInputSchema,
  CandidateUndoInputSchema,
  CandidateUndoPreviewInputSchema,
} from '@worldforge/contracts';

const projectId = '11111111-1111-4111-8111-111111111111';
const chapterId = '22222222-2222-4222-8222-222222222222';
const candidateId = '33333333-3333-4333-8333-333333333333';
const draftId = '44444444-4444-4444-8444-444444444444';
const applyRecordId = '55555555-5555-4555-8555-555555555555';

describe('M2-03 Candidate apply contract exports', () => {
  it('exports strict preview, apply and undo schemas from the contracts barrel', () => {
    const preview = CandidatePreviewInputSchema.parse({ projectId, chapterId, candidateId });
    expect(preview).toEqual({ projectId, chapterId, candidateId });

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
    const raw = {
      projectId,
      chapterId,
      candidateId,
      draftId,
      baseRevision: 1,
      selection: { mode: 'all' },
      status: 'accepted',
    };
    expect(() => CandidateApplyInputSchema.parse(raw)).toThrow();
  });
});
