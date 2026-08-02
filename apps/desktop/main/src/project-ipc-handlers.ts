import {
  IPC_CHANNELS,
  PROJECT_WORKSPACE_COMMANDS,
  ProjectCloseCommandSchema,
  ProjectCreateCommandSchema,
  ProjectGetActiveCommandSchema,
  ProjectGetContinuationCommandSchema,
  ProjectMoveCommandSchema,
  ProjectOpenRecentCommandSchema,
  ProjectOpenSelectedCommandSchema,
  ProjectSaveContinuationCommandSchema,
} from '@worldforge/contracts';

import type { IpcHandlerContext } from './handler-guard.js';

export function registerProjectIpcHandlers(context: IpcHandlerContext): void {
  const {
    options,
    register,
    rejectUntrusted,
    invalidRequest,
    appDataFailure,
    cancelledSelection,
    invokeProject,
  } = context;

  register(IPC_CHANNELS.getActive, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectGetActiveCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_WORKSPACE_COMMANDS.getActive,
    });
  });

  register(IPC_CHANNELS.getContinuation, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectGetContinuationCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_WORKSPACE_COMMANDS.getContinuation,
      projectId: parsed.data.payload.projectId,
    });
  });

  register(IPC_CHANNELS.saveContinuation, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectSaveContinuationCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_WORKSPACE_COMMANDS.saveContinuation,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.create, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectCreateCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    let parentDirectory: string | null;
    try {
      parentDirectory = await options.chooseProjectCreateParent();
    } catch {
      return appDataFailure(parsed.data.requestId, 'COMMON_INTERNAL_999');
    }
    if (!parentDirectory) return cancelledSelection(parsed.data.requestId);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_WORKSPACE_COMMANDS.create,
      input: parsed.data.payload,
      parentDirectory,
    });
  });

  register(IPC_CHANNELS.openSelected, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectOpenSelectedCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    let workspacePath: string | null;
    try {
      workspacePath = await options.chooseProjectToOpen();
    } catch {
      return appDataFailure(parsed.data.requestId, 'COMMON_INTERNAL_999');
    }
    if (!workspacePath) return cancelledSelection(parsed.data.requestId);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_WORKSPACE_COMMANDS.openSelected,
      workspacePath,
    });
  });

  register(IPC_CHANNELS.openRecent, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectOpenRecentCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_WORKSPACE_COMMANDS.openRecent,
      projectId: parsed.data.payload.projectId,
    });
  });

  register(IPC_CHANNELS.close, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectCloseCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_WORKSPACE_COMMANDS.close,
      projectId: parsed.data.payload.projectId,
    });
  });

  register(IPC_CHANNELS.move, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectMoveCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    let targetParentDirectory: string | null;
    try {
      targetParentDirectory = await options.chooseProjectMoveParent();
    } catch {
      return appDataFailure(parsed.data.requestId, 'COMMON_INTERNAL_999');
    }
    if (!targetParentDirectory) return cancelledSelection(parsed.data.requestId);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_WORKSPACE_COMMANDS.move,
      projectId: parsed.data.payload.projectId,
      targetParentDirectory,
    });
  });
}
