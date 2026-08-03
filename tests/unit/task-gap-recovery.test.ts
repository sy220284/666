import { describe, expect, it } from 'vitest';

import { TaskGapRecoveryCoordinator } from '../../apps/desktop/preload/src/task-gap-recovery.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('Task缺口恢复协调器', () => {
  it('同一任务恢复期间收到新缺口时，在首个快照后再次恢复', async () => {
    const coordinator = new TaskGapRecoveryCoordinator();
    const first = deferred<boolean>();
    const second = deferred<boolean>();
    let calls = 0;
    expect(coordinator.begin('task-a')).toBe(true);
    const recovering = coordinator.run('task-a', async () => {
      calls += 1;
      return calls === 1 ? first.promise : second.promise;
    });

    await Promise.resolve();
    expect(calls).toBe(1);
    expect(coordinator.begin('task-a')).toBe(false);
    first.resolve(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(2);
    second.resolve(true);
    await recovering;
    expect(coordinator.begin('task-a')).toBe(true);
  });

  it('快照失败后结束当前恢复，后续缺口可以重新发起', async () => {
    const coordinator = new TaskGapRecoveryCoordinator();
    expect(coordinator.begin('task-a')).toBe(true);
    expect(coordinator.begin('task-a')).toBe(false);
    await coordinator.run('task-a', async () => false);
    expect(coordinator.begin('task-a')).toBe(true);
  });

  it('关闭订阅后停止恢复并拒绝新任务', async () => {
    const coordinator = new TaskGapRecoveryCoordinator();
    const pending = deferred<boolean>();
    expect(coordinator.begin('task-a')).toBe(true);
    const recovering = coordinator.run('task-a', () => pending.promise);
    coordinator.clear();
    expect(coordinator.begin('task-b')).toBe(false);
    pending.resolve(true);
    await recovering;
    expect(coordinator.begin('task-a')).toBe(false);
  });
});
