import {
  CoreIdeaOperationSchema,
  CoreIdeaResultSchema,
  IDEA_CAPSULE_COMMANDS,
  type CoreProjectOperation,
  type CoreProjectResult,
} from '@worldforge/contracts';

import type { UtilityProjectServices } from './utility-project-services.js';

export async function routeIdeaOperation(
  services: UtilityProjectServices,
  requestId: string,
  operation: CoreProjectOperation,
): Promise<CoreProjectResult | null> {
  const parsed = CoreIdeaOperationSchema.safeParse(operation);
  if (!parsed.success) return null;
  const ideaOperation = parsed.data;
  switch (ideaOperation.operation) {
    case IDEA_CAPSULE_COMMANDS.list:
      return CoreIdeaResultSchema.parse({
        ok: true,
        operation: ideaOperation.operation,
        data: services.ideas.list(ideaOperation.input),
      });
    case IDEA_CAPSULE_COMMANDS.get:
      return CoreIdeaResultSchema.parse({
        ok: true,
        operation: ideaOperation.operation,
        data: services.ideas.get(ideaOperation.input),
      });
    case IDEA_CAPSULE_COMMANDS.create:
      return CoreIdeaResultSchema.parse({
        ok: true,
        operation: ideaOperation.operation,
        data: await services.ideas.create(requestId, ideaOperation.input),
      });
    case IDEA_CAPSULE_COMMANDS.setStatus:
      return CoreIdeaResultSchema.parse({
        ok: true,
        operation: ideaOperation.operation,
        data: await services.ideas.setStatus(requestId, ideaOperation.input),
      });
    case IDEA_CAPSULE_COMMANDS.previewConversion:
      return CoreIdeaResultSchema.parse({
        ok: true,
        operation: ideaOperation.operation,
        data: services.ideas.previewConversion(ideaOperation.input),
      });
    case IDEA_CAPSULE_COMMANDS.applyConversion:
      return CoreIdeaResultSchema.parse({
        ok: true,
        operation: ideaOperation.operation,
        data: await services.ideas.applyConversion(requestId, ideaOperation.input),
      });
  }
}
