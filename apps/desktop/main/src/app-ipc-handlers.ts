import { createDiagnosticPreview, exportDiagnosticPreview } from './diagnostic-export.js';
import { createDiagnosticId } from './privacy-logger.js';
import {
  APP_COMMANDS,
  AppExportDiagnosticsCommandSchema,
  AppGetCoreStatusCommandSchema,
  AppGetInfoCommandSchema,
  AppGetWindowPreferencesCommandSchema,
  AppPreviewDiagnosticsCommandSchema,
  AppRestartCoreCommandSchema,
  AppSetAppearancePreferencesCommandSchema,
  IPC_CHANNELS,
  ProjectListRecentCommandSchema,
  ProjectRelocateRecentCommandSchema,
  ProjectRemoveRecentCommandSchema,
  PROTOCOL_VERSION,
  SettingsGetCommandSchema,
  SettingsResetCommandSchema,
  SettingsSetCommandSchema,
} from '@worldforge/contracts';

import type { IpcHandlerContext } from './handler-guard.js';

export function registerAppIpcHandlers(context: IpcHandlerContext): void {
  const { options, register, rejectUntrusted, invalidRequest, appDataFailure, success, failure } =
    context;

  register(IPC_CHANNELS.appGetInfo, (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = AppGetInfoCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return success(parsed.data.requestId, {
      version: options.version,
      platform: options.platform,
      protocolVersion: PROTOCOL_VERSION,
    });
  });

  register(IPC_CHANNELS.appGetCoreStatus, (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = AppGetCoreStatusCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return success(parsed.data.requestId, options.supervisor.getStatus());
  });

  register(IPC_CHANNELS.appRestartCore, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = AppRestartCoreCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    const result = await options.supervisor.restart();
    return success(parsed.data.requestId, {
      accepted: result.ok,
      status: options.supervisor.getStatus(),
    });
  });

  register(IPC_CHANNELS.appGetWindowPreferences, (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = AppGetWindowPreferencesCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return success(parsed.data.requestId, options.getWindowPreferences());
  });

  register(IPC_CHANNELS.appSetAppearancePreferences, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = AppSetAppearancePreferencesCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    try {
      return success(
        parsed.data.requestId,
        await options.setAppearancePreferences(parsed.data.payload),
      );
    } catch {
      const diagnosticId = createDiagnosticId();
      await options.logger.log('error', 'window.preferences.save.failed', {
        errorCode: 'COMMON_INTERNAL_999',
        diagnosticId,
      });
      return failure(
        parsed.data.requestId,
        'COMMON_INTERNAL_999',
        'The window preferences could not be saved.',
        true,
        diagnosticId,
      );
    }
  });

  const diagnostics = () =>
    createDiagnosticPreview({
      app: {
        version: options.version,
        platform: options.platform,
        protocolVersion: PROTOCOL_VERSION,
      },
      core: options.supervisor.getStatus(),
      window: options.getWindowPreferences(),
    });

  register(IPC_CHANNELS.appPreviewDiagnostics, (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = AppPreviewDiagnosticsCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return success(parsed.data.requestId, diagnostics());
  });

  register(IPC_CHANNELS.appExportDiagnostics, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = AppExportDiagnosticsCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    const preview = diagnostics();
    const confirmed = (await options.confirmDiagnosticsExport?.(preview)) ?? false;
    if (!confirmed) {
      return failure(
        parsed.data.requestId,
        'COMMON_CANCELLED_004',
        'The diagnostic export was not confirmed in the trusted application shell.',
        true,
      );
    }
    const targetDirectory = (await options.chooseDiagnosticsDirectory?.()) ?? null;
    if (!targetDirectory) {
      return failure(
        parsed.data.requestId,
        'COMMON_CANCELLED_004',
        'The diagnostic export was cancelled.',
        true,
      );
    }
    try {
      return success(
        parsed.data.requestId,
        await exportDiagnosticPreview(targetDirectory, preview),
      );
    } catch {
      return failure(
        parsed.data.requestId,
        'COMMON_INTERNAL_999',
        'The diagnostic package could not be exported.',
        true,
        createDiagnosticId(),
      );
    }
  });

  register(IPC_CHANNELS.settingsGet, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = SettingsGetCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    const result = await options.supervisor.invokeAppDataOperation(parsed.data.requestId, {
      operation: APP_COMMANDS.settingsGet,
    });
    return result.ok
      ? success(parsed.data.requestId, result.data)
      : appDataFailure(parsed.data.requestId, result.errorCode, undefined, 'query');
  });

  register(IPC_CHANNELS.settingsSet, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = SettingsSetCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    const result = await options.supervisor.invokeAppDataOperation(parsed.data.requestId, {
      operation: APP_COMMANDS.settingsSet,
      settings: parsed.data.payload,
    });
    return result.ok
      ? success(parsed.data.requestId, result.data)
      : appDataFailure(parsed.data.requestId, result.errorCode);
  });

  register(IPC_CHANNELS.settingsReset, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = SettingsResetCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    const result = await options.supervisor.invokeAppDataOperation(parsed.data.requestId, {
      operation: APP_COMMANDS.settingsReset,
    });
    return result.ok
      ? success(parsed.data.requestId, result.data)
      : appDataFailure(parsed.data.requestId, result.errorCode);
  });

  register(IPC_CHANNELS.projectListRecent, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectListRecentCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    const result = await options.supervisor.invokeAppDataOperation(parsed.data.requestId, {
      operation: APP_COMMANDS.projectListRecent,
    });
    return result.ok
      ? success(parsed.data.requestId, result.data)
      : appDataFailure(parsed.data.requestId, result.errorCode, undefined, 'query');
  });

  register(IPC_CHANNELS.projectRelocateRecent, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectRelocateRecentCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    let workspacePath: string | null;
    try {
      workspacePath = await options.chooseRecentLocation();
    } catch {
      return appDataFailure(parsed.data.requestId, 'COMMON_INTERNAL_999');
    }
    if (!workspacePath) {
      return failure(
        parsed.data.requestId,
        'COMMON_CANCELLED_004',
        'The relocation was cancelled.',
        false,
      );
    }
    const result = await options.supervisor.invokeAppDataOperation(parsed.data.requestId, {
      operation: APP_COMMANDS.projectRelocateRecent,
      projectId: parsed.data.payload.projectId,
      workspacePath,
    });
    return result.ok
      ? success(parsed.data.requestId, result.data)
      : appDataFailure(parsed.data.requestId, result.errorCode);
  });

  register(IPC_CHANNELS.projectRemoveRecent, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectRemoveRecentCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    const result = await options.supervisor.invokeAppDataOperation(parsed.data.requestId, {
      operation: APP_COMMANDS.projectRemoveRecent,
      projectId: parsed.data.payload.projectId,
    });
    return result.ok
      ? success(parsed.data.requestId, result.data)
      : appDataFailure(parsed.data.requestId, result.errorCode);
  });
}
