import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { ProjectTaskBarrier } from '../../packages/core-service/src/project-task-protocol.js';
import { TaskProtocol, TaskProtocolError } from '../../packages/core-service/src/task-protocol.js';

function setupBarrier(options: { readonly timeoutMs?: number; readonly pollIntervalMs?: number } = {}) {
  const tasks = new TaskProtocol();
  const barrier = new ProjectTaskBarrier(tasks, options);
  return { tasks, barrier };
}

describe('M10-17 project task barrier', () => {
  it('blocks new tasks for the draining project while allowing unrelated tasks', async () => {
    const { barrier } = setupBarrier({ timeoutMs: 1_000, pollIntervalMs: 2 });
    const projectId = randomUUID();
    const otherProjectId = randomUUID();
    const atomicTask = barrier.startTask({
      taskType: 'ai.generation',
      projectId,
      cancellable: false,
    });

    const draining = barrier.withProjectDrain(projectId, async () => 'closed');
    expect(barrier.isProjectDraining(projectId)).toBe(true);
    expect(() => barrier.startTask({ taskType: 'ai.generation', projectId })).toThrowError(
      TaskProtocolError,
    );

    const unrelated = barrier.startTask({
      taskType: 'ai.generation',
      projectId: otherProjectId,
    });
    unrelated.complete();
    atomicTask.complete();

    await expect(draining).resolves.toBe('closed');
    expect(barrier.isProjectDraining(projectId)).toBe(false);
  });

  it('cancels cancellable tasks before running the project lifecycle operation', async () => {
    const { tasks, barrier } = setupBarrier({ timeoutMs: 1_000, pollIntervalMs: 2 });
    const projectId = randomUUID();
    const task = barrier.startTask({
      taskType: 'ai.generation',
      projectId,
      cancellable: true,
    });

    await expect(
      barrier.withProjectDrain(projectId, async () => {
        expect(task.signal.aborted).toBe(true);
        expect(tasks.listActive(projectId)).toEqual([]);
        return 'moved';
      }),
    ).resolves.toBe('moved');
  });

  it('times out before touching project lifecycle state and releases the drain guard', async () => {
    const { barrier } = setupBarrier({ timeoutMs: 15, pollIntervalMs: 2 });
    const projectId = randomUUID();
    const task = barrier.startTask({
      taskType: 'ai.generation',
      projectId,
      cancellable: false,
    });
    let operationStarted = false;

    await expect(
      barrier.withProjectDrain(projectId, async () => {
        operationStarted = true;
      }),
    ).rejects.toMatchObject({ code: 'COMMON_TIMEOUT_005' });
    expect(operationStarted).toBe(false);
    expect(barrier.isProjectDraining(projectId)).toBe(false);

    task.complete();
    const next = barrier.startTask({ taskType: 'ai.generation', projectId });
    next.complete();
  });

  it('leaves global Core drain owned by the original TaskProtocol instance', async () => {
    const { tasks, barrier } = setupBarrier({ timeoutMs: 1_000, pollIntervalMs: 2 });
    const projectId = randomUUID();
    const task = barrier.startTask({ taskType: 'ai.generation', projectId, cancellable: true });

    await expect(tasks.beginDrain()).resolves.toBeUndefined();
    expect(task.signal.aborted).toBe(true);
    expect(tasks.accepting).toBe(false);
    expect(tasks.activeTaskCount).toBe(0);
    expect(barrier.isProjectDraining(projectId)).toBe(false);

    tasks.close();
  });
});
