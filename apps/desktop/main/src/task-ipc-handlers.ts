import {
  IPC_CHANNELS,
  TaskCancelCommandSchema,
  TaskGetSnapshotCommandSchema,
  TaskListActiveCommandSchema,
  TaskPortConnectSchema,
} from '@worldforge/contracts';
import { type IpcMainEvent } from 'electron';

import type { IpcHandlerContext } from './handler-guard.js';

export function registerTaskIpcHandlers(context: IpcHandlerContext): () => void {
  const { options, register, rejectUntrusted, invalidRequest, trustedSender } = context;

  register(IPC_CHANNELS.taskGetSnapshot, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = TaskGetSnapshotCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return options.supervisor.invokeTaskCommand(parsed.data);
  });

  register(IPC_CHANNELS.taskCancel, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = TaskCancelCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return options.supervisor.invokeTaskCommand(parsed.data);
  });

  register(IPC_CHANNELS.taskListActive, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = TaskListActiveCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return options.supervisor.invokeTaskCommand(parsed.data);
  });

  const connectTaskEvents = (event: IpcMainEvent, raw: unknown): void => {
    const port = event.ports[0];
    if (!trustedSender(event, options.rendererUrl) || !port || event.ports.length !== 1) {
      for (const receivedPort of event.ports) receivedPort.close();
      return;
    }
    const parsed = TaskPortConnectSchema.safeParse(raw);
    if (!parsed.success || !options.supervisor.attachTaskPort(parsed.data.connectionId, port).ok) {
      port.close();
    }
  };

  options.ipcMain.on(IPC_CHANNELS.taskConnectEvents, connectTaskEvents);

  return () => options.ipcMain.removeListener(IPC_CHANNELS.taskConnectEvents, connectTaskEvents);
}
