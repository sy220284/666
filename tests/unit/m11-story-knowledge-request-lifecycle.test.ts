import { describe, expect, it } from 'vitest';

import type {
  StoryKnowledgeBridge,
  StoryKnowledgeProjectionInput,
} from '@worldforge/contracts';

import { createRendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { BridgeRequestCoordinator } from '../../apps/desktop/renderer/src/bridge/request-lifecycle.js';
import { bridgeResourceForQueryKey } from '../../apps/desktop/renderer/src/bridge/use-bridge-resource.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const secondProjectId = '22222222-2222-4222-8222-222222222222';
const chapter1Id = '33333333-3333-4333-8333-333333333333';
const chapter2Id = '44444444-4444-4444-8444-444444444444';

function historyInput(
  activeProjectId: string,
  chapterId: string,
): Extract<StoryKnowledgeProjectionInput, { readonly view: 'history' }> {
  return {
    view: 'history',
    projectId: activeProjectId,
    chapterId,
    beforeCreatedAt: null,
    beforeVersionId: null,
    limit: 30,
  };
}

function successResult(input: ReturnType<typeof historyInput>, requestId: string) {
  return contractInput<Awaited<ReturnType<StoryKnowledgeBridge['project']>>>({
    ok: true,
    requestId,
    data: {
      view: 'history',
      projectId: input.projectId,
      bounded: true,
      chapterId: input.chapterId,
      items: [],
      nextBeforeCreatedAt: null,
      nextBeforeVersionId: null,
      candidates: [],
      candidatesTruncated: false,
      recovery: {
        checkpoints: [],
        checkpointsTruncated: false,
        backupFailures: [],
        backupFailuresTruncated: false,
      },
    },
  });
}

function adapterFor(project: StoryKnowledgeBridge['project']) {
  return createRendererBridgeAdapter({}, new BridgeRequestCoordinator(), {
    storyKnowledge: contractInput<StoryKnowledgeBridge>({ project }),
  });
}

describe('M11-04 Story Knowledge 请求生命周期', () => {
  it('失败后重试可在同一读取通道恢复成功', async () => {
    let calls = 0;
    const input = historyInput(projectId, chapter1Id);
    const adapter = adapterFor(async () => {
      calls += 1;
      if (calls === 1) {
        return contractInput<Awaited<ReturnType<StoryKnowledgeBridge['project']>>>({
          ok: false,
          requestId: '55555555-5555-4555-8555-555555555555',
          error: {
            code: 'COMMON_INTERNAL_999',
            message: '读取失败',
            retryable: true,
          },
        });
      }
      return successResult(input, '66666666-6666-4666-8666-666666666666');
    });
    const options = {
      mode: 'replace' as const,
      requestKey: 'story-knowledge:history:first',
      laneKey: `story-knowledge:${projectId}:history`,
    };

    await expect(adapter.storyKnowledge.project(input, options)).resolves.toMatchObject({
      state: 'failure',
      error: { retryable: true },
    });
    await expect(adapter.storyKnowledge.project(input, options)).resolves.toMatchObject({
      state: 'success',
      data: { chapterId: chapter1Id },
    });
    expect(calls).toBe(2);
  });

  it('同项目章节切换时只允许最新 Story Knowledge 结果提交', async () => {
    let releaseFirst = () => undefined;
    let markStarted = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstStarted = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    let calls = 0;
    const adapter = adapterFor(async (rawInput) => {
      calls += 1;
      const input = rawInput as ReturnType<typeof historyInput>;
      if (calls === 1) {
        markStarted();
        await firstGate;
      }
      return successResult(input, calls === 1 ? chapter1Id : chapter2Id);
    });
    const laneKey = `story-knowledge:${projectId}:history`;
    const first = adapter.storyKnowledge.project(historyInput(projectId, chapter1Id), {
      mode: 'replace',
      requestKey: 'story-knowledge:history:chapter-1',
      laneKey,
    });
    await firstStarted;
    const second = adapter.storyKnowledge.project(historyInput(projectId, chapter2Id), {
      mode: 'replace',
      requestKey: 'story-knowledge:history:chapter-2',
      laneKey,
    });
    releaseFirst();

    await expect(first).resolves.toMatchObject({ state: 'stale' });
    await expect(second).resolves.toMatchObject({
      state: 'success',
      data: { chapterId: chapter2Id },
    });
    expect(calls).toBe(2);
  });

  it('cancelAll 会让未完成的 Story Knowledge 请求失效', async () => {
    let markStarted = () => undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const adapter = adapterFor(async () => {
      markStarted();
      return new Promise<Awaited<ReturnType<StoryKnowledgeBridge['project']>>>(() => undefined);
    });
    const pending = adapter.storyKnowledge.project(historyInput(projectId, chapter1Id), {
      mode: 'replace',
      requestKey: 'story-knowledge:history:cancel-all',
      laneKey: `story-knowledge:${projectId}:history`,
    });
    await started;
    adapter.cancelAll();

    await expect(pending).resolves.toMatchObject({ state: 'stale' });
  });

  it('项目切换后隐藏旧项目已经解析的 Story Knowledge 资源', () => {
    const previous = {
      state: 'success' as const,
      data: { projectId, chapterId: chapter1Id },
      error: null,
    };

    expect(
      bridgeResourceForQueryKey(
        `story-knowledge:${secondProjectId}:${chapter2Id}`,
        `story-knowledge:${projectId}:${chapter1Id}`,
        previous,
      ),
    ).toEqual({ state: 'loading', data: null, error: null });
  });
});
