import { describe, expect, it, vi } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { prepareProjectSessionTransition } from '../../apps/desktop/renderer/src/app/project-session-transition.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('M10-13 项目会话原子切换', () => {
  it('continuation读取期间命令失效时不产生可提交的半状态', async () => {
    const gate = deferred<ReturnType<typeof contractInput>>();
    let current = true;
    const getContinuation = vi.fn(() => gate.promise);
    const bridge = contractInput<RendererBridgeAdapter>({
      project: { getContinuation },
    });
    const project = contractInput({ projectId: 'project-a' });

    const transition = prepareProjectSessionTransition({
      bridge,
      project,
      isCurrent: () => current,
    });
    current = false;
    gate.resolve(
      contractInput({
        state: 'success',
        data: { projectId: 'project-a', chapterId: 'chapter-a' },
      }),
    );

    await expect(transition).resolves.toEqual({ state: 'stale' });
  });

  it('只在当前命令内同时返回项目与continuation', async () => {
    const continuation = contractInput({ projectId: 'project-a', chapterId: 'chapter-a' });
    const bridge = contractInput<RendererBridgeAdapter>({
      project: { getContinuation: vi.fn(async () => ({ state: 'success', data: continuation })) },
    });
    const project = contractInput({ projectId: 'project-a' });

    await expect(
      prepareProjectSessionTransition({ bridge, project, isCurrent: () => true }),
    ).resolves.toEqual({ state: 'ready', project, continuation });
  });

  it('关闭项目无需读取continuation并返回原子空状态', async () => {
    const getContinuation = vi.fn();
    const bridge = contractInput<RendererBridgeAdapter>({ project: { getContinuation } });

    await expect(
      prepareProjectSessionTransition({ bridge, project: null, isCurrent: () => true }),
    ).resolves.toEqual({ state: 'ready', project: null, continuation: null });
    expect(getContinuation).not.toHaveBeenCalled();
  });
});
