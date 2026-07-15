import { randomUUID } from 'node:crypto';

import {
  AiHasCredentialCommandSchema,
  AiRemoveCredentialCommandSchema,
  AiSetCredentialCommandSchema,
  AppGetCoreStatusCommandSchema,
  AppGetInfoCommandSchema,
  AppRestartCoreCommandSchema,
  IPC_CHANNELS,
  PROTOCOL_VERSION,
  RequestIdSchema,
  TaskCancelCommandSchema,
  TaskGetSnapshotCommandSchema,
  TaskListActiveCommandSchema,
  TaskPortConnectSchema,
  type CommandFailure,
  type CommandResult,
  type ErrorCode,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron';

import type { CoreSupervisor } from './core-supervisor.js';
import type { CredentialBroker } from './credential-broker.js';
import { createDiagnosticId, type PrivacyLogger } from './privacy-logger.js';

interface IpcHandlerOptions {
  readonly ipcMain: IpcMain;
  readonly supervisor: CoreSupervisor;
  readonly credentialBroker: CredentialBroker;
  readonly rendererUrl: string;
  readonly version: string;
  readonly platform: string;
  readonly logger: PrivacyLogger;
}

function success<T>(requestId: string, data: T): CommandResult<T> {
  return { ok: true, requestId, data };
}

function failure(
  requestId: string,
  code: ErrorCode,
  message: string,
  retryable: boolean,
  diagnosticId?: string,
): CommandFailure {
  return {
    ok: false,
    requestId,
    error: {
      code,
      message,
      retryable,
      ...(diagnosticId ? { diagnosticId } : {}),
    },
  };
}

function trustedSender(event: IpcMainInvokeEvent | IpcMainEvent, rendererUrl: string): boolean {
  return event.senderFrame?.url === rendererUrl;
}

function requestIdFrom(raw: unknown): string {
  if (raw && typeof raw === 'object' && 'requestId' in raw) {
    const parsed = RequestIdSchema.safeParse(raw.requestId);
    if (parsed.success) return parsed.data;
  }
  return randomUUID();
}

export function registerIpcHandlers(options: IpcHandlerOptions): () => void {
  const invokeChannels = [
    IPC_CHANNELS.appGetInfo,
    IPC_CHANNELS.appGetCoreStatus,
    IPC_CHANNELS.appRestartCore,
    IPC_CHANNELS.aiSetCredential,
    IPC_CHANNELS.aiRemoveCredential,
    IPC_CHANNELS.aiHasCredential,
    IPC_CHANNELS.taskGetSnapshot,
    IPC_CHANNELS.taskCancel,
    IPC_CHANNELS.taskListActive,
  ] as const;
  const register = (
    channel: string,
    handler: (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown> | unknown,
  ): void => {
    options.ipcMain.handle(channel, handler);
  };

  const rejectUntrusted = (event: IpcMainInvokeEvent, raw: unknown): CommandFailure | null => {
    if (trustedSender(event, options.rendererUrl)) return null;
    return failure(
      requestIdFrom(raw),
      'COMMON_INVALID_INPUT_001',
      'The request origin is not trusted.',
      false,
    );
  };

  const invalidRequest = (raw: unknown): CommandFailure =>
    failure(requestIdFrom(raw), 'COMMON_INVALID_INPUT_001', 'The request was invalid.', false);

  register(IPC_CHANNELS.appGetInfo, (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = AppGetInfoCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return success(parsed.data.requestId, {
      version: options.version,
      platform: options.platform,
      protocolVersion: PROTOCOL_VERSION,
    });
  });

  register(IPC_CHANNELS.appGetCoreStatus, (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = AppGetCoreStatusCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return success(parsed.data.requestId, options.supervisor.getStatus());
  });

  register(IPC_CHANNELS.appRestartCore, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = AppRestartCoreCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    const result = await options.supervisor.restart();
    return success(parsed.data.requestId, {
      accepted: result.ok,
      status: options.supervisor.getStatus(),
    });
  });

  register(IPC_CHANNELS.aiSetCredential, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = AiSetCredentialCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    try {
      const credentialRef = await options.credentialBroker.store(
        parsed.data.payload.providerId,
        parsed.data.payload.credential,
      );
      return success(parsed.data.requestId, { credentialRef });
    } catch {
      const diagnosticId = createDiagnosticId();
      await options.logger.log('error', 'credential.store.failed', {
        providerId: parsed.data.payload.providerId,
        errorCode: 'AI_CREDENTIAL_MISSING_002',
        diagnosticId,
      });
      return failure(
        parsed.data.requestId,
        'AI_CREDENTIAL_MISSING_002',
        'The credential could not be stored securely.',
        true,
        diagnosticId,
      );
    }
  });

  register(IPC_CHANNELS.aiRemoveCredential, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = AiRemoveCredentialCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    const exists = await options.credentialBroker.remove(parsed.data.payload.credentialRef);
    return success(parsed.data.requestId, { exists });
  });

  register(IPC_CHANNELS.aiHasCredential, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = AiHasCredentialCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    const exists = await options.credentialBroker.has(parsed.data.payload.credentialRef);
    return success(parsed.data.requestId, { exists });
  });

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

  return () => {
    for (const channel of invokeChannels) options.ipcMain.removeHandler(channel);
    options.ipcMain.removeListener(IPC_CHANNELS.taskConnectEvents, connectTaskEvents);
  };
}
