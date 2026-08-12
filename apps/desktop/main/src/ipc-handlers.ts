import {
  createIpcHandlerContext,
  installIpcInvokeGuard,
  type IpcHandlerOptions,
  type IpcInvokeHandler,
} from './handler-guard.js';
import { registerProviderIpcHandlers } from './provider-ipc-handlers.js';
import { registerAppIpcHandlers } from './app-ipc-handlers.js';
import { registerProjectIpcHandlers } from './project-ipc-handlers.js';
import { registerRecoveryIpcHandlers } from './recovery-ipc-handlers.js';
import { registerPlanningIpcHandlers } from './planning-ipc-handlers.js';
import { registerCanonIpcHandlers } from './canon-ipc-handlers.js';
import { registerStructureIpcHandlers } from './structure-ipc-handlers.js';
import { registerWritingIpcHandlers } from './writing-ipc-handlers.js';
import { registerIdeaCapsuleIpcHandlers } from './idea-ipc-handlers.js';
import { registerTaskIpcHandlers } from './task-ipc-handlers.js';

export function registerIpcHandlers(options: IpcHandlerOptions): () => void {
  const context = createIpcHandlerContext(options);
  const uninstallInvokeGuard = installIpcInvokeGuard(options.ipcMain, context.register);
  const guardedProviderIpcMain = {
    handle: (channel: string, handler: IpcInvokeHandler) => context.register(channel, handler),
    removeHandler: (channel: string) => options.ipcMain.removeHandler(channel),
  } as unknown as IpcHandlerOptions['ipcMain'];
  const disposeProviderHandlers = registerProviderIpcHandlers({
    ipcMain: guardedProviderIpcMain,
    supervisor: options.supervisor,
    credentialBroker: options.credentialBroker,
    rendererUrl: options.rendererUrl,
    logger: options.logger,
  });

  registerAppIpcHandlers(context);
  registerProjectIpcHandlers(context);
  registerRecoveryIpcHandlers(context);
  registerPlanningIpcHandlers(context);
  registerCanonIpcHandlers(context);
  registerStructureIpcHandlers(context);
  registerWritingIpcHandlers(context);
  registerIdeaCapsuleIpcHandlers(context);
  const disposeTaskHandlers = registerTaskIpcHandlers(context);

  return () => {
    disposeProviderHandlers();
    context.disposeInvokeHandlers();
    disposeTaskHandlers();
    uninstallInvokeGuard();
  };
}
