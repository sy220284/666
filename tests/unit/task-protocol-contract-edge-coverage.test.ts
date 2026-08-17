import { randomUUID } from 'node:crypto';

import {
  PROTOCOL_VERSION,
  TaskEventCursor,
  TaskEventEnvelopeSchema,
  type TaskEventEnvelope,
} from '@worldforge/contracts';
import { describe, expect, it, vi } from 'vitest';

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

describe('task event cursor contract edge coverage', () => {
  it('evicts the oldest seen event and covers the defensive empty-key guard', () => {
    const taskId = randomUUID();
    const cursor = new TaskEventCursor(1);
    const first = envelope(taskId, 1);
    const second = envelope(taskId, 2);
    expect(cursor.accept(first)).toEqual({ kind: 'accepted' });
    expect(cursor.accept(second)).toEqual({ kind: 'accepted' });
    expect(cursor.accept(first)).toEqual({ kind: 'stale' });

    const originalKeys = Map.prototype.keys;
    vi.spyOn(Map.prototype, 'keys').mockImplementation(function (this: Map<unknown, unknown>) {
      const iterator = originalKeys.call(this);
      if (this.size > 1) iterator.next = () => ({ done: true, value: undefined });
      return iterator;
    });
    const guarded = new TaskEventCursor(1);
    expect(guarded.accept(envelope(randomUUID(), 1))).toEqual({ kind: 'accepted' });
    expect(guarded.accept(envelope(randomUUID(), 1))).toEqual({ kind: 'accepted' });
  });
});
