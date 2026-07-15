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
  type CommandFailure,
  type CommandResult,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';

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
  code: string,
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

function trustedSender(event: IpcMainInvokeEvent, rendererUrl: string): boolean {
  return event.senderFrame?.url === rendererUrl;
}

export function registerIpcHandlers(options: IpcHandlerOptions): () => void {
  const channels = Object.values(IPC_CHANNELS);
  const register = (
    channel: string,
    handler: (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown> | unknown,
  ): void => {
    options.ipcMain.handle(channel, handler);
  };

  const rejectUntrusted = (event: IpcMainInvokeEvent, raw: unknown): CommandFailure | null => {
    if (trustedSender(event, options.rendererUrl)) return null;
    const requestId =
      raw && typeof raw === 'object' && 'requestId' in raw && typeof raw.requestId === 'string'
        ? raw.requestId
        : randomUUID();
    return failure(requestId, 'IPC_SENDER_REJECTED', 'The request origin is not trusted.', false);
  };

  register(IPC_CHANNELS.appGetInfo, (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = AppGetInfoCommandSchema.safeParse(raw);
    if (!parsed.success) {
      return failure(randomUUID(), 'IPC_INVALID_REQUEST', 'The request was invalid.', false);
    }
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
    if (!parsed.success) {
      return failure(randomUUID(), 'IPC_INVALID_REQUEST', 'The request was invalid.', false);
    }
    return success(parsed.data.requestId, options.supervisor.getStatus());
  });

  register(IPC_CHANNELS.appRestartCore, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = AppRestartCoreCommandSchema.safeParse(raw);
    if (!parsed.success) {
      return failure(randomUUID(), 'IPC_INVALID_REQUEST', 'The request was invalid.', false);
    }
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
    if (!parsed.success) {
      return failure(randomUUID(), 'IPC_INVALID_REQUEST', 'The request was invalid.', false);
    }
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
        errorCode: 'CREDENTIAL_STORE_FAILED',
        diagnosticId,
      });
      return failure(
        parsed.data.requestId,
        'CREDENTIAL_STORE_FAILED',
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
    if (!parsed.success) {
      return failure(randomUUID(), 'IPC_INVALID_REQUEST', 'The request was invalid.', false);
    }
    const exists = await options.credentialBroker.remove(parsed.data.payload.credentialRef);
    return success(parsed.data.requestId, { exists });
  });

  register(IPC_CHANNELS.aiHasCredential, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = AiHasCredentialCommandSchema.safeParse(raw);
    if (!parsed.success) {
      return failure(randomUUID(), 'IPC_INVALID_REQUEST', 'The request was invalid.', false);
    }
    const exists = await options.credentialBroker.has(parsed.data.payload.credentialRef);
    return success(parsed.data.requestId, { exists });
  });

  return () => {
    for (const channel of channels) options.ipcMain.removeHandler(channel);
  };
}
