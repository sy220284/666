import type { WorldforgeBridge } from '@worldforge/contracts';
import { contextBridge } from 'electron';

import { createAppBridge } from './app-bridge-factory.js';
import { rendererLifecycleBridge } from './lifecycle-bridge.js';
import { createPlanningBridge } from './planning-bridge-factory.js';
import { createProjectBridge } from './project-bridge-factory.js';
import { createRecoveryBridge } from './recovery-bridge-factory.js';
import { createTaskBridge } from './task-bridge-factory.js';
import { createWritingBridge, type CandidateBridge } from './writing-bridge-factory.js';

const bridge: WorldforgeBridge & CandidateBridge = {
  lifecycle: rendererLifecycleBridge,
  ...createAppBridge(),
  ...createRecoveryBridge(),
  ...createProjectBridge(),
  ...createPlanningBridge(),
  ...createWritingBridge(),
  ...createTaskBridge(),
};

contextBridge.exposeInMainWorld('worldforge', bridge);
