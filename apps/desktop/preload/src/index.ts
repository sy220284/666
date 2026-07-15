import {
  AiHasCredentialCommandSchema,
  AiRemoveCredentialCommandSchema,
  AiSetCredentialCommandSchema,
  APP_COMMANDS,
  AppGetCoreStatusCommandSchema,
  AppGetInfoCommandSchema,
  AppGetWindowPreferencesCommandSchema,
  AppInfoResultSchema,
  AppRestartCoreCommandSchema,
  AppSetAppearancePreferencesCommandSchema,
  CoreOperationResultSchema,
  CoreStatusResultSchema,
  CredentialPresenceResultSchema,
  CredentialReferenceResultSchema,
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
  WindowPreferencesResultSchema,
  type WorldforgeBridge,
} from '@worldforge/contracts';
import { contextBridge, ipcRenderer } from 'electron';

interface Parser<Result> {
  parse(input: unknown): Result;
}

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

function envelope(command: string, payload: unknown, projectId?: string): Record<string, unknown> {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId: globalThis.crypto.randomUUID(),
    command,
    ...(projectId ? { projectId } : {}),
    payload,
    sentAt: new Date().toISOString(),
  };
}

async function invoke<Result>(
  channel: string,
  command: unknown,
  resultSchema: Parser<Result>,
): Promise<Result> {
  const raw: unknown = await ipcRenderer.invoke(channel, command);
  return resultSchema.parse(raw);
}

const bridge: WorldforgeBridge = {
  app: {
    getInfo: () =>
      invoke(
        IPC_CHANNELS.appGetInfo,
        AppGetInfoCommandSchema.parse(envelope(APP_COMMANDS.getInfo, {})),
        AppInfoResultSchema,
      ),
    getCoreStatus: () =>
      invoke(
        IPC_CHANNELS.appGetCoreStatus,
        AppGetCoreStatusCommandSchema.parse(envelope(APP_COMMANDS.getCoreStatus, {})),
        CoreStatusResultSchema,
      ),
    restartCore: () =>
      invoke(
        IPC_CHANNELS.appRestartCore,
        AppRestartCoreCommandSchema.parse(envelope(APP_COMMANDS.restartCore, {})),
        CoreOperationResultSchema,
      ),
    getWindowPreferences: () =>
      invoke(
        IPC_CHANNELS.appGetWindowPreferences,
        AppGetWindowPreferencesCommandSchema.parse(envelope(APP_COMMANDS.getWindowPreferences, {})),
        WindowPreferencesResultSchema,
      ),
    setAppearancePreferences: (preferences) =>
      invoke(
        IPC_CHANNELS.appSetAppearancePreferences,
        AppSetAppearancePreferencesCommandSchema.parse(
          envelope(APP_COMMANDS.setAppearancePreferences, preferences),
        ),
        WindowPreferencesResultSchema,
      ),
  },
  ai: {
    setCredential: (providerId, credential) =>
      invoke(
        IPC_CHANNELS.aiSetCredential,
        AiSetCredentialCommandSchema.parse(
          envelope(APP_COMMANDS.setCredential, { providerId, credential }),
        ),
        CredentialReferenceResultSchema,
      ),
    removeCredential: (credentialRef) =>
      invoke(
        IPC_CHANNELS.aiRemoveCredential,
        AiRemoveCredentialCommandSchema.parse(
          envelope(APP_COMMANDS.removeCredential, { credentialRef }),
        ),
        CredentialPresenceResultSchema,
      ),
    hasCredential: (credentialRef) =>
      invoke(
        IPC_CHANNELS.aiHasCredential,
        AiHasCredentialCommandSchema.parse(envelope(APP_COMMANDS.hasCredential, { credentialRef })),
        CredentialPresenceResultSchema,
      ),
  },
  task: {
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
      const recoveries = new Set<string>();
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
        if (disposition.kind !== 'gap' || recoveries.has(parsed.data.taskId)) {
          acknowledge();
          return;
        }

        recoveries.add(parsed.data.taskId);
        void bridge.task
          .getSnapshot(parsed.data.taskId, parsed.data.projectId)
          .then((result) => {
            if (!result.ok || closed) return;
            cursor.restore(result.data);
            listener({ kind: 'snapshot', snapshot: result.data, reason: 'sequence-gap' });
          })
          .finally(() => recoveries.delete(parsed.data.taskId));
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
  },
};

contextBridge.exposeInMainWorld('worldforge', bridge);

export const preloadLayer = {
  name: '@worldforge/preload',
  responsibility: 'validated-minimal-renderer-bridge',
} as const;
