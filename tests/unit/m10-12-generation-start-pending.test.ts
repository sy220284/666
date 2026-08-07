import { describe, expect, it, vi } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { startGenerationTask } from '../../apps/desktop/renderer/src/features/writing/generation-start.js';
import { rendererCommandCoordinatorFor } from '../../apps/desktop/renderer/src/runtime/command-coordinator.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

function deferred() {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function inputFor(
  bridge: RendererBridgeAdapter,
  pending: boolean[],
  statuses: string[],
  flush: () => Promise<boolean> = async () => true,
) {
  return {
    bridge,
    projectId: 'project-a',
    chapterId: 'chapter-a',
    commandPrefix: 'writing:project-a:chapter-a:',
    draft: {
      draftId: 'draft-a',
      chapterId: 'chapter-a',
      revision: 1,
      blocks: [],
    },
    providerId: 'provider-a',
    readOnly: false,
    flush,
    generationMode: 'chapter' as const,
    chapterSource: 'direct_chapter_goal' as const,
    chapterGoal: '推进冲突',
    tendency: '',
    generationInstruction: '',
    targetCharacters: 2_000,
    candidateCount: 3,
    sceneBeats: [],
    selectedSkeletonId: '',
    acknowledgeStaleSkeleton: false,
    mergeMappingMode: 'segment' as const,
    mergeCandidateIds: new Set<string>(),
    mergeBeatSources: {},
    getRewriteSelectionAnchor: async () => null,
    continuationOfRunId: null,
    intentOverride: null,
    setPending: (value: boolean) => pending.push(value),
    setStatus: (value: string) => statuses.push(value),
    setLastIntent: () => undefined,
    onStarted: () => undefined,
  };
}

describe('M10-12 Generation启动等待状态', () => {
  it('在Bridge抛出异常后释放pending并提供可重试提示', async () => {
    const pending: boolean[] = [];
    const statuses: string[] = [];
    const bridge = contractInput<RendererBridgeAdapter>({
      generation: {
        start: async () => {
          throw new Error('BRIDGE_FAILED');
        },
      },
    });

    await startGenerationTask(inputFor(bridge, pending, statuses));

    expect(pending).toEqual([true, false]);
    expect(statuses.at(-1)).toContain('界面与本地服务通信失败');
  });

  it('拒绝同一章节的重复启动且仅由原命令释放pending', async () => {
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending: boolean[] = [];
    const statuses: string[] = [];
    const start = vi.fn(async () => {
      await started;
      return {
        state: 'success' as const,
        data: { run: { stage: 'queued' }, taskId: 'task-a' },
      };
    });
    const bridge = contractInput<RendererBridgeAdapter>({ generation: { start } });
    const input = inputFor(bridge, pending, statuses);

    const first = startGenerationTask(input);
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    await startGenerationTask(input);
    expect(statuses.at(-1)).toContain('正在处理中');
    expect(pending).toEqual([true]);

    release();
    await first;
    expect(pending).toEqual([true, false]);
  });

  it('章节切换可在自动保存尚未结束时失效旧启动', async () => {
    const gate = deferred();
    const pending: boolean[] = [];
    const statuses: string[] = [];
    const start = vi.fn();
    const bridge = contractInput<RendererBridgeAdapter>({ generation: { start } });
    const input = inputFor(bridge, pending, statuses, () => gate.promise);

    const starting = startGenerationTask(input);
    expect(pending).toEqual([true]);
    rendererCommandCoordinatorFor(input.setPending).invalidatePrefix(input.commandPrefix);
    gate.resolve(true);
    await starting;

    expect(start).not.toHaveBeenCalled();
    expect(pending).toEqual([true, false]);
  });
});
