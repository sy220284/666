import { randomUUID } from "node:crypto";
import path from "node:path";

import {
  CoreProjectOperationSchema,
  RESEARCH_COMMANDS,
  RESEARCH_IPC_CHANNELS,
  ResearchAddLinkCommandSchema,
  ResearchCatalogResultSchema,
  ResearchCreateNoteCommandSchema,
  ResearchDeleteAttachmentCommandSchema,
  ResearchImportAttachmentCommandSchema,
  ResearchListCommandSchema,
  ResearchRemoveLinkCommandSchema,
  ResearchSetNoteStatusCommandSchema,
  ResearchUpdateNoteCommandSchema,
  type ErrorCode,
} from "@worldforge/contracts";
import {
  BrowserWindow,
  dialog,
  type IpcMain,
  type IpcMainInvokeEvent,
} from "electron";

import type { CoreSupervisor } from "./core-supervisor.js";
import { registerIpcInvokeHandler } from "./handler-guard.js";
import { coreOperationFailureSemantics } from "./ipc-error-semantics.js";
import { projectOperationKind } from "./project-operation-semantics.js";

export interface ResearchIpcOptions {
  readonly ipcMain: IpcMain;
  readonly supervisor: CoreSupervisor;
  readonly rendererUrl: string;
}

function trustedSender(
  event: IpcMainInvokeEvent,
  rendererUrl: string,
): boolean {
  return event.senderFrame?.url === rendererUrl;
}

async function chooseAttachmentFile(
  event: IpcMainInvokeEvent,
): Promise<string | null> {
  if (
    process.env.WORLDFORGE_E2E === "1" &&
    process.env.WORLDFORGE_E2E_RESEARCH_ATTACHMENT
  ) {
    const injected = process.env.WORLDFORGE_E2E_RESEARCH_ATTACHMENT;
    if (!path.isAbsolute(injected)) {
      throw new Error("WORLDFORGE_E2E_RESEARCH_ATTACHMENT_MUST_BE_ABSOLUTE");
    }
    return injected;
  }
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed()) return null;
  const selection = await dialog.showOpenDialog(window, {
    title: "选择研究资料附件",
    buttonLabel: "加入资料库",
    properties: ["openFile"],
    filters: [
      {
        name: "研究资料",
        extensions: [
          "pdf",
          "txt",
          "md",
          "markdown",
          "docx",
          "json",
          "png",
          "jpg",
          "jpeg",
          "webp",
          "gif",
        ],
      },
      { name: "全部文件", extensions: ["*"] },
    ],
  });
  return selection.canceled ? null : (selection.filePaths[0] ?? null);
}

const registrations = [
  {
    channel: RESEARCH_IPC_CHANNELS.list,
    command: RESEARCH_COMMANDS.list,
    commandSchema: ResearchListCommandSchema,
    fallback: "研究资料读取失败。",
  },
  {
    channel: RESEARCH_IPC_CHANNELS.createNote,
    command: RESEARCH_COMMANDS.createNote,
    commandSchema: ResearchCreateNoteCommandSchema,
    fallback: "研究笔记创建失败。",
  },
  {
    channel: RESEARCH_IPC_CHANNELS.updateNote,
    command: RESEARCH_COMMANDS.updateNote,
    commandSchema: ResearchUpdateNoteCommandSchema,
    fallback: "研究笔记保存失败。",
  },
  {
    channel: RESEARCH_IPC_CHANNELS.setNoteStatus,
    command: RESEARCH_COMMANDS.setNoteStatus,
    commandSchema: ResearchSetNoteStatusCommandSchema,
    fallback: "研究笔记状态更新失败。",
  },
  {
    channel: RESEARCH_IPC_CHANNELS.deleteAttachment,
    command: RESEARCH_COMMANDS.deleteAttachment,
    commandSchema: ResearchDeleteAttachmentCommandSchema,
    fallback: "研究附件删除失败。",
  },
  {
    channel: RESEARCH_IPC_CHANNELS.addLink,
    command: RESEARCH_COMMANDS.addLink,
    commandSchema: ResearchAddLinkCommandSchema,
    fallback: "研究资料关联失败。",
  },
  {
    channel: RESEARCH_IPC_CHANNELS.removeLink,
    command: RESEARCH_COMMANDS.removeLink,
    commandSchema: ResearchRemoveLinkCommandSchema,
    fallback: "研究资料关联移除失败。",
  },
] as const;

async function invoke(
  options: ResearchIpcOptions,
  event: IpcMainInvokeEvent,
  raw: unknown,
  registration: (typeof registrations)[number],
) {
  const parsed = registration.commandSchema.safeParse(raw);
  if (!parsed.success || !trustedSender(event, options.rendererUrl)) {
    return ResearchCatalogResultSchema.parse({
      ok: false,
      requestId: parsed.success ? parsed.data.requestId : randomUUID(),
      error: {
        code: "COMMON_INVALID_INPUT_001",
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
    return ResearchCatalogResultSchema.parse({
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
  return ResearchCatalogResultSchema.parse({
    ok: true,
    requestId: parsed.data.requestId,
    data: result.data,
  });
}

export function registerResearchIpc(options: ResearchIpcOptions): () => void {
  for (const registration of registrations) {
    registerIpcInvokeHandler(
      options.ipcMain,
      registration.channel,
      (event, raw) => invoke(options, event, raw, registration),
    );
  }

  registerIpcInvokeHandler(
    options.ipcMain,
    RESEARCH_IPC_CHANNELS.importAttachment,
    async (event, raw) => {
      const parsed = ResearchImportAttachmentCommandSchema.safeParse(raw);
      if (!parsed.success || !trustedSender(event, options.rendererUrl)) {
        return ResearchCatalogResultSchema.parse({
          ok: false,
          requestId: parsed.success ? parsed.data.requestId : randomUUID(),
          error: {
            code: "COMMON_INVALID_INPUT_001",
            message: "研究附件导入失败。",
            retryable: false,
          },
        });
      }
      const sourcePath = await chooseAttachmentFile(event);
      if (!sourcePath) {
        return ResearchCatalogResultSchema.parse({
          ok: false,
          requestId: parsed.data.requestId,
          error: {
            code: "COMMON_CANCELLED_004",
            message: "已取消选择研究附件。",
            retryable: false,
          },
        });
      }
      const operation = CoreProjectOperationSchema.parse({
        operation: RESEARCH_COMMANDS.importAttachment,
        input: parsed.data.payload,
        sourcePath,
      });
      const result = await options.supervisor.invokeProjectOperation(
        parsed.data.requestId,
        operation,
      );
      if (!result.ok) {
        const code: ErrorCode = result.errorCode;
        return ResearchCatalogResultSchema.parse({
          ok: false,
          requestId: parsed.data.requestId,
          error: {
            code,
            ...coreOperationFailureSemantics(
              code,
              "研究附件导入失败。",
              "mutation",
            ),
          },
        });
      }
      return ResearchCatalogResultSchema.parse({
        ok: true,
        requestId: parsed.data.requestId,
        data: result.data,
      });
    },
  );

  return () => {
    for (const channel of Object.values(RESEARCH_IPC_CHANNELS)) {
      options.ipcMain.removeHandler(channel);
    }
  };
}
