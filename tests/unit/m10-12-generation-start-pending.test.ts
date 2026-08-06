import { describe, expect, it, vi } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { startGenerationTask } from '../../apps/desktop/renderer/src/features/writing/generation-start.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

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

    await startGenerationTask({
      bridge,
      projectId: 'project-a',
      chapterId: 'chapter-a',
      draft: {
        draftId: 'draft-a',
        chapterId: 'chapter-a',
        revision: 1,
        blocks: [],
      },
      providerId: 'provider-a',
      readOnly: false,
      flush: async () => true,
      generationMode: 'chapter',
      chapterSource: 'direct_chapter_goal',
      chapterGoal: '推进冲突',
      tendency: '',
      generationInstruction: '',
      targetCharacters: 2_000,
      candidateCount: 3,
      sceneBeats: [],
      selectedSkeletonId: '',
      acknowledgeStaleSkeleton: false,
      mergeMappingMode: 'segment',
      mergeCandidateIds: new Set(),
      mergeBeatSources: {},
      getRewriteSelectionAnchor: async () => null,
      continuationOfRunId: null,
      intentOverride: null,
      setPending: (value) => pending.push(value),
      setStatus: (value) => statuses.push(value),
      setLastIntent: () => undefined,
      onStarted: () => undefined,
    });

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
    const input = {
      bridge,
      projectId: 'project-a',
      chapterId: 'chapter-a',
      draft: {
        draftId: 'draft-a',
        chapterId: 'chapter-a',
        revision: 1,
        blocks: [],
      },
      providerId: 'provider-a',
      readOnly: false,
      flush: async () => true,
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

    const first = startGenerationTask(input);
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    await startGenerationTask(input);
    expect(statuses.at(-1)).toContain('正在处理中');
    expect(pending).toEqual([true]);

    release();
    await first;
    expect(pending).toEqual([true, false]);
  });
});
