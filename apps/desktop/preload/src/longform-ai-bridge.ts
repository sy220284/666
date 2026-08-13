import {
  AiTaskRouteResolutionResultSchema,
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
  type LongformAiBridge,
} from '@worldforge/contracts';
import { contextBridge } from 'electron';

import { invokeCommand } from './bridge-runtime.js';

const longformAiBridge: LongformAiBridge = {
  getSettings: (projectId) =>
    invokeCommand(
      LONGFORM_AI_IPC_CHANNELS.getSettings,
      LongformAiGetSettingsCommandSchema,
      LongformAiSettingsResultSchema,
      LONGFORM_AI_COMMANDS.getSettings,
      { projectId },
    ),
  updateSettings: (input) =>
    invokeCommand(
      LONGFORM_AI_IPC_CHANNELS.updateSettings,
      LongformAiUpdateSettingsCommandSchema,
      LongformAiSettingsResultSchema,
      LONGFORM_AI_COMMANDS.updateSettings,
      input,
    ),
  listDigests: (input) =>
    invokeCommand(
      LONGFORM_AI_IPC_CHANNELS.listDigests,
      LongformAiListDigestsCommandSchema,
      StoryDigestListResultSchema,
      LONGFORM_AI_COMMANDS.listDigests,
      input,
    ),
  rebuildDigests: (input) =>
    invokeCommand(
      LONGFORM_AI_IPC_CHANNELS.rebuildDigests,
      LongformAiRebuildDigestsCommandSchema,
      StoryDigestRebuildCommandResultSchema,
      LONGFORM_AI_COMMANDS.rebuildDigests,
      input,
    ),
  evaluateStyle: (input) =>
    invokeCommand(
      LONGFORM_AI_IPC_CHANNELS.evaluateStyle,
      LongformAiEvaluateStyleCommandSchema,
      StyleDeviationResultSchema,
      LONGFORM_AI_COMMANDS.evaluateStyle,
      input,
    ),
  resolveTaskRoute: (input) =>
    invokeCommand(
      LONGFORM_AI_IPC_CHANNELS.resolveTaskRoute,
      LongformAiResolveTaskRouteCommandSchema,
      AiTaskRouteResolutionResultSchema,
      LONGFORM_AI_COMMANDS.resolveTaskRoute,
      input,
    ),
};

contextBridge.exposeInMainWorld('worldforgeLongformAi', longformAiBridge);
