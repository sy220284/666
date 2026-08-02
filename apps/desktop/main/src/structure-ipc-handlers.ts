import { type CoreSupervisor } from './core-supervisor.js';
import {
  IPC_CHANNELS,
  PROJECT_STRUCTURE_COMMANDS,
  ProjectCreateChapterCommandSchema,
  ProjectCreateVolumeCommandSchema,
  ProjectDeleteChapterCommandSchema,
  ProjectDeleteVolumeCommandSchema,
  ProjectListStructureCommandSchema,
  ProjectListTrashCommandSchema,
  ProjectMergeChaptersCommandSchema,
  ProjectMoveBlocksCommandSchema,
  ProjectMoveChapterCommandSchema,
  ProjectMoveVolumeCommandSchema,
  ProjectPermanentDeleteCommandSchema,
  ProjectPreviewMergeChaptersCommandSchema,
  ProjectPreviewMoveBlocksCommandSchema,
  ProjectPreviewPermanentDeleteCommandSchema,
  ProjectPreviewSplitChapterCommandSchema,
  ProjectRestoreTrashEntryCommandSchema,
  ProjectSplitChapterCommandSchema,
  ProjectUpdateChapterCommandSchema,
  ProjectUpdateVolumeCommandSchema,
} from '@worldforge/contracts';

import type { IpcHandlerContext } from './handler-guard.js';

export function registerStructureIpcHandlers(context: IpcHandlerContext): void {
  const { register, rejectUntrusted, invalidRequest, invokeProject } = context;

  register(IPC_CHANNELS.listStructure, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectListStructureCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_STRUCTURE_COMMANDS.listStructure,
      projectId: parsed.data.payload.projectId,
    });
  });

  register(IPC_CHANNELS.createVolume, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectCreateVolumeCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_STRUCTURE_COMMANDS.createVolume,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.updateVolume, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectUpdateVolumeCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_STRUCTURE_COMMANDS.updateVolume,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.moveVolume, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectMoveVolumeCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_STRUCTURE_COMMANDS.moveVolume,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.deleteVolume, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectDeleteVolumeCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_STRUCTURE_COMMANDS.deleteVolume,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.createChapter, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectCreateChapterCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_STRUCTURE_COMMANDS.createChapter,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.updateChapter, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectUpdateChapterCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_STRUCTURE_COMMANDS.updateChapter,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.moveChapter, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectMoveChapterCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_STRUCTURE_COMMANDS.moveChapter,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.deleteChapter, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectDeleteChapterCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_STRUCTURE_COMMANDS.deleteChapter,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.listTrash, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectListTrashCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_STRUCTURE_COMMANDS.listTrash,
      projectId: parsed.data.payload.projectId,
    });
  });

  register(IPC_CHANNELS.restoreTrashEntry, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectRestoreTrashEntryCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_STRUCTURE_COMMANDS.restoreTrashEntry,
      input: parsed.data.payload,
    });
  });

  for (const [channel, schema, operation] of [
    [
      IPC_CHANNELS.previewPermanentDelete,
      ProjectPreviewPermanentDeleteCommandSchema,
      PROJECT_STRUCTURE_COMMANDS.previewPermanentDelete,
    ],
    [
      IPC_CHANNELS.permanentDelete,
      ProjectPermanentDeleteCommandSchema,
      PROJECT_STRUCTURE_COMMANDS.permanentDelete,
    ],
    [
      IPC_CHANNELS.previewSplitChapter,
      ProjectPreviewSplitChapterCommandSchema,
      PROJECT_STRUCTURE_COMMANDS.previewSplitChapter,
    ],
    [
      IPC_CHANNELS.splitChapter,
      ProjectSplitChapterCommandSchema,
      PROJECT_STRUCTURE_COMMANDS.splitChapter,
    ],
    [
      IPC_CHANNELS.previewMergeChapters,
      ProjectPreviewMergeChaptersCommandSchema,
      PROJECT_STRUCTURE_COMMANDS.previewMergeChapters,
    ],
    [
      IPC_CHANNELS.mergeChapters,
      ProjectMergeChaptersCommandSchema,
      PROJECT_STRUCTURE_COMMANDS.mergeChapters,
    ],
    [
      IPC_CHANNELS.previewMoveBlocks,
      ProjectPreviewMoveBlocksCommandSchema,
      PROJECT_STRUCTURE_COMMANDS.previewMoveBlocks,
    ],
    [
      IPC_CHANNELS.moveBlocks,
      ProjectMoveBlocksCommandSchema,
      PROJECT_STRUCTURE_COMMANDS.moveBlocks,
    ],
  ] as const) {
    register(channel, async (event, raw) => {
      const rejected = rejectUntrusted(event, raw);
      if (rejected) return rejected;
      const parsed = schema.safeParse(raw);
      if (!parsed.success) return invalidRequest(raw);
      return invokeProject(parsed.data.requestId, {
        operation,
        input: parsed.data.payload,
      } as Parameters<CoreSupervisor['invokeProjectOperation']>[1]);
    });
  }
}
