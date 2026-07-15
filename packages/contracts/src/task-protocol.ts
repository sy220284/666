import { z } from 'zod';

import { ErrorCodeSchema, type ErrorCode } from './error-codes.js';

export const TASK_PROTOCOL_VERSION = 1 as const;
export const TaskIdSchema = z.uuid();
export const TaskEventIdSchema = z.uuid();
export const ProjectIdSchema = z.uuid();
export const TaskTypeSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9._-]*$/);
export const TaskStageSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9._-]*$/);
export const TaskStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']);
export const AIStageSchema = z.enum([
  'queued',
  'assembling_constraints',
  'calling_model',
  'receiving_output',
  'parsing_output',
  'saving_candidate',
  'validating_candidate',
  'completed',
]);

export const TaskSnapshotSchema = z.strictObject({
  taskId: TaskIdSchema,
  taskType: TaskTypeSchema,
  projectId: ProjectIdSchema.optional(),
  status: TaskStatusSchema,
  stage: TaskStageSchema,
  lastSequence: z.number().int().nonnegative(),
  startedAt: z.iso.datetime(),
  elapsedMs: z.number().int().nonnegative(),
  receivedChars: z.number().int().nonnegative().optional(),
  resultIds: z.array(z.uuid()).max(1_000).optional(),
  errorCode: ErrorCodeSchema.optional(),
});

const commandEnvelopeBase = {
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: z.uuid(),
  projectId: ProjectIdSchema.optional(),
  sentAt: z.iso.datetime(),
};

export const TaskGetSnapshotCommandSchema = z.strictObject({
  ...commandEnvelopeBase,
  command: z.literal('task.getSnapshot'),
  payload: z.strictObject({ taskId: TaskIdSchema }),
});

export const TaskCancelCommandSchema = z.strictObject({
  ...commandEnvelopeBase,
  command: z.literal('task.cancel'),
  payload: z.strictObject({ taskId: TaskIdSchema }),
});

export const TaskListActiveCommandSchema = z.strictObject({
  ...commandEnvelopeBase,
  command: z.literal('task.listActive'),
  payload: z.strictObject({}),
});

export const TaskCommandSchema = z.discriminatedUnion('command', [
  TaskGetSnapshotCommandSchema,
  TaskCancelCommandSchema,
  TaskListActiveCommandSchema,
]);

export const TaskCancelDataSchema = z.strictObject({
  accepted: z.boolean(),
  status: TaskStatusSchema,
});

export const TaskListActiveDataSchema = z.strictObject({
  tasks: z.array(TaskSnapshotSchema).max(1_000),
});

const eventEnvelopeBase = {
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  eventId: TaskEventIdSchema,
  taskId: TaskIdSchema,
  projectId: ProjectIdSchema.optional(),
  sequence: z.number().int().positive(),
  emittedAt: z.iso.datetime(),
};

const TaskProgressPayloadSchema = z
  .strictObject({
    stage: TaskStageSchema,
    current: z.number().int().nonnegative().optional(),
    total: z.number().int().positive().optional(),
  })
  .refine(
    (value) =>
      (value.current === undefined && value.total === undefined) ||
      (value.current !== undefined && value.total !== undefined && value.current <= value.total),
    { message: 'Progress requires a valid current/total pair.' },
  );

const AIUsagePayloadSchema = z
  .strictObject({
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
  })
  .refine((value) => value.inputTokens !== undefined || value.outputTokens !== undefined, {
    message: 'Usage requires at least one token count.',
  });

export const TaskEventEnvelopeSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...eventEnvelopeBase,
    type: z.literal('task.started'),
    payload: z.strictObject({ taskType: TaskTypeSchema, stage: TaskStageSchema }),
  }),
  z.strictObject({
    ...eventEnvelopeBase,
    type: z.literal('task.stage'),
    payload: z.strictObject({ stage: TaskStageSchema, message: z.string().min(1).max(512) }),
  }),
  z.strictObject({
    ...eventEnvelopeBase,
    type: z.literal('task.progress'),
    payload: TaskProgressPayloadSchema,
  }),
  z.strictObject({
    ...eventEnvelopeBase,
    type: z.literal('task.warning'),
    payload: z.strictObject({ errorCode: ErrorCodeSchema, message: z.string().min(1).max(512) }),
  }),
  z.strictObject({
    ...eventEnvelopeBase,
    type: z.literal('task.completed'),
    payload: z.strictObject({ resultIds: z.array(z.uuid()).max(1_000) }),
  }),
  z.strictObject({
    ...eventEnvelopeBase,
    type: z.literal('task.cancelled'),
    payload: z.strictObject({ partialAvailable: z.boolean() }),
  }),
  z.strictObject({
    ...eventEnvelopeBase,
    type: z.literal('task.failed'),
    payload: z.strictObject({ errorCode: ErrorCodeSchema, retryable: z.boolean() }),
  }),
  z.strictObject({
    ...eventEnvelopeBase,
    type: z.literal('ai.started'),
    payload: z.strictObject({ runId: z.uuid(), stage: AIStageSchema }),
  }),
  z.strictObject({
    ...eventEnvelopeBase,
    type: z.literal('ai.stage'),
    payload: z.strictObject({ stage: AIStageSchema, message: z.string().min(1).max(512) }),
  }),
  z.strictObject({
    ...eventEnvelopeBase,
    type: z.literal('ai.delta'),
    payload: z.strictObject({
      text: z.string().min(1).max(65_536),
      receivedChars: z.number().int().nonnegative(),
    }),
  }),
  z.strictObject({
    ...eventEnvelopeBase,
    type: z.literal('ai.usage'),
    payload: AIUsagePayloadSchema,
  }),
  z.strictObject({
    ...eventEnvelopeBase,
    type: z.literal('ai.candidateSaved'),
    payload: z.strictObject({
      candidateId: z.uuid(),
      completeness: z.enum(['complete', 'partial']),
    }),
  }),
  z.strictObject({
    ...eventEnvelopeBase,
    type: z.literal('ai.completed'),
    payload: z.strictObject({ candidateIds: z.array(z.uuid()).max(1_000) }),
  }),
  z.strictObject({
    ...eventEnvelopeBase,
    type: z.literal('ai.cancelled'),
    payload: z.strictObject({ partialAvailable: z.boolean() }),
  }),
  z.strictObject({
    ...eventEnvelopeBase,
    type: z.literal('ai.failed'),
    payload: z.strictObject({ errorCode: ErrorCodeSchema, retryable: z.boolean() }),
  }),
]);

export const TaskPortConnectSchema = z.strictObject({
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  connectionId: z.uuid(),
  projectId: ProjectIdSchema.optional(),
});

export const TaskEventAckSchema = z.strictObject({
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  type: z.literal('task.ack'),
  eventId: TaskEventIdSchema,
});

export type TaskSnapshot = z.infer<typeof TaskSnapshotSchema>;
export type TaskCommand = z.infer<typeof TaskCommandSchema>;
export type TaskEventEnvelope = z.infer<typeof TaskEventEnvelopeSchema>;
export type TaskEventAck = z.infer<typeof TaskEventAckSchema>;

export type TaskEventDisposition =
  | { readonly kind: 'accepted' }
  | { readonly kind: 'duplicate' }
  | { readonly kind: 'stale' }
  | {
      readonly kind: 'gap';
      readonly taskId: string;
      readonly expectedSequence: number;
      readonly receivedSequence: number;
      readonly errorCode: Extract<ErrorCode, 'TASK_EVENT_GAP_002'>;
    };

export class TaskEventCursor {
  readonly #lastSequence = new Map<string, number>();
  readonly #seenEventIds = new Map<string, true>();
  readonly #maximumSeenEvents: number;

  constructor(maximumSeenEvents = 4_096) {
    this.#maximumSeenEvents = maximumSeenEvents;
  }

  accept(event: TaskEventEnvelope): TaskEventDisposition {
    if (this.#seenEventIds.has(event.eventId)) return { kind: 'duplicate' };
    this.#remember(event.eventId);

    const lastSequence = this.#lastSequence.get(event.taskId) ?? 0;
    if (event.sequence <= lastSequence) return { kind: 'stale' };
    const expectedSequence = lastSequence + 1;
    if (event.sequence !== expectedSequence) {
      return {
        kind: 'gap',
        taskId: event.taskId,
        expectedSequence,
        receivedSequence: event.sequence,
        errorCode: 'TASK_EVENT_GAP_002',
      };
    }

    this.#lastSequence.set(event.taskId, event.sequence);
    return { kind: 'accepted' };
  }

  restore(snapshot: TaskSnapshot): void {
    this.#lastSequence.set(snapshot.taskId, snapshot.lastSequence);
  }

  #remember(eventId: string): void {
    this.#seenEventIds.set(eventId, true);
    while (this.#seenEventIds.size > this.#maximumSeenEvents) {
      const oldest = this.#seenEventIds.keys().next().value;
      if (typeof oldest !== 'string') break;
      this.#seenEventIds.delete(oldest);
    }
  }
}
