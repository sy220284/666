import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import {
  applyCandidate,
  type CandidateActionContext,
  discardCandidate,
  saveSkeletonCandidate,
  undoCandidate,
} from '../../apps/desktop/renderer/src/features/writing/candidate-preview-actions.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const coordinator = vi.hoisted(() => ({
  latest: true,
  current: vi.fn<() => boolean>(() => true),
  authorConfirm: vi.fn(async () => true),
}));

vi.mock('../../apps/desktop/renderer/src/runtime/author-dialog.js', () => ({
  authorConfirm: coordinator.authorConfirm,
}));

vi.mock('../../apps/desktop/renderer/src/runtime/command-coordinator.js', () => ({
  rendererCommandCoordinatorFor: () => ({
    run: async ({
      operation,
    }: {
      operation: (scope: { isCurrent: () => boolean }) => Promise<void>;
    }) => {
      await operation({ isCurrent: coordinator.current });
      return { state: 'completed', token: 'token-1' };
    },
    isLatest: () => coordinator.latest,
  }),
}));

const success = <Data>(data: Data) => ({ state: 'success' as const, data });
const failure = (code = 'COMMON_CONFLICT_003') => ({
  state: 'failure' as const,
  error: { code, message: '测试失败。', retryable: true },
});

function state<T>(initial: T) {
  let value = initial;
  return {
    get: () => value,
    set: (next: T | ((current: T) => T)) => {
      value = typeof next === 'function' ? (next as (current: T) => T)(value) : next;
    },
  };
}

function setup(bridge: RendererBridgeAdapter, options: { emptyState?: boolean } = {}) {
  const selected = state<Record<string, unknown> | null>(
    options.emptyState ? null : { candidateId: 'candidate-a' },
  );
  const preview = state<Record<string, unknown> | null>(
    options.emptyState
      ? null
      : { candidate: { candidateId: 'candidate-a' }, draft: { draftId: 'draft-a', revision: 4 } },
  );
  const undo = state<Record<string, unknown> | null>({ record: { applyRecordId: 'record-a' } });
  const conflicts = state<readonly unknown[]>([]);
  const statuses: string[] = [];
  const replacements: Array<{ draft: unknown; message: string }> = [];
  const refreshList = vi.fn(async () => []);
  const context = contractInput<CandidateActionContext>({
    bridge,
    projectId: 'project-a',
    chapterId: 'chapter-a',
    commandPrefix: 'writing:project-a:chapter-a:',
    readOnly: false,
    refreshList,
    onDraftReplace: (draft: unknown, message: string) => replacements.push({ draft, message }),
    setPreview: preview.set,
    setUndoPreview: undo.set,
    setSelectedDocument: selected.set,
    setSkeletonEndingHook: vi.fn(),
    setSkeletonTendency: vi.fn(),
    setConflicts: conflicts.set,
    setStatus: (value: string) => statuses.push(value),
    setPending: vi.fn(),
  });
  return { conflicts, context, preview, refreshList, replacements, selected, statuses, undo };
}

const candidate = contractInput({
  candidateId: 'candidate-a',
  candidateType: 'full',
  status: 'pending',
});
const preview = contractInput({
  candidate: { candidateId: 'candidate-a', status: 'pending' },
  draft: { draftId: 'draft-a', revision: 4 },
});
const selection = contractInput({ mode: 'all' });
const undoPreview = contractInput({ record: { applyRecordId: 'record-a' } });

beforeEach(() => {
  coordinator.latest = true;
  coordinator.current.mockReset().mockReturnValue(true);
  coordinator.authorConfirm.mockReset().mockResolvedValue(true);
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { confirm: vi.fn(() => true) },
  });
});

describe('Candidate preview action edge coverage', () => {
  it('ignores a completed mutation when command ownership is no longer latest', async () => {
    coordinator.latest = false;
    const discard = vi.fn(async () => success({ status: 'discarded', resolvedAt: null }));
    const context = setup(contractInput<RendererBridgeAdapter>({ candidate: { discard } }));
    await discardCandidate(context.context, candidate);
    expect(discard).toHaveBeenCalledOnce();
    expect(context.statuses.at(-1)).toBe('建议稿已丢弃，当前稿未改变。');
  });

  it('covers discard stale, failure, empty state setters and refresh ownership loss', async () => {
    const discard = vi
      .fn()
      .mockResolvedValueOnce(success({ status: 'discarded', resolvedAt: 'now' }))
      .mockResolvedValueOnce(failure())
      .mockResolvedValueOnce({ state: 'cancelled' })
      .mockResolvedValue(success({ status: 'discarded', resolvedAt: 'later' }));
    const context = setup(contractInput<RendererBridgeAdapter>({ candidate: { discard } }), {
      emptyState: true,
    });

    coordinator.current.mockReturnValueOnce(false);
    await discardCandidate(context.context, candidate);
    expect(context.refreshList).not.toHaveBeenCalled();

    coordinator.current.mockReset().mockReturnValue(true);
    await discardCandidate(context.context, candidate);
    expect(context.statuses.at(-1)).toContain('丢弃失败');

    await discardCandidate(context.context, candidate);
    expect(context.statuses.at(-1)).toContain('丢弃失败');

    coordinator.current
      .mockReset()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValue(false);
    await discardCandidate(context.context, candidate);
    expect(context.selected.get()).toBeNull();
    expect(context.preview.get()).toBeNull();
    expect(context.refreshList).toHaveBeenCalledOnce();
    expect(context.statuses.at(-1)).toContain('丢弃失败');
  });

  it('covers apply cancellation/failure and every post-await ownership loss', async () => {
    const apply = vi
      .fn()
      .mockResolvedValueOnce(failure())
      .mockResolvedValueOnce({ state: 'cancelled' })
      .mockResolvedValue(
        success({
          outcome: 'applied',
          draft: { draftId: 'draft-a', revision: 5 },
          record: { applyRecordId: 'record-123456789', appliedAt: 'now' },
        }),
      );
    const context = setup(contractInput<RendererBridgeAdapter>({ candidateAction: { apply } }));

    coordinator.current.mockReturnValueOnce(false);
    await applyCandidate(
      { ...context.context, flush: async () => true, loadUndo: async () => true },
      preview,
      selection,
    );
    expect(apply).not.toHaveBeenCalled();

    coordinator.current.mockReset().mockReturnValueOnce(true).mockReturnValueOnce(true);
    await applyCandidate(
      { ...context.context, flush: async () => true, loadUndo: async () => true },
      preview,
      selection,
    );
    expect(context.statuses.at(-1)).toContain('采用失败');

    coordinator.current.mockReset().mockReturnValue(true);
    await applyCandidate(
      { ...context.context, flush: async () => true, loadUndo: async () => true },
      preview,
      selection,
    );
    expect(context.statuses.at(-1)).toContain('采用失败');

    coordinator.current.mockReset().mockReturnValueOnce(true).mockReturnValueOnce(false);
    await applyCandidate(
      { ...context.context, flush: async () => true, loadUndo: async () => true },
      preview,
      selection,
    );
    expect(context.replacements).toEqual([]);

    const loadUndo = vi.fn(async () => true);
    coordinator.current
      .mockReset()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    await applyCandidate(
      { ...context.context, flush: async () => true, loadUndo },
      preview,
      selection,
    );
    expect(loadUndo).toHaveBeenCalledOnce();

    coordinator.current
      .mockReset()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValue(false);
    await applyCandidate(
      { ...context.context, flush: async () => true, loadUndo: async () => true },
      preview,
      selection,
    );
    expect(context.refreshList).toHaveBeenCalledOnce();
  });

  it('covers undo preconditions, failed/stale previews, empty conflicts, failed undo and null preview state', async () => {
    const previewUndo = vi
      .fn()
      .mockResolvedValueOnce(failure())
      .mockResolvedValueOnce(success({ canUndo: false, conflictSet: null }))
      .mockResolvedValue(
        success({
          canUndo: true,
          record: { applyRecordId: 'record-a' },
          currentDraft: { draftId: 'draft-a', revision: 5 },
        }),
      );
    const undo = vi
      .fn()
      .mockResolvedValueOnce(failure())
      .mockResolvedValue(
        success({ outcome: 'undone', draft: { draftId: 'draft-a', revision: 6 } }),
      );
    const context = setup(
      contractInput<RendererBridgeAdapter>({ candidateAction: { previewUndo, undo } }),
      { emptyState: true },
    );

    await undoCandidate(context.context, null);
    await undoCandidate({ ...context.context, readOnly: true }, undoPreview);
    expect(previewUndo).not.toHaveBeenCalled();

    coordinator.current.mockReturnValue(true);
    await undoCandidate(context.context, undoPreview);
    expect(undo).not.toHaveBeenCalled();

    await undoCandidate(context.context, undoPreview);
    expect(context.conflicts.get()).toEqual([]);

    coordinator.current.mockReset().mockReturnValueOnce(false);
    await undoCandidate(context.context, undoPreview);
    expect(undo).not.toHaveBeenCalled();

    coordinator.current.mockReset().mockReturnValue(true);
    await undoCandidate(context.context, undoPreview);
    expect(context.replacements).toEqual([]);

    coordinator.current.mockReset().mockReturnValueOnce(true).mockReturnValueOnce(false);
    await undoCandidate(context.context, undoPreview);
    expect(context.replacements).toEqual([]);

    coordinator.current.mockReset().mockReturnValue(true);
    await undoCandidate(context.context, undoPreview);
    expect(context.preview.get()).toBeNull();
    expect(context.undo.get()).toBeNull();
  });

  it('covers skeleton stale/failure/wrong-type paths and refresh ownership loss', async () => {
    const skeleton = contractInput({
      candidateId: 'skeleton-a',
      candidateType: 'skeleton',
      skeletonRevisionId: 'revision-a',
      structuredPayload: { tendency: '旧', endingHook: '旧钩子' },
    });
    const editSkeleton = vi
      .fn()
      .mockResolvedValueOnce(failure())
      .mockResolvedValueOnce(failure())
      .mockResolvedValueOnce(success({ candidateType: 'full' }))
      .mockResolvedValue(
        success({
          candidateId: 'skeleton-a',
          candidateType: 'skeleton',
          skeletonRevision: 4,
          structuredPayload: { tendency: '新倾向', endingHook: '新钩子' },
        }),
      );
    const context = setup(contractInput<RendererBridgeAdapter>({ candidate: { editSkeleton } }));

    coordinator.current.mockReturnValueOnce(false);
    await saveSkeletonCandidate(context.context, skeleton, '新', '钩子');
    expect(context.statuses).toEqual([]);

    coordinator.current.mockReset().mockReturnValue(true);
    await saveSkeletonCandidate(context.context, skeleton, '新', '钩子');
    expect(context.statuses.at(-1)).toContain('骨架修订保存失败');

    await saveSkeletonCandidate(context.context, skeleton, '新', '钩子');
    expect(context.statuses.at(-1)).toContain('骨架修订保存失败');

    coordinator.current
      .mockReset()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValue(false);
    await saveSkeletonCandidate(context.context, skeleton, ' 新倾向 ', ' 新钩子 ');
    expect(context.refreshList).toHaveBeenCalledOnce();
    expect(context.statuses.at(-1)).toContain('骨架修订保存失败');
  });
});
