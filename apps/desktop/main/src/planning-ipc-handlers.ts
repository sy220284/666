import { type CoreSupervisor } from './core-supervisor.js';
import {
  IPC_CHANNELS,
  PROJECT_PLANNING_COMMANDS,
  ProjectCreatePlotNodeCommandSchema,
  ProjectDeletePlotNodeCommandSchema,
  ProjectGetBriefCommandSchema,
  ProjectListPlotNodesCommandSchema,
  ProjectMovePlotNodeCommandSchema,
  ProjectUpdateBriefCommandSchema,
  ProjectUpdatePlotNodeCommandSchema,
  SCENE_BEAT_COMMANDS,
  SceneBeatConvertBlocksCommandSchema,
  SceneBeatCreateCommandSchema,
  SceneBeatDeleteCommandSchema,
  SceneBeatListCommandSchema,
  SceneBeatMoveAcrossChaptersCommandSchema,
  SceneBeatMoveCommandSchema,
  SceneBeatPreviewCrossChapterMoveCommandSchema,
  SceneBeatRestoreCommandSchema,
  SceneBeatSetBlockLinksCommandSchema,
  SceneBeatUpdateCommandSchema,
} from '@worldforge/contracts';

import type { IpcHandlerContext } from './handler-guard.js';

export function registerPlanningIpcHandlers(context: IpcHandlerContext): void {
  const { register, rejectUntrusted, invalidRequest, invokeProject } = context;

  for (const [channel, schema, operation] of [
    [IPC_CHANNELS.getBrief, ProjectGetBriefCommandSchema, PROJECT_PLANNING_COMMANDS.getBrief],
    [
      IPC_CHANNELS.listPlotNodes,
      ProjectListPlotNodesCommandSchema,
      PROJECT_PLANNING_COMMANDS.listPlotNodes,
    ],
  ] as const) {
    register(channel, async (event, raw) => {
      const rejected = rejectUntrusted(event, raw);
      if (rejected) return rejected;
      const parsed = schema.safeParse(raw);
      if (!parsed.success) return invalidRequest(raw);
      return invokeProject(parsed.data.requestId, {
        operation,
        projectId: parsed.data.payload.projectId,
      } as Parameters<CoreSupervisor['invokeProjectOperation']>[1]);
    });
  }

  for (const [channel, schema, operation] of [
    [IPC_CHANNELS.listSceneBeats, SceneBeatListCommandSchema, SCENE_BEAT_COMMANDS.listSceneBeats],
    [
      IPC_CHANNELS.previewMoveSceneBeat,
      SceneBeatPreviewCrossChapterMoveCommandSchema,
      SCENE_BEAT_COMMANDS.previewMoveSceneBeat,
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

  for (const [channel, schema, operation] of [
    [
      IPC_CHANNELS.updateBrief,
      ProjectUpdateBriefCommandSchema,
      PROJECT_PLANNING_COMMANDS.updateBrief,
    ],
    [
      IPC_CHANNELS.createPlotNode,
      ProjectCreatePlotNodeCommandSchema,
      PROJECT_PLANNING_COMMANDS.createPlotNode,
    ],
    [
      IPC_CHANNELS.updatePlotNode,
      ProjectUpdatePlotNodeCommandSchema,
      PROJECT_PLANNING_COMMANDS.updatePlotNode,
    ],
    [
      IPC_CHANNELS.movePlotNode,
      ProjectMovePlotNodeCommandSchema,
      PROJECT_PLANNING_COMMANDS.movePlotNode,
    ],
    [
      IPC_CHANNELS.deletePlotNode,
      ProjectDeletePlotNodeCommandSchema,
      PROJECT_PLANNING_COMMANDS.deletePlotNode,
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

  for (const [channel, schema, operation] of [
    [
      IPC_CHANNELS.createSceneBeat,
      SceneBeatCreateCommandSchema,
      SCENE_BEAT_COMMANDS.createSceneBeat,
    ],
    [
      IPC_CHANNELS.updateSceneBeat,
      SceneBeatUpdateCommandSchema,
      SCENE_BEAT_COMMANDS.updateSceneBeat,
    ],
    [IPC_CHANNELS.moveSceneBeat, SceneBeatMoveCommandSchema, SCENE_BEAT_COMMANDS.moveSceneBeat],
    [
      IPC_CHANNELS.moveSceneBeatAcrossChapters,
      SceneBeatMoveAcrossChaptersCommandSchema,
      SCENE_BEAT_COMMANDS.moveSceneBeatAcrossChapters,
    ],
    [
      IPC_CHANNELS.deleteSceneBeat,
      SceneBeatDeleteCommandSchema,
      SCENE_BEAT_COMMANDS.deleteSceneBeat,
    ],
    [
      IPC_CHANNELS.restoreSceneBeat,
      SceneBeatRestoreCommandSchema,
      SCENE_BEAT_COMMANDS.restoreSceneBeat,
    ],
    [
      IPC_CHANNELS.setSceneBeatBlockLinks,
      SceneBeatSetBlockLinksCommandSchema,
      SCENE_BEAT_COMMANDS.setSceneBeatBlockLinks,
    ],
    [
      IPC_CHANNELS.convertBlocksToSceneBeat,
      SceneBeatConvertBlocksCommandSchema,
      SCENE_BEAT_COMMANDS.convertBlocksToSceneBeat,
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
