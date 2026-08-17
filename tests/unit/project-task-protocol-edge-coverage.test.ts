import { randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { ProjectTaskBarrier } from '../../packages/core-service/src/project-task-protocol.js';
import { TaskProtocol, TaskProtocolError } from '../../packages/core-service/src/task-protocol.js';

describe('project task barrier edge coverage', () => {
  it('validates both drain timing controls and delegates global task operations', () => {
    const tasks = new TaskProtocol();
    expect(() => new ProjectTaskBarrier(tasks, { timeoutMs: 0 })).toThrow(
      'PROJECT_TASK_DRAIN_CONFIGURATION_INVALID',
    );
    expect(() => new ProjectTaskBarrier(tasks, { pollIntervalMs: 0 })).toThrow(
      'PROJECT_TASK_DRAIN_CONFIGURATION_INVALID',
    );

    const barrier = new ProjectTaskBarrier(tasks);
    const globalTask = barrier.startTask({ taskType: 'global.edge' });
    expect(barrier.getSnapshot(globalTask.taskId)).toMatchObject({ taskId: globalTask.taskId });
    expect(barrier.cancel(globalTask.taskId)).toEqual({ accepted: true, status: 'cancelled' });
  });

  it('keeps domain canceller registration idempotent but rejects a competing owner', () => {
    const barrier = new ProjectTaskBarrier(new TaskProtocol());
    const first = vi.fn(async () => false);
    const second = vi.fn(async () => false);
    barrier.setDomainCanceller(first);
    barrier.setDomainCanceller(first);
    expect(() => barrier.setDomainCanceller(second)).toThrow(
      'PROJECT_TASK_DOMAIN_CANCELLER_ALREADY_REGISTERED',
    );
  });

  it('rejects reentrant project drains while the first drain is active', async () => {
    const tasks = new TaskProtocol();
    const barrier = new ProjectTaskBarrier(tasks, { timeoutMs: 1_000, pollIntervalMs: 1 });
    const projectId = randomUUID();
    const atomic = barrier.startTask({ taskType: 'atomic.edge', projectId, cancellable: false });
    const first = barrier.withProjectDrain(projectId, async () => 'done');
    await Promise.resolve();
    await expect(
      barrier.withProjectDrain(projectId, async () => 'duplicate'),
    ).rejects.toMatchObject({
      code: 'COMMON_CONFLICT_003',
    });
    atomic.complete();
    await expect(first).resolves.toBe('done');
  });

  it('lets a domain canceller terminate a task without invoking TaskProtocol.cancel', async () => {
    const tasks = new TaskProtocol();
    const barrier = new ProjectTaskBarrier(tasks, { timeoutMs: 1_000, pollIntervalMs: 1 });
    const projectId = randomUUID();
    const task = barrier.startTask({ taskType: 'domain.edge', projectId });
    const cancelSpy = vi.spyOn(tasks, 'cancel');
    barrier.setDomainCanceller(async (taskId, scopedProjectId) => {
      expect(taskId).toBe(task.taskId);
      expect(scopedProjectId).toBe(projectId);
      task.complete();
      return true;
    });

    await expect(barrier.withProjectDrain(projectId, async () => 'closed')).resolves.toBe('closed');
    expect(cancelSpy).not.toHaveBeenCalled();
  });

  it('falls back to TaskProtocol.cancel when a domain canceller declines the task', async () => {
    const tasks = new TaskProtocol();
    const barrier = new ProjectTaskBarrier(tasks, { timeoutMs: 1_000, pollIntervalMs: 1 });
    const projectId = randomUUID();
    const task = barrier.startTask({ taskType: 'domain.decline', projectId });
    barrier.setDomainCanceller(async () => false);

    await expect(barrier.withProjectDrain(projectId, async () => 'closed')).resolves.toBe('closed');
    expect(task.signal.aborted).toBe(true);
  });

  it('propagates unexpected cancellation errors instead of treating them as non-cancellable', async () => {
    const tasks = new TaskProtocol();
    const barrier = new ProjectTaskBarrier(tasks, { timeoutMs: 1_000, pollIntervalMs: 1 });
    const projectId = randomUUID();
    barrier.startTask({ taskType: 'cancel.error', projectId });
    vi.spyOn(tasks, 'cancel').mockImplementation(() => {
      throw new TaskProtocolError('COMMON_INTERNAL_999', 'synthetic cancellation failure');
    });

    await expect(barrier.withProjectDrain(projectId, async () => undefined)).rejects.toMatchObject({
      code: 'COMMON_INTERNAL_999',
    });
    expect(barrier.isProjectDraining(projectId)).toBe(false);
  });

  it('returns immediately when a drained project has no active tasks', async () => {
    const barrier = new ProjectTaskBarrier(new TaskProtocol(), {
      timeoutMs: 1_000,
      pollIntervalMs: 1,
    });
    const projectId = randomUUID();
    await expect(barrier.withProjectDrain(projectId, async () => 'empty')).resolves.toBe('empty');
  });
});
