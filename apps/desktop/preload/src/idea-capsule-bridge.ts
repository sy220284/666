import {
  IDEA_CAPSULE_BRIDGE_COMMAND,
  IDEA_CAPSULE_IPC_CHANNELS,
  IdeaOperationCommandSchema,
  IdeaOperationResultSchema,
  type CoreIdeaOperation,
  type IdeaCapsuleBridge,
  type IdeaOperationResult,
} from '@worldforge/contracts';
import { contextBridge } from 'electron';

import { invokeCommand } from './bridge-runtime.js';

const ideaCapsuleBridge: IdeaCapsuleBridge = {
  operate: (operation: CoreIdeaOperation): Promise<IdeaOperationResult> =>
    invokeCommand(
      IDEA_CAPSULE_IPC_CHANNELS.operation,
      IdeaOperationCommandSchema,
      IdeaOperationResultSchema,
      IDEA_CAPSULE_BRIDGE_COMMAND,
      operation,
    ),
};

contextBridge.exposeInMainWorld('worldforgeIdeaCapsule', ideaCapsuleBridge);
