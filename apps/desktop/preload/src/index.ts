import {
  AiHasCredentialCommandSchema,
  AiRemoveCredentialCommandSchema,
  AiSetCredentialCommandSchema,
  APP_COMMANDS,
  AppGetCoreStatusCommandSchema,
  AppGetInfoCommandSchema,
  AppInfoResultSchema,
  AppRestartCoreCommandSchema,
  CoreOperationResultSchema,
  CoreStatusResultSchema,
  CredentialPresenceResultSchema,
  CredentialReferenceResultSchema,
  IPC_CHANNELS,
  PROTOCOL_VERSION,
  type WorldforgeBridge,
} from '@worldforge/contracts';
import { contextBridge, ipcRenderer } from 'electron';

interface Parser<Result> {
  parse(input: unknown): Result;
}

function envelope(command: string, payload: unknown): Record<string, unknown> {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId: globalThis.crypto.randomUUID(),
    command,
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
};

contextBridge.exposeInMainWorld('worldforge', bridge);

export const preloadLayer = {
  name: '@worldforge/preload',
  responsibility: 'validated-minimal-renderer-bridge',
} as const;
