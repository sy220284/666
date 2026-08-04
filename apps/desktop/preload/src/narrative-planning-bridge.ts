import {
  NARRATIVE_PLANNING_COMMANDS,
  NARRATIVE_PLANNING_IPC_CHANNELS,
  ArcMilestoneSaveCommandSchema,
  ArcMilestoneTransitionCommandSchema,
  CharacterArcSaveCommandSchema,
  ForeshadowingSaveCommandSchema,
  ForeshadowingTransitionCommandSchema,
  NarrativePlanningCatalogResultSchema,
  NarrativePlanningListCommandSchema,
  type ArcMilestoneSaveInput,
  type ArcMilestoneTransitionInput,
  type CharacterArcSaveInput,
  type CommandResult,
  type ForeshadowingSaveInput,
  type ForeshadowingTransitionInput,
  type NarrativePlanningCatalog,
  type NarrativePlanningListInput,
} from '@worldforge/contracts';
import { contextBridge } from 'electron';

import { invokeCommand, type Parser } from './bridge-runtime.js';

function invoke(
  channel: string,
  schema: Parser<unknown>,
  command: string,
  payload: unknown,
): Promise<CommandResult<NarrativePlanningCatalog>> {
  return invokeCommand(
    channel,
    schema,
    NarrativePlanningCatalogResultSchema,
    command,
    payload,
  );
}

const narrativePlanningBridge = {
  list: (input: NarrativePlanningListInput) =>
    invoke(
      NARRATIVE_PLANNING_IPC_CHANNELS.list,
      NarrativePlanningListCommandSchema,
      NARRATIVE_PLANNING_COMMANDS.list,
      input,
    ),
  saveForeshadowing: (input: ForeshadowingSaveInput) =>
    invoke(
      NARRATIVE_PLANNING_IPC_CHANNELS.saveForeshadowing,
      ForeshadowingSaveCommandSchema,
      NARRATIVE_PLANNING_COMMANDS.saveForeshadowing,
      input,
    ),
  transitionForeshadowing: (input: ForeshadowingTransitionInput) =>
    invoke(
      NARRATIVE_PLANNING_IPC_CHANNELS.transitionForeshadowing,
      ForeshadowingTransitionCommandSchema,
      NARRATIVE_PLANNING_COMMANDS.transitionForeshadowing,
      input,
    ),
  saveCharacterArc: (input: CharacterArcSaveInput) =>
    invoke(
      NARRATIVE_PLANNING_IPC_CHANNELS.saveCharacterArc,
      CharacterArcSaveCommandSchema,
      NARRATIVE_PLANNING_COMMANDS.saveCharacterArc,
      input,
    ),
  saveArcMilestone: (input: ArcMilestoneSaveInput) =>
    invoke(
      NARRATIVE_PLANNING_IPC_CHANNELS.saveArcMilestone,
      ArcMilestoneSaveCommandSchema,
      NARRATIVE_PLANNING_COMMANDS.saveArcMilestone,
      input,
    ),
  transitionArcMilestone: (input: ArcMilestoneTransitionInput) =>
    invoke(
      NARRATIVE_PLANNING_IPC_CHANNELS.transitionArcMilestone,
      ArcMilestoneTransitionCommandSchema,
      NARRATIVE_PLANNING_COMMANDS.transitionArcMilestone,
      input,
    ),
} as const;

contextBridge.exposeInMainWorld('worldforgeNarrativePlanning', narrativePlanningBridge);
