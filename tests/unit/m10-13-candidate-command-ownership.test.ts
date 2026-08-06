import { describe, expect, it, vi } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import {
  applyCandidate,
  type CandidateActionContext,
} from '../../apps/desktop/renderer/src/features/writing/candidate-preview-actions.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function contextFor(bridge: RendererBridgeAdapter) {
  const pending: boolean[] = [];
  const statuses: string[] = [];
  const context = contractInput<CandidateActionContext>({
    bridge,
    projectId: 'project-a',
    chapterId: 'chapter-a',
    commandPrefix: 'writing:project-a:chapter-a:',
    readOnly: false,
    refreshList: vi.fn(async () => []),
    onDraftReplace: vi.fn(),
    setPreview: vi.fn(),
    setUndoPreview: vi.fn(),
    setSelectedDocument: vi.fn(),
    setSkeletonEndingHook: vi.fn(),
    setSkeletonTendency: vi.fn(),
    setConflicts: vi.fn(),
    setStatus: (value: string) => statuses.push(value),
    setPending: (value: boolean) => pending.push(value),
  });
  return { context, pending, statuses };
}

const preview = contractInput({
  candidate: { candidateId: 'candidate-a', status: 'pending' },
  draft: { draftId: 'draft-a', revision: 4 },
});
const selection = contractInput({ mode: 'all' });

describe('M10-13 Candidate command ownership', () => {
  it('releases pending and exposes a stable message when the bridge throws', async () => {
    const context = contextFor(
      contractInput<RendererBridgeAdapter>({
        candidateAction: {
          apply: vi.fn(async () => Promise.reject(new Error('transport failed'))),
        },
      }),
    );

    await applyCandidate(
      { ...context.context, flush: async () => true, loadUndo: async () => true },
      preview,
      selection,
    );

    expect(context.pending).toEqual([true, false]);
    expect(context.statuses.at(-1)).toBe('建议稿操作未完成，当前稿保持不变，请重试。');
  });

  it('rejects a second mutation without releasing the first command pending state', async () => {
    const gate = deferred<ReturnType<typeof contractInput>>();
    const apply = vi.fn(() => gate.promise);
    const context = contextFor(
      contractInput<RendererBridgeAdapter>({ candidateAction: { apply } }),
    );
    const input = { ...context.context, flush: async () => true, loadUndo: async () => true };

    const first = applyCandidate(input, preview, selection);
    await Promise.resolve();
    await applyCandidate(input, preview, selection);

    expect(apply).toHaveBeenCalledTimes(1);
    expect(context.pending).toEqual([true]);
    expect(context.statuses.at(-1)).toBe('已有建议稿操作正在处理，请完成后再试。');

    gate.resolve(
      contractInput({
        state: 'success',
        data: { outcome: 'conflict', conflictSet: { conflicts: [] } },
      }),
    );
    await first;
    expect(context.pending).toEqual([true, false]);
  });
});
