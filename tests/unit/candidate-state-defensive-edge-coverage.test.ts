import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  activeDraft,
  CandidateApplyServiceError,
  mutableFromSnapshot,
  persistBlocks,
  persistedNumber,
  readApplyRecord,
  readCandidateDocument,
  readDraftBlocks,
  snapshotHash,
  type ApplyRecordRow,
  type CheckpointRow,
  type MutableDraftBlock,
} from '../../packages/core-service/src/candidate-state.js';
import { draftContentHash } from '../../packages/core-service/src/draft.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const projectId = randomUUID();
const chapterId = randomUUID();
const draftId = randomUUID();
const candidateId = randomUUID();
const applyRecordId = randomUUID();

function database(prepare: (sql: string) => unknown): DatabaseSync {
  return contractInput<DatabaseSync>({ prepare });
}

function block(text = '正文', locked = false): MutableDraftBlock {
  const logicalBlockId = randomUUID();
  return {
    recordId: randomUUID(),
    logicalBlockId,
    orderKey: '1024',
    blockType: 'paragraph',
    text,
    attributes: {},
    source: 'manual',
    locked,
    contentHash: draftContentHash({ blockType: 'paragraph', content: text, attributes: {} }),
    revision: 1,
  };
}

function snapshotEntry(value: MutableDraftBlock): Record<string, unknown> {
  return {
    recordId: value.recordId,
    logicalBlockId: value.logicalBlockId,
    blockType: value.blockType,
    text: value.text,
    attributes: value.attributes,
    source: value.source,
    locked: value.locked,
    contentHash: value.contentHash,
  };
}

function applyRow(overrides: Partial<ApplyRecordRow> = {}): ApplyRecordRow {
  return {
    applyRecordId,
    requestId: randomUUID(),
    candidateId,
    draftId,
    checkpointId: randomUUID(),
    baseRevision: 1,
    committedRevision: 2,
    selectionJson: JSON.stringify({ mode: 'all' }),
    operationsJson: '[]',
    inverseOperationsJson: '[]',
    appliedBlocksJson: '[]',
    status: 'applied',
    appliedAt: '2026-08-17T00:00:00.000Z',
    undoneRevision: null,
    undoneAt: null,
    ...overrides,
  };
}

function checkpoint(row: ApplyRecordRow, overrides: Partial<CheckpointRow> = {}): CheckpointRow {
  return {
    checkpointId: row.checkpointId,
    candidateId: row.candidateId,
    draftId: row.draftId,
    sourceRevision: row.baseRevision,
    blocksJson: '[]',
    contentHash: 'a'.repeat(64),
    createdAt: '2026-08-17T00:00:00.000Z',
    ...overrides,
  };
}

describe('candidate state defensive edge coverage', () => {
  it('rejects persisted numbers outside the safe non-negative integer domain', () => {
    expect(() => persistedNumber(-1)).toThrowError(CandidateApplyServiceError);
    expect(() => persistedNumber(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrowError(
      CandidateApplyServiceError,
    );
  });

  it('rejects missing active drafts and accepts a null persisted block hash by recomputing it', () => {
    expect(() =>
      activeDraft(
        database(() => ({ get: () => undefined })),
        projectId,
        chapterId,
        draftId,
      ),
    ).toThrowError(expect.objectContaining({ code: 'CANDIDATE_APPLY_NOT_FOUND' }));

    const value = block();
    const rows = readDraftBlocks(
      database(() => ({
        all: () => [
          {
            recordId: value.recordId,
            logicalBlockId: value.logicalBlockId,
            orderKey: 1024n,
            blockType: value.blockType,
            text: value.text,
            attributesJson: '{}',
            source: value.source,
            locked: 0n,
            contentHash: null,
            revision: 1n,
          },
        ],
      })),
      draftId,
    );
    expect(rows[0]).toMatchObject({ contentHash: value.contentHash, revision: 1, locked: false });
  });

  it('rejects corrupt block attributes and invalid persisted DraftBlock semantics', () => {
    const base = block();
    const row = {
      recordId: base.recordId,
      logicalBlockId: base.logicalBlockId,
      orderKey: 1024,
      blockType: base.blockType,
      text: base.text,
      attributesJson: '{broken',
      source: base.source,
      locked: 0,
      contentHash: null,
      revision: 1,
    };
    expect(() =>
      readDraftBlocks(
        database(() => ({ all: () => [row] })),
        draftId,
      ),
    ).toThrowError(expect.objectContaining({ code: 'CANDIDATE_APPLY_INVARIANT' }));
    expect(() =>
      readDraftBlocks(
        database(() => ({
          all: () => [
            {
              ...row,
              blockType: 'separator',
              text: 'separator cannot carry text',
              attributesJson: '{}',
            },
          ],
        })),
        draftId,
      ),
    ).toThrowError(expect.objectContaining({ code: 'CANDIDATE_APPLY_INVARIANT' }));
  });

  it('rejects a missing candidate and wraps invalid persisted Candidate documents', () => {
    const input = { projectId, chapterId, candidateId };
    expect(() =>
      readCandidateDocument(
        database(() => ({ get: () => undefined })),
        input,
      ),
    ).toThrowError(expect.objectContaining({ code: 'CANDIDATE_APPLY_NOT_FOUND' }));

    const invalidRow = {
      candidateId,
      projectId,
      chapterId,
      generationRunId: null,
      candidateType: 'rewrite',
      baseDraftId: draftId,
      baseDraftRevision: 1,
      completeness: 'complete',
      status: 'pending',
      title: '',
      sourceVersionId: null,
      contentHash: 'f'.repeat(64),
      createdAt: '2026-08-17T00:00:00.000Z',
      resolvedAt: null,
    };
    const invalidDatabase = database((sql) => {
      if (sql.includes('FROM candidates ca')) return { get: () => invalidRow };
      return { all: () => [] };
    });
    expect(() => readCandidateDocument(invalidDatabase, input)).toThrowError(
      expect.objectContaining({ code: 'CANDIDATE_APPLY_INVARIANT' }),
    );
  });

  it('enforces locked DraftBlocks and retained-block update row counts', () => {
    const locked = block('锁定原文', true);
    const changed = {
      ...locked,
      text: '被改写',
      contentHash: draftContentHash({ blockType: 'paragraph', content: '被改写', attributes: {} }),
    };
    expect(() =>
      persistBlocks(
        database(() => ({})),
        draftId,
        [locked],
        [changed],
      ),
    ).toThrowError(expect.objectContaining({ code: 'DRAFT_BLOCK_LOCKED' }));

    const stableBlock = block('保留正文');
    const updateDatabase = database((sql) => {
      if (sql.startsWith('DELETE')) return { run: () => ({ changes: 1 }) };
      if (sql.startsWith('INSERT')) return { run: () => ({ changes: 1 }) };
      if (sql.startsWith('UPDATE')) return { run: () => ({ changes: 0 }) };
      throw new Error(`UNEXPECTED_SQL:${sql}`);
    });
    expect(() => persistBlocks(updateDatabase, draftId, [stableBlock], [stableBlock])).toThrowError(
      expect.objectContaining({ code: 'CANDIDATE_APPLY_INVARIANT' }),
    );
  });

  it('rejects missing, broken-revision and mismatched Candidate ApplyRecord chains', () => {
    expect(() =>
      readApplyRecord(
        database(() => ({ get: () => undefined })),
        projectId,
        chapterId,
        applyRecordId,
      ),
    ).toThrowError(expect.objectContaining({ code: 'CANDIDATE_APPLY_NOT_FOUND' }));

    const row = applyRow();
    const noCheckpoint = database((sql) => {
      if (sql.includes('FROM candidate_apply_records')) return { get: () => row };
      return { get: () => undefined };
    });
    expect(() => readApplyRecord(noCheckpoint, projectId, chapterId, applyRecordId)).toThrowError(
      expect.objectContaining({ code: 'CANDIDATE_APPLY_INVARIANT' }),
    );

    const invalidRevision = applyRow({ committedRevision: 3 });
    const invalidRevisionDatabase = database((sql) => ({
      get: () =>
        sql.includes('FROM candidate_apply_records')
          ? invalidRevision
          : checkpoint(invalidRevision),
    }));
    expect(() =>
      readApplyRecord(invalidRevisionDatabase, projectId, chapterId, applyRecordId),
    ).toThrowError(expect.objectContaining({ code: 'CANDIDATE_APPLY_INVARIANT' }));

    const mismatch = applyRow();
    const mismatchDatabase = database((sql) => ({
      get: () =>
        sql.includes('FROM candidate_apply_records')
          ? mismatch
          : checkpoint(mismatch, { candidateId: randomUUID() }),
    }));
    expect(() =>
      readApplyRecord(mismatchDatabase, projectId, chapterId, applyRecordId),
    ).toThrowError(expect.objectContaining({ code: 'CANDIDATE_APPLY_INVARIANT' }));
  });

  it('rejects ApplyRecord operation logs that do not match valid snapshots', () => {
    const before = block('旧文');
    const after: MutableDraftBlock = {
      ...before,
      text: '新文',
      contentHash: draftContentHash({ blockType: 'paragraph', content: '新文', attributes: {} }),
      revision: 2,
    };
    const beforeJson = JSON.stringify([snapshotEntry(before)]);
    const afterJson = JSON.stringify([snapshotEntry(after)]);
    const row = applyRow({ appliedBlocksJson: afterJson });
    const summaryHash = snapshotHash([
      {
        logicalBlockId: before.logicalBlockId,
        orderKey: '1024',
        blockType: before.blockType,
        text: before.text,
        attributes: before.attributes,
        source: before.source,
        locked: before.locked,
        contentHash: before.contentHash,
      },
    ]);
    const validCheckpoint = checkpoint(row, { blocksJson: beforeJson, contentHash: summaryHash });
    const value = database((sql) => ({
      get: () => (sql.includes('FROM candidate_apply_records') ? row : validCheckpoint),
    }));
    expect(() => readApplyRecord(value, projectId, chapterId, applyRecordId)).toThrowError(
      expect.objectContaining({ code: 'CANDIDATE_APPLY_INVARIANT' }),
    );
  });

  it('rejects a corrupt persisted ApplyRecord operation log after validating its snapshot', () => {
    const before = block('快照正文');
    const beforeJson = JSON.stringify([snapshotEntry(before)]);
    const row = applyRow({ appliedBlocksJson: beforeJson, operationsJson: '{broken' });
    const summaryHash = snapshotHash([
      {
        logicalBlockId: before.logicalBlockId,
        orderKey: '1024',
        blockType: before.blockType,
        text: before.text,
        attributes: before.attributes,
        source: before.source,
        locked: before.locked,
        contentHash: before.contentHash,
      },
    ]);
    const validCheckpoint = checkpoint(row, { blocksJson: beforeJson, contentHash: summaryHash });
    const value = database((sql) => ({
      get: () => (sql.includes('FROM candidate_apply_records') ? row : validCheckpoint),
    }));
    expect(() => readApplyRecord(value, projectId, chapterId, applyRecordId)).toThrowError(
      expect.objectContaining({ code: 'CANDIDATE_APPLY_INVARIANT' }),
    );
  });

  it('rejects empty snapshots and non-object snapshot entries', () => {
    expect(() => mutableFromSnapshot('[]', 2)).toThrowError(
      expect.objectContaining({ code: 'CANDIDATE_APPLY_INVARIANT' }),
    );
    expect(() => mutableFromSnapshot('[1]', 2)).toThrowError(
      expect.objectContaining({ code: 'CANDIDATE_APPLY_INVARIANT' }),
    );
  });
});
