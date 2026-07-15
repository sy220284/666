import { randomUUID } from 'node:crypto';

import {
  PROTOCOL_VERSION,
  TaskEventAckSchema,
  TaskEventCursor,
  type TaskEventEnvelope,
} from '@worldforge/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  TaskCommandRouter,
  TaskEventBroadcaster,
  TaskProtocol,
  type TaskMessagePort,
} from '../../packages/core-service/src/task-protocol.js';

class FakeTaskPort implements TaskMessagePort {
  readonly sent: TaskEventEnvelope[] = [];
  readonly #messageListeners = new Set<(message: unknown) => void>();
  readonly #closeListeners = new Set<() => void>();

  postMessage(message: TaskEventEnvelope): void {
    this.sent.push(message);
  }

  onMessage(listener: (message: unknown) => void): () => void {
    this.#messageListeners.add(listener);
    return () => this.#messageListeners.delete(listener);
  }

  onClose(listener: () => void): () => void {
    this.#closeListeners.add(listener);
    return () => this.#closeListeners.delete(listener);
  }

  receive(message: unknown): void {
    for (const listener of this.#messageListeners) listener(message);
  }

  close(): void {
    for (const listener of this.#closeListeners) listener();
  }
}

function taskCommandBase(projectId?: string) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId: randomUUID(),
    ...(projectId ? { projectId } : {}),
    sentAt: new Date().toISOString(),
  } as const;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('task event protocol', () => {
  it('emits the complete AI lifecycle with unique, monotonic envelopes', () => {
    const port = new FakeTaskPort();
    const protocol = new TaskProtocol();
    protocol.attachPort(port);
    const candidateId = randomUUID();
    const completed = protocol.startTask({
      taskType: 'ai.generation',
      runId: randomUUID(),
      initialStage: 'queued',
    });
    expect(completed.setStage('calling_model', 'Calling model')).toBe(true);
    expect(completed.reportUsage({ inputTokens: 120, outputTokens: 30 })).toBe(true);
    expect(completed.saveCandidate(candidateId, 'complete')).toBe(true);
    expect(completed.complete([candidateId])).toBe(true);
    expect(completed.pushDelta('late')).toBe(false);

    const failed = protocol.startTask({
      taskType: 'ai.generation',
      runId: randomUUID(),
      initialStage: 'queued',
    });
    expect(failed.fail('AI_STREAM_INTERRUPTED_009', true)).toBe(true);

    expect(port.sent.map((event) => event.type)).toEqual([
      'ai.started',
      'ai.stage',
      'ai.usage',
      'ai.candidateSaved',
      'ai.completed',
      'ai.started',
      'ai.failed',
    ]);
    expect(new Set(port.sent.map((event) => event.eventId)).size).toBe(port.sent.length);
    expect(port.sent.slice(0, 5).map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(port.sent.slice(5).map((event) => event.sequence)).toEqual([1, 2]);
  });

  it('batches provider deltas and emits no future delta after cancellation', async () => {
    vi.useFakeTimers();
    const port = new FakeTaskPort();
    const protocol = new TaskProtocol({ batchIntervalMs: 30, batchCharacterThreshold: 512 });
    protocol.attachPort(port);
    const task = protocol.startTask({
      taskType: 'ai.generation',
      runId: randomUUID(),
      initialStage: 'queued',
    });

    for (let index = 0; index < 100; index += 1) expect(task.pushDelta('字')).toBe(true);
    expect(port.sent.map((event) => event.type)).toEqual(['ai.started']);
    await vi.advanceTimersByTimeAsync(30);
    expect(port.sent.map((event) => event.type)).toEqual(['ai.started', 'ai.delta']);
    expect(port.sent[1]).toMatchObject({
      sequence: 2,
      payload: { text: '字'.repeat(100), receivedChars: 100 },
    });

    const started = performance.now();
    expect(protocol.cancel(task.taskId)).toEqual({ accepted: true, status: 'cancelled' });
    expect(performance.now() - started).toBeLessThan(500);
    expect(task.signal.aborted).toBe(true);
    expect(task.pushDelta('不应出现')).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(port.sent.map((event) => event.type)).toEqual([
      'ai.started',
      'ai.delta',
      'ai.cancelled',
    ]);
    expect(protocol.getSnapshot(task.taskId)).toMatchObject({
      status: 'cancelled',
      lastSequence: 3,
      receivedChars: 100,
      previewText: '字'.repeat(100),
      previewTruncated: false,
    });
  });

  it('marks an intentionally bounded recovery preview as truncated', () => {
    const protocol = new TaskProtocol({ maximumPreviewCharacters: 4 });
    const task = protocol.startTask({
      taskType: 'ai.generation',
      runId: randomUUID(),
      initialStage: 'queued',
    });
    expect(task.pushDelta('一二三四五六')).toBe(true);
    expect(protocol.getSnapshot(task.taskId)).toMatchObject({
      receivedChars: 6,
      previewText: '一二三四',
      previewTruncated: true,
    });
    protocol.cancel(task.taskId);
  });

  it('bounds slow-consumer delivery and resumes with a detectable sequence gap', () => {
    const broadcaster = new TaskEventBroadcaster({
      maximumUnacknowledgedEvents: 3,
      resumeAtUnacknowledgedEvents: 1,
    });
    const port = new FakeTaskPort();
    const protocol = new TaskProtocol({ broadcaster });
    protocol.attachPort(port);
    const task = protocol.startTask({ taskType: 'index.rebuild' });

    for (let index = 1; index <= 10; index += 1) task.reportProgress(index, 10);
    expect(port.sent).toHaveLength(3);

    for (const event of port.sent.slice(0, 2)) {
      port.receive(
        TaskEventAckSchema.parse({
          protocolVersion: PROTOCOL_VERSION,
          type: 'task.ack',
          eventId: event.eventId,
        }),
      );
    }
    expect(port.sent).toHaveLength(4);
    expect(port.sent[3]?.sequence).toBe(11);

    const cursor = new TaskEventCursor();
    expect(cursor.accept(port.sent[0]!)).toEqual({ kind: 'accepted' });
    expect(cursor.accept(port.sent[1]!)).toEqual({ kind: 'accepted' });
    expect(cursor.accept(port.sent[2]!)).toEqual({ kind: 'accepted' });
    expect(cursor.accept(port.sent[3]!)).toEqual({
      kind: 'gap',
      taskId: task.taskId,
      expectedSequence: 4,
      receivedSequence: 11,
      errorCode: 'TASK_EVENT_GAP_002',
    });
  });

  it('deduplicates eventIds, rejects stale order, and restores from a snapshot', () => {
    const port = new FakeTaskPort();
    const protocol = new TaskProtocol();
    protocol.attachPort(port);
    const task = protocol.startTask({ taskType: 'backup.verify' });
    task.reportProgress(1, 2);
    task.reportProgress(2, 2);

    const cursor = new TaskEventCursor();
    expect(cursor.accept(port.sent[0]!)).toEqual({ kind: 'accepted' });
    expect(cursor.accept(port.sent[0]!)).toEqual({ kind: 'duplicate' });
    expect(cursor.accept(port.sent[2]!)).toMatchObject({
      kind: 'gap',
      expectedSequence: 2,
      receivedSequence: 3,
    });
    cursor.restore(protocol.getSnapshot(task.taskId));
    expect(cursor.accept({ ...port.sent[1]!, eventId: randomUUID() })).toEqual({ kind: 'stale' });
  });

  it('isolates project event ports while preserving global task events', () => {
    const projectA = randomUUID();
    const projectB = randomUUID();
    const globalPort = new FakeTaskPort();
    const projectPort = new FakeTaskPort();
    const protocol = new TaskProtocol();
    protocol.attachPort(globalPort);
    protocol.attachPort(projectPort, projectA);

    protocol.startTask({ taskType: 'project.a', projectId: projectA });
    protocol.startTask({ taskType: 'project.b', projectId: projectB });
    protocol.startTask({ taskType: 'app.global' });

    expect(globalPort.sent.map((event) => event.payload)).toEqual([
      { taskType: 'app.global', stage: 'queued' },
    ]);
    expect(projectPort.sent.map((event) => event.payload)).toEqual([
      { taskType: 'project.a', stage: 'queued' },
      { taskType: 'app.global', stage: 'queued' },
    ]);
  });
});

describe('task command and lifecycle protocol', () => {
  it('enforces project scope and makes duplicate cancellation idempotent', () => {
    const projectId = randomUUID();
    const protocol = new TaskProtocol();
    const router = new TaskCommandRouter(protocol);
    const task = protocol.startTask({ taskType: 'ai.generation', projectId });

    const wrongProject = router.execute({
      ...taskCommandBase(randomUUID()),
      command: 'task.getSnapshot',
      payload: { taskId: task.taskId },
    });
    expect(wrongProject).toMatchObject({
      ok: false,
      error: { code: 'PROJECT_ID_MISMATCH_004' },
    });

    const requestId = randomUUID();
    const cancel = {
      ...taskCommandBase(projectId),
      requestId,
      command: 'task.cancel' as const,
      payload: { taskId: task.taskId },
    };
    const first = router.execute(cancel);
    const duplicate = router.execute(cancel);
    expect(first).toEqual(duplicate);
    expect(first).toMatchObject({ ok: true, data: { accepted: true, status: 'cancelled' } });
  });

  it('stops admission during drain and waits for an atomic stage to finish', async () => {
    const protocol = new TaskProtocol();
    const task = protocol.startTask({ taskType: 'backup.commit' });
    expect(task.setStage('atomic_commit', 'Committing', { cancellable: false })).toBe(true);

    let drained = false;
    const draining = protocol.beginDrain().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);
    expect(() => protocol.startTask({ taskType: 'late.task' })).toThrow(
      'cannot accept another task',
    );

    expect(task.complete()).toBe(true);
    await draining;
    expect(drained).toBe(true);
    expect(protocol.activeTaskCount).toBe(0);
  });
});
