import {
  APP_COMMANDS,
  IPC_CHANNELS,
  PROTOCOL_VERSION,
  TaskCancelCommandSchema,
  TaskCancelResultSchema,
  TaskEventAckSchema,
  TaskEventCursor,
  TaskEventEnvelopeSchema,
  TaskGetSnapshotCommandSchema,
  TaskListActiveCommandSchema,
  TaskListActiveResultSchema,
  TaskPortConnectSchema,
  TaskSnapshotResultSchema,
  type WorldforgeBridge,
} from '@worldforge/contracts';
import { ipcRenderer } from 'electron';

import { envelope, invoke } from './bridge-runtime.js';
import { TaskGapRecoveryCoordinator } from './task-gap-recovery.js';

interface IsolatedMessagePort {
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  postMessage(message: unknown): void;
  start(): void;
  close(): void;
}

interface IsolatedMessageChannel {
  readonly port1: IsolatedMessagePort;
  readonly port2: IsolatedMessagePort;
}

const MessageChannelConstructor = (
  globalThis as unknown as {
    readonly MessageChannel: new () => IsolatedMessageChannel;
  }
).MessageChannel;

export function createTaskBridge(): Pick<WorldforgeBridge, 'task'> {
  const task: WorldforgeBridge['task'] = {
    getSnapshot: (taskId, projectId) =>
      invoke(
        IPC_CHANNELS.taskGetSnapshot,
        TaskGetSnapshotCommandSchema.parse(
          envelope(APP_COMMANDS.taskGetSnapshot, { taskId }, projectId),
        ),
        TaskSnapshotResultSchema,
      ),
    cancel: (taskId, projectId) =>
      invoke(
        IPC_CHANNELS.taskCancel,
        TaskCancelCommandSchema.parse(envelope(APP_COMMANDS.taskCancel, { taskId }, projectId)),
        TaskCancelResultSchema,
      ),
    listActive: (projectId) =>
      invoke(
        IPC_CHANNELS.taskListActive,
        TaskListActiveCommandSchema.parse(envelope(APP_COMMANDS.taskListActive, {}, projectId)),
        TaskListActiveResultSchema,
      ),
    subscribe: (listener, projectId) => {
      const channel = new MessageChannelConstructor();
      const cursor = new TaskEventCursor();
      const recoveries = new TaskGapRecoveryCoordinator();
      let closed = false;

      channel.port1.onmessage = ({ data }) => {
        const parsed = TaskEventEnvelopeSchema.safeParse(data);
        if (!parsed.success || closed) return;
        const acknowledge = () =>
          channel.port1.postMessage(
            TaskEventAckSchema.parse({
              protocolVersion: PROTOCOL_VERSION,
              type: 'task.ack',
              eventId: parsed.data.eventId,
            }),
          );
        const disposition = cursor.accept(parsed.data);
        if (disposition.kind === 'accepted') {
          try {
            listener({ kind: 'event', event: parsed.data });
          } finally {
            acknowledge();
          }
          return;
        }
        if (disposition.kind !== 'gap') {
          acknowledge();
          return;
        }

        const taskId = parsed.data.taskId;
        const shouldRecover = recoveries.begin(taskId);
        if (shouldRecover) {
          void recoveries.run(taskId, async () => {
            const result = await task.getSnapshot(taskId, parsed.data.projectId);
            if (!result.ok || closed) return false;
            cursor.restore(result.data);
            listener({ kind: 'snapshot', snapshot: result.data, reason: 'sequence-gap' });
            return true;
          });
        }
        acknowledge();
      };
      channel.port1.start();
      ipcRenderer.postMessage(
        IPC_CHANNELS.taskConnectEvents,
        TaskPortConnectSchema.parse({
          protocolVersion: PROTOCOL_VERSION,
          connectionId: globalThis.crypto.randomUUID(),
          ...(projectId ? { projectId } : {}),
        }),
        [channel.port2 as never],
      );

      return () => {
        if (closed) return;
        closed = true;
        recoveries.clear();
        channel.port1.onmessage = null;
        channel.port1.close();
      };
    },
  };
  return { task };
}
