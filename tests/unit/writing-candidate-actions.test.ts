import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import {
  applyCandidate,
  cancelCandidatePreview,
  type CandidateActionContext,
  discardCandidate,
  saveSkeletonCandidate,
  undoCandidate,
} from '../../apps/desktop/renderer/src/features/writing/candidate-preview-actions.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const success = <Data>(data: Data) => ({ state: 'success' as const, data });

function state<T>(initial: T) {
  let value = initial;
  return {
    get: () => value,
    set: (next: T | ((current: T) => T)) => {
      value = typeof next === 'function' ? (next as (current: T) => T)(value) : next;
    },
  };
}

function setup(bridge: RendererBridgeAdapter) {
  const selected = state<Record<string, unknown> | null>({ candidateId: 'candidate-a' });
  const preview = state<Record<string, unknown> | null>({
    candidate: { candidateId: 'candidate-a' },
    draft: { draftId: 'draft-a', revision: 4 },
  });
  const undo = state<Record<string, unknown> | null>({ record: { applyRecordId: 'record-a' } });
  const conflicts = state<readonly unknown[]>([]);
  const statuses: string[] = [];
  const pending: boolean[] = [];
  const replacements: Array<{ draft: unknown; message: string }> = [];
  const context = contractInput<CandidateActionContext>({
    bridge,
    projectId: 'project-a',
    chapterId: 'chapter-a',
    commandPrefix: 'writing:project-a:chapter-a:',
    readOnly: false,
    refreshList: vi.fn(async () => []),
    onDraftReplace: (draft: unknown, message: string) => replacements.push({ draft, message }),
    setPreview: preview.set,
    setUndoPreview: undo.set,
    setSelectedDocument: selected.set,
    setSkeletonEndingHook: vi.fn(),
    setSkeletonTendency: vi.fn(),
    setConflicts: conflicts.set,
    setStatus: (value: string) => statuses.push(value),
    setPending: (value: boolean) => pending.push(value),
  });
  return { conflicts, context, pending, preview, replacements, selected, statuses, undo };
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { confirm: vi.fn(() => true) },
  });
});

describe('Writing候选操作', () => {
  it('取消差异预览并处理空请求或未取消结果', async () => {
    const cancelPreview = vi.fn(async () => success({ cancelled: true }));
    const bridge = contractInput<RendererBridgeAdapter>({ candidateAction: { cancelPreview } });
    expect(await cancelCandidatePreview(bridge, null)).toBe(false);
    expect(await cancelCandidatePreview(bridge, 'request-a')).toBe(true);
    cancelPreview.mockResolvedValueOnce(success({ cancelled: false }));
    expect(await cancelCandidatePreview(bridge, 'request-b')).toBe(false);
  });

  it('仅丢弃待处理候选并同步当前文档与预览', async () => {
    const discard = vi.fn(async () =>
      success({ status: 'discarded', resolvedAt: '2026-08-01T00:00:00.000Z' }),
    );
    const bridge = contractInput<RendererBridgeAdapter>({ candidate: { discard } });
    const context = setup(bridge);
    await discardCandidate(context.context, null);
    await discardCandidate(
      context.context,
      contractInput({ candidateId: 'candidate-a', status: 'accepted' }),
    );
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await discardCandidate(
      context.context,
      contractInput({ candidateId: 'candidate-a', status: 'pending' }),
    );
    await discardCandidate(
      context.context,
      contractInput({ candidateId: 'candidate-a', status: 'pending' }),
    );
    expect(discard).toHaveBeenCalledTimes(1);
    expect(context.selected.get()).toMatchObject({ status: 'discarded' });
    expect(context.preview.get()).toMatchObject({ candidate: { status: 'discarded' } });
    expect(context.statuses.at(-1)).toContain('已丢弃');
  });

  it('采用成功后替换Draft、刷新撤销信息与列表', async () => {
    const draft = { draftId: 'draft-a', revision: 5 };
    const apply = vi.fn(async () =>
      success({
        outcome: 'applied',
        draft,
        record: { applyRecordId: 'record-123456789', appliedAt: '2026-08-01T00:00:00.000Z' },
      }),
    );
    const context = setup(contractInput<RendererBridgeAdapter>({ candidateAction: { apply } }));
    const loadUndo = vi.fn(async () => true);
    const preview = contractInput({
      candidate: { candidateId: 'candidate-a', status: 'pending' },
      draft: { draftId: 'draft-a', revision: 4 },
    });
    await applyCandidate(
      { ...context.context, flush: async () => true, loadUndo },
      preview,
      contractInput({ mode: 'all' }),
    );
    expect(context.pending).toEqual([true, false]);
    expect(context.replacements).toEqual([{ draft, message: '采用成功 · 保存序号 5' }]);
    expect(loadUndo).toHaveBeenCalled();
    expect(context.statuses.at(-1)).toContain('record-1');
  });

  it('采用前置条件和冲突都保持当前稿不变', async () => {
    const apply = vi.fn(async () =>
      success({
        outcome: 'conflict',
        conflictSet: { conflicts: [{ conflictType: 'locked' }] },
      }),
    );
    const context = setup(contractInput<RendererBridgeAdapter>({ candidateAction: { apply } }));
    const preview = contractInput({
      candidate: { candidateId: 'candidate-a' },
      draft: { draftId: 'draft-a', revision: 4 },
    });
    const selection = contractInput({ mode: 'all' });
    await applyCandidate(
      { ...context.context, readOnly: true, flush: async () => true, loadUndo: async () => true },
      preview,
      selection,
    );
    await applyCandidate(
      { ...context.context, flush: async () => false, loadUndo: async () => true },
      preview,
      selection,
    );
    await applyCandidate(
      { ...context.context, flush: async () => true, loadUndo: async () => true },
      preview,
      selection,
    );
    expect(apply).toHaveBeenCalledTimes(1);
    expect(context.conflicts.get()).toHaveLength(1);
    expect(context.replacements).toEqual([]);
    expect(context.statuses.at(-1)).toContain('发现1项冲突');
  });

  it('撤销时分别处理已变化、冲突与成功恢复', async () => {
    const currentDraft = { draftId: 'draft-a', revision: 5 };
    const previewUndo = vi
      .fn()
      .mockResolvedValueOnce(
        success({
          canUndo: false,
          conflictSet: { conflicts: [{ conflictType: 'revision' }] },
        }),
      )
      .mockResolvedValue(
        success({ canUndo: true, record: { applyRecordId: 'record-a' }, currentDraft }),
      );
    const undo = vi
      .fn()
      .mockResolvedValueOnce(
        success({ outcome: 'conflict', conflictSet: { conflicts: [{ conflictType: 'hash' }] } }),
      )
      .mockResolvedValue(
        success({ outcome: 'undone', draft: { draftId: 'draft-a', revision: 6 } }),
      );
    const context = setup(
      contractInput<RendererBridgeAdapter>({ candidateAction: { previewUndo, undo } }),
    );
    const undoPreview = contractInput({ record: { applyRecordId: 'record-a' } });
    await undoCandidate(context.context, undoPreview);
    expect(context.statuses.at(-1)).toContain('撤销进入冲突');
    await undoCandidate(context.context, undoPreview);
    expect(context.statuses.at(-1)).toContain('撤销冲突');
    await undoCandidate(context.context, undoPreview);
    expect(context.replacements.at(-1)?.message).toBe('已撤销本次应用 · 保存序号 6');
    expect(context.undo.get()).toBeNull();
    expect(context.conflicts.get()).toEqual([]);
  });

  it('保存骨架修订并拒绝正文候选或只读会话', async () => {
    const revised = {
      candidateId: 'skeleton-a',
      candidateType: 'skeleton',
      skeletonRevision: 3,
      structuredPayload: { tendency: '强化冲突', endingHook: '门后是谁' },
    };
    const editSkeleton = vi.fn(async () => success(revised));
    const context = setup(contractInput<RendererBridgeAdapter>({ candidate: { editSkeleton } }));
    const skeleton = contractInput({
      candidateId: 'skeleton-a',
      candidateType: 'skeleton',
      skeletonRevisionId: 'revision-a',
      structuredPayload: { tendency: '旧倾向', endingHook: '旧钩子' },
    });
    await saveSkeletonCandidate(context.context, null, '', '');
    await saveSkeletonCandidate(
      context.context,
      contractInput({ candidateType: 'chapter' }),
      '',
      '',
    );
    await saveSkeletonCandidate({ ...context.context, readOnly: true }, skeleton, '', '');
    await saveSkeletonCandidate(context.context, skeleton, ' 强化冲突 ', ' 门后是谁 ');
    expect(editSkeleton).toHaveBeenCalledTimes(1);
    expect(context.selected.get()).toEqual(revised);
    expect(context.statuses.at(-1)).toBe('骨架修订 3 已保存。');
  });
});
