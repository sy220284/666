import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { ProjectTaskProtocol } from '../../packages/core-service/src/project-task-protocol.js';
import { TaskProtocolError } from '../../packages/core-service/src/task-protocol.js';

describe('M10-17 project task barrier', () => {
  it('blocks new tasks for the draining project while allowing unrelated tasks', async () => {
    const protocol = new ProjectTaskProtocol({}, { timeoutMs: 1_000, pollIntervalMs: 2 });
    const projectId = randomUUID();
    const otherProjectId = randomUUID();
    const atomicTask = protocol.startTask({
      taskType: 'ai.generation',
      projectId,
      cancellable: false,
    });

    const draining = protocol.withProjectDrain(projectId, async () => 'closed');
    expect(protocol.isProjectDraining(projectId)).toBe(true);
    expect(() => protocol.startTask({ taskType: 'ai.generation', projectId })).toThrowError(
      TaskProtocolError,
    );

    const unrelated = protocol.startTask({
      taskType: 'ai.generation',
      projectId: otherProjectId,
    });
    unrelated.complete();
    atomicTask.complete();

    await expect(draining).resolves.toBe('closed');
    expect(protocol.isProjectDraining(projectId)).toBe(false);
  });

  it('cancels cancellable tasks before running the project lifecycle operation', async () => {
    const protocol = new ProjectTaskProtocol({}, { timeoutMs: 1_000, pollIntervalMs: 2 });
    const projectId = randomUUID();
    const task = protocol.startTask({
      taskType: 'ai.generation',
      projectId,
      cancellable: true,
    });

    await expect(
      protocol.withProjectDrain(projectId, async () => {
        expect(task.signal.aborted).toBe(true);
        expect(protocol.listActive(projectId)).toEqual([]);
        return 'moved';
      }),
    ).resolves.toBe('moved');
  });

  it('times out before touching project lifecycle state and releases the drain guard', async () => {
    const protocol = new ProjectTaskProtocol({}, { timeoutMs: 15, pollIntervalMs: 2 });
    const projectId = randomUUID();
    const task = protocol.startTask({
      taskType: 'ai.generation',
      projectId,
      cancellable: false,
    });
    let operationStarted = false;

    await expect(
      protocol.withProjectDrain(projectId, async () => {
        operationStarted = true;
      }),
    ).rejects.toMatchObject({ code: 'COMMON_TIMEOUT_005' });
    expect(operationStarted).toBe(false);
    expect(protocol.isProjectDraining(projectId)).toBe(false);

    task.complete();
    const next = protocol.startTask({ taskType: 'ai.generation', projectId });
    next.complete();
  });
});
