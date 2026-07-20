import {
  APP_DATA_COMMANDS,
  CoreAppDataResultSchema,
  type CoreAppDataOperation,
  type CoreAppDataResult,
} from '@worldforge/contracts';

import type { AppRuntime } from './app-runtime.js';
import { appDataError } from './utility-errors.js';

export async function executeAppDataOperation(
  appRuntime: AppRuntime,
  requestId: string,
  operation: CoreAppDataOperation,
): Promise<CoreAppDataResult> {
  try {
    switch (operation.operation) {
      case APP_DATA_COMMANDS.settingsGet:
        return CoreAppDataResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: appRuntime.appSettings.get(),
        });
      case APP_DATA_COMMANDS.settingsSet:
        return CoreAppDataResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await appRuntime.appSettings.update(requestId, operation.settings),
        });
      case APP_DATA_COMMANDS.settingsReset:
        return CoreAppDataResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await appRuntime.appSettings.reset(requestId),
        });
      case APP_DATA_COMMANDS.projectListRecent:
        return CoreAppDataResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: { projects: await appRuntime.recentProjects.list(requestId) },
        });
      case APP_DATA_COMMANDS.projectRelocateRecent:
        return CoreAppDataResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await appRuntime.recentProjects.relocate(
            requestId,
            operation.projectId,
            operation.workspacePath,
          ),
        });
      case APP_DATA_COMMANDS.projectRemoveRecent:
        return CoreAppDataResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: {
            removed: await appRuntime.recentProjects.remove(requestId, operation.projectId),
          },
        });
    }
  } catch (error) {
    return CoreAppDataResultSchema.parse({
      ok: false,
      operation: operation.operation,
      errorCode: appDataError(error),
    });
  }
}
