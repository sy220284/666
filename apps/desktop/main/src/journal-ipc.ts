import { randomUUID } from 'node:crypto';

import {
  CoreProjectOperationSchema,
  JOURNAL_COMMANDS,
  JOURNAL_IPC_CHANNELS,
  JournalCatalogResultSchema,
  JournalCatchUpCommandSchema,
  JournalGenerateCommandSchema,
  JournalListCommandSchema,
  JournalMarkAiFailedCommandSchema,
  JournalPreviewCommandSchema,
  JournalPreviewResultSchema,
  JournalUpdateNoteCommandSchema,
  JournalUpdatePreferencesCommandSchema,
  type ErrorCode,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';

import type { CoreSupervisor } from './core-supervisor.js';
import { registerIpcInvokeHandler } from './handler-guard.js';
import { coreOperationFailureSemantics } from './ipc-error-semantics.js';
import { projectOperationKind } from './project-operation-semantics.js';

export interface JournalIpcOptions {
  readonly ipcMain: IpcMain;
  readonly supervisor: CoreSupervisor;
  readonly rendererUrl: string;
}

function trustedSender(event: IpcMainInvokeEvent, rendererUrl: string): boolean {
  return event.senderFrame?.url === rendererUrl;
}

const catalogRegistrations = [
  {
    channel: JOURNAL_IPC_CHANNELS.list,
    command: JOURNAL_COMMANDS.list,
    commandSchema: JournalListCommandSchema,
    fallback: '创作日志读取失败。',
  },
  {
    channel: JOURNAL_IPC_CHANNELS.generate,
    command: JOURNAL_COMMANDS.generate,
    commandSchema: JournalGenerateCommandSchema,
    fallback: '创作复盘生成失败。',
  },
  {
    channel: JOURNAL_IPC_CHANNELS.updateNote,
    command: JOURNAL_COMMANDS.updateNote,
    commandSchema: JournalUpdateNoteCommandSchema,
    fallback: '作者备注保存失败。',
  },
  {
    channel: JOURNAL_IPC_CHANNELS.updatePreferences,
    command: JOURNAL_COMMANDS.updatePreferences,
    commandSchema: JournalUpdatePreferencesCommandSchema,
    fallback: '创作日志设置保存失败。',
  },
  {
    channel: JOURNAL_IPC_CHANNELS.catchUp,
    command: JOURNAL_COMMANDS.catchUp,
    commandSchema: JournalCatchUpCommandSchema,
    fallback: '创作日志补生成失败。',
  },
  {
    channel: JOURNAL_IPC_CHANNELS.markAiFailed,
    command: JOURNAL_COMMANDS.markAiFailed,
    commandSchema: JournalMarkAiFailedCommandSchema,
    fallback: '智能复盘状态更新失败。',
  },
] as const;

async function invokeCatalog(
  options: JournalIpcOptions,
  event: IpcMainInvokeEvent,
  raw: unknown,
  registration: (typeof catalogRegistrations)[number],
) {
  const parsed = registration.commandSchema.safeParse(raw);
  if (!parsed.success || !trustedSender(event, options.rendererUrl)) {
    return JournalCatalogResultSchema.parse({
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
  const result = await options.supervisor.invokeProjectOperation(parsed.data.requestId, operation);
  if (!result.ok) {
    const code: ErrorCode = result.errorCode;
    return JournalCatalogResultSchema.parse({
      ok: false,
      requestId: parsed.data.requestId,
      error: {
        code,
        ...coreOperationFailureSemantics(
          code,
          registration.fallback,
          projectOperationKind(registration.command),
        ),
      },
    });
  }
  return JournalCatalogResultSchema.parse({
    ok: true,
    requestId: parsed.data.requestId,
    data: result.data,
  });
}

export function registerJournalIpc(options: JournalIpcOptions): () => void {
  for (const registration of catalogRegistrations) {
    registerIpcInvokeHandler(options.ipcMain, registration.channel, (event, raw) =>
      invokeCatalog(options, event, raw, registration),
    );
  }

  registerIpcInvokeHandler(options.ipcMain, JOURNAL_IPC_CHANNELS.preview, async (event, raw) => {
    const parsed = JournalPreviewCommandSchema.safeParse(raw);
    if (!parsed.success || !trustedSender(event, options.rendererUrl)) {
      return JournalPreviewResultSchema.parse({
        ok: false,
        requestId: parsed.success ? parsed.data.requestId : randomUUID(),
        error: {
          code: 'COMMON_INVALID_INPUT_001',
          message: '创作复盘预览失败。',
          retryable: false,
        },
      });
    }
    const operation = CoreProjectOperationSchema.parse({
      operation: JOURNAL_COMMANDS.preview,
      input: parsed.data.payload,
    });
    const result = await options.supervisor.invokeProjectOperation(
      parsed.data.requestId,
      operation,
    );
    if (!result.ok) {
      const code: ErrorCode = result.errorCode;
      return JournalPreviewResultSchema.parse({
        ok: false,
        requestId: parsed.data.requestId,
        error: {
          code,
          ...coreOperationFailureSemantics(code, '创作复盘预览失败。', 'query'),
        },
      });
    }
    return JournalPreviewResultSchema.parse({
      ok: true,
      requestId: parsed.data.requestId,
      data: result.data,
    });
  });

  return () => {
    for (const channel of Object.values(JOURNAL_IPC_CHANNELS)) {
      options.ipcMain.removeHandler(channel);
    }
  };
}
