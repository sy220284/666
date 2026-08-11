import { type CoreSupervisor } from './core-supervisor.js';
import { type CredentialBroker } from './credential-broker.js';
import { coreOperationFailureSemantics, type CoreOperationKind } from './ipc-error-semantics.js';
import { createDiagnosticId, type PrivacyLogger } from './privacy-logger.js';
import { projectOperationKind } from './project-operation-semantics.js';
import {
  type AppearancePreferences,
  CANDIDATE_IPC_CHANNELS,
  type CommandFailure,
  type CommandResult,
  type DiagnosticPreview,
  type ErrorCode,
  RequestIdSchema,
  type WindowPreferences,
} from '@worldforge/contracts';
import { type IpcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { randomUUID } from 'node:crypto';

export interface IpcHandlerOptions {
  readonly ipcMain: IpcMain;
  readonly supervisor: CoreSupervisor;
  readonly credentialBroker: CredentialBroker;
  readonly rendererUrl: string;
  readonly version: string;
  readonly platform: string;
  readonly enableTestFixtures?: boolean;
  readonly logger: PrivacyLogger;
  readonly getWindowPreferences: () => WindowPreferences;
  readonly setAppearancePreferences: (
    preferences: AppearancePreferences,
  ) => Promise<WindowPreferences>;
  readonly chooseRecentLocation: () => Promise<string | null>;
  readonly chooseProjectCreateParent: () => Promise<string | null>;
  readonly chooseProjectToOpen: () => Promise<string | null>;
  readonly chooseProjectMoveParent: () => Promise<string | null>;
  readonly chooseRecoveryRestoreParent: () => Promise<string | null>;
  readonly chooseRecoveryExportDirectory: () => Promise<string | null>;
  readonly chooseTextImportFile: () => Promise<string | null>;
  readonly chooseTextExportDirectory: () => Promise<string | null>;
  readonly confirmDiagnosticsExport?: (preview: DiagnosticPreview) => Promise<boolean>;
  readonly chooseDiagnosticsDirectory?: () => Promise<string | null>;
}

export type IpcInvokeHandler = (
  event: IpcMainInvokeEvent,
  input: unknown,
) => Promise<unknown> | unknown;

export type IpcInvokeRegister = (channel: string, handler: IpcInvokeHandler) => void;

const activeInvokeGuards = new WeakMap<IpcMain, IpcInvokeRegister>();

/**
 * Installs the single production registration path used by specialty IPC modules.
 * Direct module tests can still register against isolated IpcMain doubles when no production
 * guard is active for that exact instance.
 */
export function installIpcInvokeGuard(ipcMain: IpcMain, register: IpcInvokeRegister): () => void {
  if (activeInvokeGuards.has(ipcMain)) throw new Error('IPC_INVOKE_GUARD_ALREADY_INSTALLED');
  activeInvokeGuards.set(ipcMain, register);
  return () => {
    if (activeInvokeGuards.get(ipcMain) === register) activeInvokeGuards.delete(ipcMain);
  };
}

export function registerIpcInvokeHandler(
  ipcMain: IpcMain,
  channel: string,
  handler: IpcInvokeHandler,
): void {
  const register = activeInvokeGuards.get(ipcMain);
  if (register) {
    register(channel, handler);
    return;
  }
  ipcMain.handle(channel, handler);
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
  details?: CommandFailure['error']['details'],
  userAction?: string,
): CommandFailure {
  return {
    ok: false,
    requestId,
    error: {
      code,
      message,
      retryable,
      ...(diagnosticId ? { diagnosticId } : {}),
      ...(details ? { details } : {}),
      ...(userAction ? { userAction } : {}),
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

export function createIpcHandlerContext(options: IpcHandlerOptions) {
  const invokeChannels = new Set<string>();

  const register: IpcInvokeRegister = (channel, handler): void => {
    invokeChannels.add(channel);
    if (
      channel === CANDIDATE_IPC_CHANNELS.createFixtureCandidate &&
      options.enableTestFixtures !== true
    ) {
      return;
    }
    options.ipcMain.handle(channel, async (event, input) => {
      try {
        return await handler(event, input);
      } catch {
        const requestId = requestIdFrom(input);
        const diagnosticId = createDiagnosticId();
        try {
          await options.logger.log('error', 'ipc.handler.unexpected', {
            requestId,
            operation: channel,
            errorCode: 'COMMON_INTERNAL_999',
            retryable: true,
            diagnosticId,
          });
        } catch {
          // Error conversion must remain available when logging itself fails.
        }
        return failure(
          requestId,
          'COMMON_INTERNAL_999',
          'The operation failed unexpectedly.',
          true,
          diagnosticId,
          undefined,
          '请重试；若问题持续，请导出诊断包。',
        );
      }
    });
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

  const appDataFailure = (
    requestId: string,
    code: ErrorCode,
    details?: CommandFailure['error']['details'],
    operationKind: CoreOperationKind = 'mutation',
  ): CommandFailure => {
    const semantics = coreOperationFailureSemantics(
      code,
      'The local application data operation could not be completed.',
      operationKind,
    );
    return failure(
      requestId,
      code,
      semantics.message,
      semantics.retryable,
      undefined,
      details,
      semantics.userAction,
    );
  };

  const cancelledSelection = (requestId: string): CommandFailure =>
    failure(requestId, 'COMMON_CANCELLED_004', 'The folder selection was cancelled.', false);

  const invokeProject = async (
    requestId: string,
    operation: Parameters<CoreSupervisor['invokeProjectOperation']>[1],
  ): Promise<CommandResult<unknown>> => {
    const result = await options.supervisor.invokeProjectOperation(requestId, operation);
    return result.ok
      ? success(requestId, result.data)
      : appDataFailure(
          requestId,
          result.errorCode,
          'details' in result ? result.details : undefined,
          projectOperationKind(operation.operation),
        );
  };

  const disposeInvokeHandlers = (): void => {
    for (const channel of invokeChannels) options.ipcMain.removeHandler(channel);
    invokeChannels.clear();
  };

  return {
    options,
    register,
    rejectUntrusted,
    invalidRequest,
    appDataFailure,
    cancelledSelection,
    invokeProject,
    trustedSender,
    success,
    failure,
    disposeInvokeHandlers,
  };
}

export type IpcHandlerContext = ReturnType<typeof createIpcHandlerContext>;
