import { describe, expect, it, vi } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { useGenerationRunActions } from '../../apps/desktop/renderer/src/features/writing/use-generation-run-actions.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const success = <Data>(data: Data) => ({ state: 'success' as const, data });
const commandPrefix = 'writing:project-a:chapter-a:';

describe('Writing Generation运行操作', () => {
  it('没有活动Run时不调用取消或部分结果接口', async () => {
    const cancel = vi.fn();
    const savePartial = vi.fn();
    const discardPartial = vi.fn();
    const bridge = contractInput<RendererBridgeAdapter>({
      generation: { cancel, savePartial, discardPartial },
    });
    const actions = useGenerationRunActions({
      activeRun: null,
      bridge,
      projectId: 'project-a',
      commandPrefix,
      setPending: vi.fn(),
      refreshCandidates: vi.fn(async () => undefined),
      setActiveRun: vi.fn(),
      setStatus: vi.fn(),
    });

    await actions.cancelGeneration();
    await actions.decidePartial('save');
    await actions.decidePartial('discard');

    expect(cancel).not.toHaveBeenCalled();
    expect(savePartial).not.toHaveBeenCalled();
    expect(discardPartial).not.toHaveBeenCalled();
  });

  it.each([
    ['available', '生成已取消；可保存或丢弃已收到的部分。'],
    ['none', '生成已取消。'],
  ] as const)('取消成功时按部分结果状态更新文案：%s', async (partialStatus, expectedStatus) => {
    const run = contractInput({ runId: 'run-a', partialStatus });
    const cancel = vi.fn(async () => success(run));
    const setActiveRun = vi.fn();
    const setStatus = vi.fn();
    const actions = useGenerationRunActions({
      activeRun: run,
      bridge: contractInput<RendererBridgeAdapter>({ generation: { cancel } }),
      projectId: 'project-a',
      commandPrefix,
      setPending: vi.fn(),
      refreshCandidates: vi.fn(async () => undefined),
      setActiveRun,
      setStatus,
    });

    await actions.cancelGeneration();

    expect(cancel).toHaveBeenCalledWith({ projectId: 'project-a', runId: 'run-a' });
    expect(setActiveRun).toHaveBeenCalledWith(run);
    expect(setStatus).toHaveBeenCalledWith(expectedStatus);
  });

  it.each([
    ['save', '部分结果已保存为受限候选。'],
    ['discard', '部分结果已丢弃。'],
  ] as const)('处理部分结果后刷新候选列表：%s', async (decision, expectedStatus) => {
    const activeRun = contractInput({ runId: 'run-a' });
    const nextRun = contractInput({ runId: 'run-a', status: 'cancelled' });
    const savePartial = vi.fn(async () => success({ run: nextRun }));
    const discardPartial = vi.fn(async () => success({ run: nextRun }));
    const refreshCandidates = vi.fn(async () => undefined);
    const setActiveRun = vi.fn();
    const setStatus = vi.fn();
    const actions = useGenerationRunActions({
      activeRun,
      bridge: contractInput<RendererBridgeAdapter>({
        generation: { savePartial, discardPartial },
      }),
      projectId: 'project-a',
      commandPrefix,
      setPending: vi.fn(),
      refreshCandidates,
      setActiveRun,
      setStatus,
    });

    await actions.decidePartial(decision);

    const expected = { projectId: 'project-a', runId: 'run-a' };
    if (decision === 'save') {
      expect(savePartial).toHaveBeenCalledWith(expected);
      expect(discardPartial).not.toHaveBeenCalled();
    } else {
      expect(discardPartial).toHaveBeenCalledWith(expected);
      expect(savePartial).not.toHaveBeenCalled();
    }
    expect(setActiveRun).toHaveBeenCalledWith(nextRun);
    expect(setStatus).toHaveBeenCalledWith(expectedStatus);
    expect(refreshCandidates).toHaveBeenCalledTimes(1);
  });
});
