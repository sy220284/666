import { randomUUID } from 'node:crypto';

import {
  PROTOCOL_VERSION,
  TaskEventAckSchema,
  TaskEventEnvelopeSchema,
  type TaskCommand,
  type TaskEventEnvelope,
} from '@worldforge/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  TaskCommandRouter,
  TaskEventBroadcaster,
  TaskProtocol,
  TaskProtocolError,
  type TaskMessagePort,
} from '../../packages/core-service/src/task-protocol.js';

class ControlledPort implements TaskMessagePort {
  readonly sent: TaskEventEnvelope[] = [];
  readonly messageListeners = new Set<(message: unknown) => void>();
  readonly closeListeners = new Set<() => void>();
  throwOnPost = false;
  closeCalls = 0;
  removeMessageCalls = 0;
  removeCloseCalls = 0;

  postMessage(message: TaskEventEnvelope): void {
    if (this.throwOnPost) throw new Error('port closed');
    this.sent.push(message);
  }

  onMessage(listener: (message: unknown) => void): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.removeMessageCalls += 1;
      this.messageListeners.delete(listener);
    };
  }

  onClose(listener: () => void): () => void {
    this.closeListeners.add(listener);
    return () => {
      this.removeCloseCalls += 1;
      this.closeListeners.delete(listener);
    };
  }

  close(): void {
    this.closeCalls += 1;
    for (const listener of [...this.closeListeners]) listener();
  }

  receive(message: unknown): void {
    for (const listener of [...this.messageListeners]) listener(message);
  }
}

function envelope(taskId = randomUUID(), sequence = 1): TaskEventEnvelope {
  return TaskEventEnvelopeSchema.parse({
    protocolVersion: PROTOCOL_VERSION,
    eventId: randomUUID(),
    taskId,
    sequence,
    type: 'task.progress',
    payload: { stage: 'queued' },
    emittedAt: new Date(0).toISOString(),
  });
}

function commandBase(): Pick<TaskCommand, 'protocolVersion' | 'requestId' | 'sentAt'> {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId: randomUUID(),
    sentAt: new Date().toISOString(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('task protocol defensive coverage', () => {
  it('covers broadcaster configuration, optional listeners, close, detach, invalid acks and send failure', () => {
    expect(() => new TaskEventBroadcaster({ maximumUnacknowledgedEvents: 0 })).toThrow(
      'TASK_BACKPRESSURE_CONFIGURATION_INVALID',
    );

    const optionalPort: TaskMessagePort = {
      postMessage: vi.fn(),
      onMessage: () => () => undefined,
    };
    const broadcaster = new TaskEventBroadcaster();
    const detach = broadcaster.attach(optionalPort);
    expect(broadcaster.subscriberCount).toBe(1);
    detach();
    detach();
    expect(broadcaster.subscriberCount).toBe(0);

    const port = new ControlledPort();
    broadcaster.attach(port);
    port.receive({ nope: true });
    const sent = envelope();
    broadcaster.publish(sent);
    port.receive(
      TaskEventAckSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        type: 'task.ack',
        eventId: sent.eventId,
      }),
    );
    expect(port.sent).toEqual([sent]);

    port.throwOnPost = true;
    broadcaster.publish(envelope());
    expect(broadcaster.subscriberCount).toBe(0);
    expect(port.removeMessageCalls).toBe(1);
    expect(port.removeCloseCalls).toBe(1);

    const closePort = new ControlledPort();
    broadcaster.attach(closePort);
    broadcaster.attach(optionalPort);
    broadcaster.close();
    expect(closePort.closeCalls).toBe(1);
    expect(broadcaster.subscriberCount).toBe(0);
  });

  it('bounds skipped tasks, resumes the newest state and covers the defensive empty-key guard', () => {
    const broadcaster = new TaskEventBroadcaster({
      maximumUnacknowledgedEvents: 2,
      resumeAtUnacknowledgedEvents: 1,
      maximumSkippedTasks: 1,
    });
    const port = new ControlledPort();
    broadcaster.attach(port);

    const first = envelope(randomUUID(), 1);
    const second = envelope(randomUUID(), 1);
    const skippedOld = envelope(randomUUID(), 1);
    const skippedNewest = envelope(randomUUID(), 1);
    broadcaster.publish(first);
    broadcaster.publish(second);
    broadcaster.publish(skippedOld);
    broadcaster.publish(skippedNewest);
    expect(port.sent).toEqual([first, second]);

    port.receive(
      TaskEventAckSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        type: 'task.ack',
        eventId: first.eventId,
      }),
    );
    expect(port.sent).toEqual([first, second, skippedNewest]);

    const breakBroadcaster = new TaskEventBroadcaster({
      maximumUnacknowledgedEvents: 3,
      resumeAtUnacknowledgedEvents: 2,
      maximumSkippedTasks: 3,
    });
    const breakPort = new ControlledPort();
    breakBroadcaster.attach(breakPort);
    const breakEvents = Array.from({ length: 5 }, () => envelope());
    for (const event of breakEvents) breakBroadcaster.publish(event);
    breakPort.receive(
      TaskEventAckSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        type: 'task.ack',
        eventId: breakEvents[0]!.eventId,
      }),
    );
    expect(breakPort.sent).toHaveLength(4);

    const originalKeys = Map.prototype.keys;
    vi.spyOn(Map.prototype, 'keys').mockImplementation(function (this: Map<unknown, unknown>) {
      const iterator = originalKeys.call(this);
      if (this.size > 1) {
        iterator.next = () => ({ done: true, value: undefined });
      }
      return iterator;
    });

    const guarded = new TaskEventBroadcaster({
      maximumUnacknowledgedEvents: 2,
      resumeAtUnacknowledgedEvents: 1,
      maximumSkippedTasks: 1,
    });
    const guardedPort = new ControlledPort();
    guarded.attach(guardedPort);
    guarded.publish(envelope());
    guarded.publish(envelope());
    guarded.publish(envelope());
    guarded.publish(envelope());
    expect(guardedPort.sent).toHaveLength(2);
  });

  it('covers invalid protocol configuration, duplicate ids, filtering and admission after drain', async () => {
    expect(() => new TaskProtocol({ batchIntervalMs: 19 })).toThrow(
      'TASK_PROTOCOL_CONFIGURATION_INVALID',
    );

    const protocol = new TaskProtocol();
    expect(protocol.accepting).toBe(true);
    const taskId = randomUUID();
    protocol.startTask({ taskId, taskType: 'first' });
    expect(() => protocol.startTask({ taskId, taskType: 'duplicate' })).toThrow(TaskProtocolError);

    const projectId = randomUUID();
    const otherProjectId = randomUUID();
    protocol.startTask({ taskType: 'project.task', projectId });
    protocol.startTask({ taskType: 'other.task', projectId: otherProjectId });
    expect(protocol.listActive()).toHaveLength(3);
    expect(protocol.listActive(projectId)).toHaveLength(1);

    await protocol.beginDrain();
    expect(protocol.accepting).toBe(false);
    expect(protocol.activeTaskCount).toBe(0);
    expect(() => protocol.startTask({ taskType: 'late' })).toThrow(
      'The Core is draining and cannot accept another task.',
    );
  });

  it('covers terminal operation guards, progress omissions and non-AI operation rejection', () => {
    const protocol = new TaskProtocol();
    const plain = protocol.startTask({ taskType: 'plain.task' });
    expect(plain.reportProgress()).toBe(true);
    expect(plain.pushDelta('x')).toBe(false);
    expect(plain.reportUsage({})).toBe(false);
    expect(plain.saveCandidate(randomUUID(), 'partial')).toBe(false);
    expect(
      plain.saveResult({ resultType: 'candidate', resultId: randomUUID(), candidateKind: 'prose' }),
    ).toBe(false);
    expect(plain.completeResults([])).toBe(false);
    expect(plain.complete()).toBe(true);
    expect(plain.setStage('queued', 'late')).toBe(false);
    expect(plain.reportProgress(1, 2)).toBe(false);
    expect(plain.complete()).toBe(false);
    expect(plain.fail('COMMON_INTERNAL_999', false)).toBe(false);
    expect(() => protocol.cancel(plain.taskId)).toThrow('already finished');

    const plainFailure = protocol.startTask({ taskType: 'plain.failure' });
    expect(plainFailure.fail('COMMON_INTERNAL_999', false)).toBe(true);
    expect(protocol.getSnapshot(plainFailure.taskId)).toMatchObject({
      status: 'failed',
      errorCode: 'COMMON_INTERNAL_999',
    });

    const ai = protocol.startTask({
      taskType: 'ai.generation',
      runId: randomUUID(),
      initialStage: 'queued',
    });
    expect(ai.pushDelta('')).toBe(false);
    expect(ai.saveCandidate(randomUUID(), 'partial')).toBe(true);
    expect(
      ai.saveResult({ resultType: 'candidate', resultId: randomUUID(), candidateKind: 'prose' }),
    ).toBe(true);
    expect(ai.fail('AI_STREAM_INTERRUPTED_009', true)).toBe(true);
    expect(ai.reportUsage({ inputTokens: 1 })).toBe(false);
    expect(ai.saveCandidate(randomUUID(), 'complete')).toBe(false);
    expect(
      ai.saveResult({ resultType: 'candidate', resultId: randomUUID(), candidateKind: 'prose' }),
    ).toBe(false);
    expect(ai.completeResults([])).toBe(false);
  });

  it('flushes threshold chunks and a delayed remainder while keeping preview bounds', async () => {
    vi.useFakeTimers();
    const port = new ControlledPort();
    const protocol = new TaskProtocol({
      batchIntervalMs: 20,
      batchCharacterThreshold: 2,
      maximumBatchCharacters: 3,
      maximumPreviewCharacters: 2,
    });
    protocol.attachPort(port);
    const task = protocol.startTask({
      taskType: 'ai.generation',
      runId: randomUUID(),
      initialStage: 'queued',
    });
    expect(task.pushDelta('abcdefg')).toBe(true);
    expect(protocol.getSnapshot(task.taskId)).toMatchObject({
      receivedChars: 7,
      previewText: 'ab',
      previewTruncated: true,
    });
    await vi.advanceTimersByTimeAsync(20);
    expect(
      port.sent.filter((event) => event.type === 'ai.delta').map((event) => event.payload),
    ).toEqual([
      { text: 'abc', receivedChars: 7 },
      { text: 'def', receivedChars: 7 },
      { text: 'g', receivedChars: 7 },
    ]);
    expect(task.complete()).toBe(true);
  });

  it('resolves an atomic drain waiter through close and clears pending task timers', async () => {
    vi.useFakeTimers();
    const protocol = new TaskProtocol({ batchIntervalMs: 20, batchCharacterThreshold: 100 });
    const task = protocol.startTask({
      taskType: 'ai.generation',
      runId: randomUUID(),
      initialStage: 'queued',
      cancellable: false,
    });
    expect(task.pushDelta('pending')).toBe(true);
    const drain = protocol.beginDrain();
    await Promise.resolve();
    expect(protocol.activeTaskCount).toBe(1);
    protocol.close();
    await drain;
    expect(protocol.accepting).toBe(false);
  });

  it('covers inactive timer cleanup when cancellation races a scheduled delta callback', async () => {
    vi.useFakeTimers();
    const protocol = new TaskProtocol({ batchIntervalMs: 20, batchCharacterThreshold: 100 });
    const task = protocol.startTask({
      taskType: 'ai.generation',
      runId: randomUUID(),
      initialStage: 'queued',
    });
    expect(task.pushDelta('pending')).toBe(true);

    const nativeClearTimeout = globalThis.clearTimeout;
    vi.spyOn(globalThis, 'clearTimeout').mockImplementation(() => undefined);
    protocol.cancel(task.taskId);
    await vi.advanceTimersByTimeAsync(20);
    globalThis.clearTimeout = nativeClearTimeout;
    expect(task.signal.aborted).toBe(true);
  });

  it('covers retained-task trimming with and without a terminal candidate', () => {
    const protocol = new TaskProtocol({ maximumRetainedTasks: 1 });
    const first = protocol.startTask({ taskType: 'active.one' });
    const second = protocol.startTask({ taskType: 'active.two' });
    expect(protocol.activeTaskCount).toBe(2);
    expect(first.complete()).toBe(true);
    protocol.startTask({ taskType: 'active.three' });
    expect(() => protocol.getSnapshot(first.taskId)).toThrow('does not exist');
    expect(protocol.getSnapshot(second.taskId).status).toBe('running');
  });

  it('covers command list, generic validation failure, synthetic TaskProtocolError and idempotent eviction', () => {
    const protocol = new TaskProtocol();
    const router = new TaskCommandRouter(protocol);
    const task = protocol.startTask({ taskType: 'router.task' });

    const listCommand: TaskCommand = {
      ...commandBase(),
      command: 'task.listActive',
      payload: {},
    };
    expect(router.execute(listCommand)).toMatchObject({
      ok: true,
      data: { tasks: [{ taskId: task.taskId }] },
    });

    const invalid: TaskCommand = {
      ...commandBase(),
      command: 'task.getSnapshot',
      payload: { taskId: 'not-a-uuid' },
    };
    expect(router.execute(invalid)).toMatchObject({
      ok: false,
      error: { code: 'COMMON_INVALID_INPUT_001', retryable: false },
    });

    vi.spyOn(protocol, 'listActive').mockImplementation(() => {
      throw new TaskProtocolError('COMMON_CONFLICT_003', 'synthetic', true);
    });
    expect(router.execute({ ...listCommand, requestId: randomUUID() })).toMatchObject({
      ok: false,
      error: { code: 'COMMON_CONFLICT_003', retryable: true },
    });
    vi.restoreAllMocks();

    const evictionProtocol = new TaskProtocol();
    const evictionRouter = new TaskCommandRouter(evictionProtocol);
    const cancellable = evictionProtocol.startTask({ taskType: 'evict.task' });
    for (let index = 0; index < 1_001; index += 1) {
      const result = evictionRouter.execute({
        ...commandBase(),
        command: 'task.cancel',
        payload: { taskId: cancellable.taskId },
      });
      expect(result.ok).toBe(index === 0);
    }

    const guardedProtocol = new TaskProtocol();
    const guardedRouter = new TaskCommandRouter(guardedProtocol);
    const guardedTask = guardedProtocol.startTask({ taskType: 'guarded.evict.task' });
    const originalKeys = Map.prototype.keys;
    vi.spyOn(Map.prototype, 'keys').mockImplementation(function (this: Map<unknown, unknown>) {
      const iterator = originalKeys.call(this);
      if (this.size > 1_000) iterator.next = () => ({ done: true, value: undefined });
      return iterator;
    });
    for (let index = 0; index < 1_001; index += 1) {
      guardedRouter.execute({
        ...commandBase(),
        command: 'task.cancel',
        payload: { taskId: guardedTask.taskId },
      });
    }
  });
});
