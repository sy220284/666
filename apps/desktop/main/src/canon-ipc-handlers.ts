import { type CoreSupervisor } from './core-supervisor.js';
import {
  CanonFactSetCommandSchema,
  ENTITY_CANON_COMMANDS,
  EntityArchiveCommandSchema,
  EntityCreateCommandSchema,
  EntityDeleteCommandSchema,
  EntityDeletePreviewCommandSchema,
  EntityListCommandSchema,
  EntityUpdateCommandSchema,
  IPC_CHANNELS,
  SceneBeatEntityLinkCommandSchema,
} from '@worldforge/contracts';

import type { IpcHandlerContext } from './handler-guard.js';

export function registerCanonIpcHandlers(context: IpcHandlerContext): void {
  const { register, rejectUntrusted, invalidRequest, invokeProject } = context;

  for (const [channel, schema, operation] of [
    [IPC_CHANNELS.listEntities, EntityListCommandSchema, ENTITY_CANON_COMMANDS.listEntities],
    [IPC_CHANNELS.createEntity, EntityCreateCommandSchema, ENTITY_CANON_COMMANDS.createEntity],
    [IPC_CHANNELS.updateEntity, EntityUpdateCommandSchema, ENTITY_CANON_COMMANDS.updateEntity],
    [IPC_CHANNELS.archiveEntity, EntityArchiveCommandSchema, ENTITY_CANON_COMMANDS.archiveEntity],
    [IPC_CHANNELS.setCanonFact, CanonFactSetCommandSchema, ENTITY_CANON_COMMANDS.setCanonFact],
    [
      IPC_CHANNELS.linkSceneBeatEntity,
      SceneBeatEntityLinkCommandSchema,
      ENTITY_CANON_COMMANDS.linkSceneBeatEntity,
    ],
    [
      IPC_CHANNELS.previewDeleteEntity,
      EntityDeletePreviewCommandSchema,
      ENTITY_CANON_COMMANDS.previewDeleteEntity,
    ],
    [IPC_CHANNELS.deleteEntity, EntityDeleteCommandSchema, ENTITY_CANON_COMMANDS.deleteEntity],
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
