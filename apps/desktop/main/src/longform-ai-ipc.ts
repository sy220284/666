import { randomUUID } from 'node:crypto';

import {
  AiTaskRouteResolutionResultSchema,
  CoreProjectOperationSchema,
  LONGFORM_AI_COMMANDS,
  LONGFORM_AI_IPC_CHANNELS,
  LongformAiEvaluateStyleCommandSchema,
  LongformAiGetSettingsCommandSchema,
  LongformAiListDigestsCommandSchema,
  LongformAiRebuildDigestsCommandSchema,
  LongformAiResolveTaskRouteCommandSchema,
  LongformAiSettingsResultSchema,
  LongformAiUpdateSettingsCommandSchema,
  StoryDigestListResultSchema,
  StoryDigestRebuildCommandResultSchema,
  StyleDeviationResultSchema,
  type ErrorCode,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';

import type { CoreSupervisor } from './core-supervisor.js';
import { registerIpcInvokeHandler } from './handler-guard.js';
import { coreOperationFailureSemantics } from './ipc-error-semantics.js';
import { projectOperationKind } from './project-operation-semantics.js';

export interface LongformAiIpcOptions {
  readonly ipcMain: IpcMain;
  readonly supervisor: CoreSupervisor;
  readonly rendererUrl: string;
}

function trustedSender(event: IpcMainInvokeEvent, rendererUrl: string): boolean {
  return event.senderFrame?.url === rendererUrl;
}

const registrations = [
  {
    channel: LONGFORM_AI_IPC_CHANNELS.getSettings,
    command: LONGFORM_AI_COMMANDS.getSettings,
    commandSchema: LongformAiGetSettingsCommandSchema,
    resultSchema: LongformAiSettingsResultSchema,
    fallback: '长篇智能设置读取失败。',
  },
  {
    channel: LONGFORM_AI_IPC_CHANNELS.updateSettings,
    command: LONGFORM_AI_COMMANDS.updateSettings,
    commandSchema: LongformAiUpdateSettingsCommandSchema,
    resultSchema: LongformAiSettingsResultSchema,
    fallback: '长篇智能设置保存失败。',
  },
  {
    channel: LONGFORM_AI_IPC_CHANNELS.listDigests,
    command: LONGFORM_AI_COMMANDS.listDigests,
    commandSchema: LongformAiListDigestsCommandSchema,
    resultSchema: StoryDigestListResultSchema,
    fallback: '长篇摘要读取失败。',
  },
  {
    channel: LONGFORM_AI_IPC_CHANNELS.rebuildDigests,
    command: LONGFORM_AI_COMMANDS.rebuildDigests,
    commandSchema: LongformAiRebuildDigestsCommandSchema,
    resultSchema: StoryDigestRebuildCommandResultSchema,
    fallback: '长篇摘要重建失败。',
  },
  {
    channel: LONGFORM_AI_IPC_CHANNELS.evaluateStyle,
    command: LONGFORM_AI_COMMANDS.evaluateStyle,
    commandSchema: LongformAiEvaluateStyleCommandSchema,
    resultSchema: StyleDeviationResultSchema,
    fallback: '文风偏离检查失败。',
  },
  {
    channel: LONGFORM_AI_IPC_CHANNELS.resolveTaskRoute,
    command: LONGFORM_AI_COMMANDS.resolveTaskRoute,
    commandSchema: LongformAiResolveTaskRouteCommandSchema,
    resultSchema: AiTaskRouteResolutionResultSchema,
    fallback: '没有可用于当前任务的智能连接。',
  },
] as const;

export function registerLongformAiIpc(options: LongformAiIpcOptions): () => void {
  for (const registration of registrations) {
    registerIpcInvokeHandler(options.ipcMain, registration.channel, async (event, raw) => {
      const parsed = registration.commandSchema.safeParse(raw);
      if (!parsed.success || !trustedSender(event, options.rendererUrl)) {
        return registration.resultSchema.parse({
          ok: false,
          requestId: parsed.success ? parsed.data.requestId : randomUUID(),
          error: {
            code: 'COMMON_INVALID_INPUT_001',
            message: registration.fallback,
            retryable: false,
          },
        });
      }
      const operation = CoreProjectOperationSchema.parse({
        operation: registration.command,
        input: parsed.data.payload,
      });
      const result = await options.supervisor.invokeProjectOperation(
        parsed.data.requestId,
        operation,
      );
      if (!result.ok) {
        const code: ErrorCode = result.errorCode;
        const semantics = coreOperationFailureSemantics(
          code,
          registration.fallback,
          projectOperationKind(registration.command),
        );
        return registration.resultSchema.parse({
          ok: false,
          requestId: parsed.data.requestId,
          error: { code, ...semantics },
        });
      }
      return registration.resultSchema.parse({
        ok: true,
        requestId: parsed.data.requestId,
        data: result.data,
      });
    });
  }

  return () => {
    for (const registration of registrations) options.ipcMain.removeHandler(registration.channel);
  };
}
