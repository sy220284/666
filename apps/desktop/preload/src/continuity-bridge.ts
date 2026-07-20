import {
  CONTINUITY_COMMANDS,
  CONTINUITY_IPC_CHANNELS,
  ContinuityCatalogResultSchema,
  ContinuityListCommandSchema,
  EntityStateInvalidateCommandSchema,
  EntityStateSetCommandSchema,
  KnowledgeStateInvalidateCommandSchema,
  KnowledgeStateSetCommandSchema,
  PROTOCOL_VERSION,
  TimelineEventArchiveCommandSchema,
  TimelineEventSaveCommandSchema,
  type CommandResult,
  type ContinuityCatalog,
  type ContinuityListInput,
  type EntityStateInvalidateInput,
  type EntityStateSetInput,
  type KnowledgeStateInvalidateInput,
  type KnowledgeStateSetInput,
  type TimelineEventArchiveInput,
  type TimelineEventSaveInput,
} from '@worldforge/contracts';
import { contextBridge, ipcRenderer } from 'electron';

async function invoke(
  channel: string,
  schema: { parse(input: unknown): unknown },
  command: string,
  payload: unknown,
): Promise<CommandResult<ContinuityCatalog>> {
  const envelope = schema.parse({
    protocolVersion: PROTOCOL_VERSION,
    requestId: globalThis.crypto.randomUUID(),
    command,
    payload,
    sentAt: new Date().toISOString(),
  });
  return ContinuityCatalogResultSchema.parse(await ipcRenderer.invoke(channel, envelope));
}

const continuityBridge = {
  list: (input: ContinuityListInput) =>
    invoke(
      CONTINUITY_IPC_CHANNELS.list,
      ContinuityListCommandSchema,
      CONTINUITY_COMMANDS.list,
      input,
    ),
  setEntityState: (input: EntityStateSetInput) =>
    invoke(
      CONTINUITY_IPC_CHANNELS.setEntityState,
      EntityStateSetCommandSchema,
      CONTINUITY_COMMANDS.setEntityState,
      input,
    ),
  invalidateEntityState: (input: EntityStateInvalidateInput) =>
    invoke(
      CONTINUITY_IPC_CHANNELS.invalidateEntityState,
      EntityStateInvalidateCommandSchema,
      CONTINUITY_COMMANDS.invalidateEntityState,
      input,
    ),
  saveTimelineEvent: (input: TimelineEventSaveInput) =>
    invoke(
      CONTINUITY_IPC_CHANNELS.saveTimelineEvent,
      TimelineEventSaveCommandSchema,
      CONTINUITY_COMMANDS.saveTimelineEvent,
      input,
    ),
  archiveTimelineEvent: (input: TimelineEventArchiveInput) =>
    invoke(
      CONTINUITY_IPC_CHANNELS.archiveTimelineEvent,
      TimelineEventArchiveCommandSchema,
      CONTINUITY_COMMANDS.archiveTimelineEvent,
      input,
    ),
  setKnowledgeState: (input: KnowledgeStateSetInput) =>
    invoke(
      CONTINUITY_IPC_CHANNELS.setKnowledgeState,
      KnowledgeStateSetCommandSchema,
      CONTINUITY_COMMANDS.setKnowledgeState,
      input,
    ),
  invalidateKnowledgeState: (input: KnowledgeStateInvalidateInput) =>
    invoke(
      CONTINUITY_IPC_CHANNELS.invalidateKnowledgeState,
      KnowledgeStateInvalidateCommandSchema,
      CONTINUITY_COMMANDS.invalidateKnowledgeState,
      input,
    ),
} as const;

contextBridge.exposeInMainWorld('worldforgeContinuity', continuityBridge);
