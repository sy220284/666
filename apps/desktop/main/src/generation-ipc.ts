import { randomUUID } from 'node:crypto';

import {
  CoreGenerationOperationSchema,
  GENERATION_IPC_CHANNELS,
  GenerationCancelCommandSchema,
  GenerationDiscardPartialCommandSchema,
  GenerationGetModelSupportCommandSchema,
  GenerationGetRunCommandSchema,
  GenerationListRunsCommandSchema,
  GenerationSavePartialCommandSchema,
  GenerationStartCommandSchema,
  PROVIDER_CORE_OPERATIONS,
  RequestIdSchema,
  type CommandFailure,
  type CommandResult,
  type ErrorCode,
  type GenerationRun,
  type ProviderConfig,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';

import type { CoreSupervisor } from './core-supervisor.js';
import type { CredentialBroker } from './credential-broker.js';
import { registerIpcInvokeHandler } from './handler-guard.js';
import type { PrivacyLogger } from './privacy-logger.js';

export interface GenerationIpcOptions {
  readonly ipcMain: IpcMain;
  readonly supervisor: CoreSupervisor;
  readonly credentialBroker: CredentialBroker;
  readonly rendererUrl: string;
  readonly logger: PrivacyLogger;
}

function success<T>(requestId: string, data: T): CommandResult<T> {
  return { ok: true, requestId, data };
}

function requestIdFrom(raw: unknown): string {
  if (raw && typeof raw === 'object' && 'requestId' in raw) {
    const parsed = RequestIdSchema.safeParse(raw.requestId);
    if (parsed.success) return parsed.data;
  }
  return randomUUID();
}

function failure(requestId: string, code: ErrorCode): CommandFailure {
  const messages: Partial<Record<ErrorCode, string>> = {
    AI_PROVIDER_NOT_CONFIGURED_001: '未找到Provider配置。',
    AI_CREDENTIAL_MISSING_002: 'Provider凭据缺失、归属不匹配或安全存储不可用。',
    AI_RUN_NOT_FOUND_011: '未找到生成任务。',
    AI_RUN_ALREADY_FINISHED_012: '生成任务已经结束，无法重复执行该操作。',
    CANDIDATE_BASE_CONFLICT_002: '生成所基于的当前稿已经变化。',
    PROJECT_READ_ONLY_005: '项目当前为只读状态。',
    COMMON_INVALID_INPUT_001: '生成请求无效。',
  };
  return {
    ok: false,
    requestId,
    error: {
      code,
      message: messages[code] ?? '生成操作未完成。',
      retryable: [
        'AI_CONNECTION_FAILED_003',
        'AI_RATE_LIMITED_005',
        'AI_REQUEST_TIMEOUT_006',
        'AI_STREAM_INTERRUPTED_009',
        'COMMON_TIMEOUT_005',
        'COMMON_INTERNAL_999',
      ].includes(code),
    },
  };
}

async function providerFor(
  options: GenerationIpcOptions,
  requestId: string,
  providerId: string,
): Promise<
  | { readonly ok: true; readonly config: ProviderConfig; readonly credential: string | null }
  | { readonly ok: false; readonly result: CommandFailure }
> {
  const providerResult = await options.supervisor.invokeProviderOperation(requestId, {
    operation: PROVIDER_CORE_OPERATIONS.get,
    providerId,
  });
  if (!providerResult.ok) {
    return { ok: false, result: failure(requestId, providerResult.errorCode) };
  }
  if (providerResult.operation !== PROVIDER_CORE_OPERATIONS.get || !providerResult.data.provider) {
    return { ok: false, result: failure(requestId, 'AI_PROVIDER_NOT_CONFIGURED_001') };
  }
  const config = providerResult.data.provider;
  if (!config.credentialRef) return { ok: true, config, credential: null };
  try {
    const credential = await options.credentialBroker.resolveForProvider(
      providerId,
      config.credentialRef,
    );
    return credential
      ? { ok: true, config, credential }
      : { ok: false, result: failure(requestId, 'AI_CREDENTIAL_MISSING_002') };
  } catch {
    return { ok: false, result: failure(requestId, 'AI_CREDENTIAL_MISSING_002') };
  }
}

export function registerGenerationIpc(options: GenerationIpcOptions): () => void {
  const rejectUntrusted = (event: IpcMainInvokeEvent, raw: unknown): CommandFailure | null =>
    event.senderFrame?.url === options.rendererUrl
      ? null
      : failure(requestIdFrom(raw), 'COMMON_INVALID_INPUT_001');
  const invalid = (raw: unknown): CommandFailure =>
    failure(requestIdFrom(raw), 'COMMON_INVALID_INPUT_001');

  registerIpcInvokeHandler(options.ipcMain, GENERATION_IPC_CHANNELS.start, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const command = GenerationStartCommandSchema.safeParse(raw);
    if (!command.success) return invalid(raw);
    const resolved = await providerFor(
      options,
      command.data.requestId,
      command.data.payload.providerId,
    );
    if (!resolved.ok) return resolved.result;
    const result = await options.supervisor.invokeGenerationOperation(command.data.requestId, {
      operation: command.data.command,
      input: command.data.payload,
      provider: resolved.config,
      credential: resolved.credential,
    });
    if (!result.ok) return failure(command.data.requestId, result.errorCode);
    if (result.operation !== command.data.command) {
      return failure(command.data.requestId, 'COMMON_INTERNAL_999');
    }
    await options.logger.log('info', 'generation.started', {
      requestId: command.data.requestId,
      runId: result.data.run.runId,
      taskId: result.data.taskId,
      projectId: result.data.run.projectId,
      providerId: result.data.run.providerId,
      model: result.data.run.actualModel,
    });
    return success(command.data.requestId, result.data);
  });

  const registrations = [
    {
      channel: GENERATION_IPC_CHANNELS.getRun,
      schema: GenerationGetRunCommandSchema,
    },
    {
      channel: GENERATION_IPC_CHANNELS.listRuns,
      schema: GenerationListRunsCommandSchema,
    },
    {
      channel: GENERATION_IPC_CHANNELS.cancel,
      schema: GenerationCancelCommandSchema,
    },
    {
      channel: GENERATION_IPC_CHANNELS.savePartial,
      schema: GenerationSavePartialCommandSchema,
    },
    {
      channel: GENERATION_IPC_CHANNELS.discardPartial,
      schema: GenerationDiscardPartialCommandSchema,
    },
    {
      channel: GENERATION_IPC_CHANNELS.getModelSupport,
      schema: GenerationGetModelSupportCommandSchema,
    },
  ] as const;
  for (const registration of registrations) {
    registerIpcInvokeHandler(options.ipcMain, registration.channel, async (event, raw) => {
      const rejected = rejectUntrusted(event, raw);
      if (rejected) return rejected;
      const command = registration.schema.safeParse(raw);
      if (!command.success) return invalid(raw);
      const operation = CoreGenerationOperationSchema.parse({
        operation: command.data.command,
        input: command.data.payload,
      });
      const result = await options.supervisor.invokeGenerationOperation(
        command.data.requestId,
        operation,
      );
      if (!result.ok) return failure(command.data.requestId, result.errorCode);
      if (result.operation !== command.data.command) {
        return failure(command.data.requestId, 'COMMON_INTERNAL_999');
      }
      return success(command.data.requestId, result.data as GenerationRun | unknown);
    });
  }

  return () => {
    options.ipcMain.removeHandler(GENERATION_IPC_CHANNELS.start);
    for (const registration of registrations) options.ipcMain.removeHandler(registration.channel);
  };
}
