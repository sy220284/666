import { IDEA_CAPSULE_IPC_CHANNELS, IdeaOperationCommandSchema } from '@worldforge/contracts';

import type { IpcHandlerContext } from './handler-guard.js';

export function registerIdeaCapsuleIpcHandlers(context: IpcHandlerContext): void {
  const { register, rejectUntrusted, invalidRequest, invokeProject } = context;
  register(IDEA_CAPSULE_IPC_CHANNELS.operation, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = IdeaOperationCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, parsed.data.payload);
  });
}
