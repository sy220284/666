import { describe, expect, it } from 'vitest';

import { RendererCommandCoordinator } from '../../apps/desktop/renderer/src/runtime/command-coordinator.js';

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('M10-13 Renderer命令失效边界', () => {
  it('组件卸载或上下文切换后把旧命令结果标记为stale', async () => {
    const coordinator = new RendererCommandCoordinator();
    const gate = deferred<string>();
    const command = coordinator.run({
      key: 'writing:project-a:chapter-a:candidate-preview',
      operation: () => gate.promise,
    });

    expect(coordinator.activeCount).toBe(1);
    expect(coordinator.invalidate('writing:project-a:chapter-a:candidate-preview')).toBe(true);
    gate.resolve('old-result');

    await expect(command).resolves.toMatchObject({ state: 'stale' });
    expect(coordinator.activeCount).toBe(0);
  });

  it('按功能上下文前缀统一失效全部相关命令', async () => {
    const coordinator = new RendererCommandCoordinator();
    const first = deferred<void>();
    const second = deferred<void>();
    const firstCommand = coordinator.run({
      key: 'writing:project-a:chapter-a:generation-start',
      operation: () => first.promise,
    });
    const secondCommand = coordinator.run({
      key: 'writing:project-a:chapter-a:candidate-apply',
      operation: () => second.promise,
    });

    expect(coordinator.invalidatePrefix('writing:project-a:chapter-a:')).toBe(2);
    first.resolve();
    second.resolve();

    await expect(firstCommand).resolves.toMatchObject({ state: 'stale' });
    await expect(secondCommand).resolves.toMatchObject({ state: 'stale' });
    expect(coordinator.activeCount).toBe(0);
  });

  it('retains every active token while bounding completed token history', async () => {
    const coordinator = new RendererCommandCoordinator();
    const gates = Array.from({ length: 520 }, () => deferred<void>());
    const commands = gates.map((gate, index) =>
      coordinator.run({
        key: `active:${index}`,
        operation: () => gate.promise,
      }),
    );

    expect(coordinator.activeCount).toBe(520);
    for (let index = 0; index < gates.length; index += 1) {
      expect(coordinator.currentToken(`active:${index}`)).not.toBeNull();
    }

    for (const gate of gates) gate.resolve();
    await Promise.all(commands);

    expect(coordinator.activeCount).toBe(0);
    expect(coordinator.retainedTokenCount).toBeLessThanOrEqual(512);
  });

  it('bounds completed command token retention without evicting active owners', async () => {
    const coordinator = new RendererCommandCoordinator();

    for (let index = 0; index < 700; index += 1) {
      await coordinator.run({
        key: `completed:${index}`,
        operation: async () => index,
      });
    }

    expect(coordinator.activeCount).toBe(0);
    expect(coordinator.retainedTokenCount).toBeLessThanOrEqual(512);
  });
});
