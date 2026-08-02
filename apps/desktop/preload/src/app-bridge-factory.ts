import {
  APP_COMMANDS,
  AiHasCredentialCommandSchema,
  AiRemoveCredentialCommandSchema,
  AiSetCredentialCommandSchema,
  AppExportDiagnosticsCommandSchema,
  AppGetCoreStatusCommandSchema,
  AppGetInfoCommandSchema,
  AppGetWindowPreferencesCommandSchema,
  AppInfoResultSchema,
  AppPreviewDiagnosticsCommandSchema,
  AppRestartCoreCommandSchema,
  AppSetAppearancePreferencesCommandSchema,
  AppSettingsSnapshotResultSchema,
  CoreOperationResultSchema,
  CoreStatusResultSchema,
  CredentialPresenceResultSchema,
  CredentialReferenceResultSchema,
  DiagnosticExportResultSchema,
  DiagnosticPreviewResultSchema,
  GENERATION_COMMANDS,
  GENERATION_IPC_CHANNELS,
  GenerationCancelCommandSchema,
  GenerationDiscardPartialCommandSchema,
  GenerationGetModelSupportCommandSchema,
  GenerationGetRunCommandSchema,
  GenerationListRunsCommandSchema,
  GenerationModelSupportEnvelopeSchema,
  GenerationPartialDecisionResultSchema,
  GenerationRunListResultSchema,
  GenerationRunResultSchema,
  GenerationSavePartialCommandSchema,
  GenerationStartCommandSchema,
  GenerationStartResultSchema,
  IPC_CHANNELS,
  ProviderConnectionTestResultEnvelopeSchema,
  ProviderListCommandSchema,
  ProviderListResultSchema,
  ProviderRemoveCommandSchema,
  ProviderRemoveResultSchema,
  ProviderSaveCommandSchema,
  ProviderSummaryResultSchema,
  ProviderTestConnectionCommandSchema,
  SettingsGetCommandSchema,
  SettingsResetCommandSchema,
  SettingsSetCommandSchema,
  WindowPreferencesResultSchema,
  type WorldforgeBridge,
} from '@worldforge/contracts';
import { envelope, invoke } from './bridge-runtime.js';

export function createAppBridge(): Pick<
  WorldforgeBridge,
  'app' | 'providers' | 'generation' | 'settings' | 'ai'
> {
  return {
    app: {
      getInfo: () =>
        invoke(
          IPC_CHANNELS.appGetInfo,
          AppGetInfoCommandSchema.parse(envelope(APP_COMMANDS.getInfo, {})),
          AppInfoResultSchema,
        ),
      getCoreStatus: () =>
        invoke(
          IPC_CHANNELS.appGetCoreStatus,
          AppGetCoreStatusCommandSchema.parse(envelope(APP_COMMANDS.getCoreStatus, {})),
          CoreStatusResultSchema,
        ),
      restartCore: () =>
        invoke(
          IPC_CHANNELS.appRestartCore,
          AppRestartCoreCommandSchema.parse(envelope(APP_COMMANDS.restartCore, {})),
          CoreOperationResultSchema,
        ),
      getWindowPreferences: () =>
        invoke(
          IPC_CHANNELS.appGetWindowPreferences,
          AppGetWindowPreferencesCommandSchema.parse(
            envelope(APP_COMMANDS.getWindowPreferences, {}),
          ),
          WindowPreferencesResultSchema,
        ),
      setAppearancePreferences: (preferences) =>
        invoke(
          IPC_CHANNELS.appSetAppearancePreferences,
          AppSetAppearancePreferencesCommandSchema.parse(
            envelope(APP_COMMANDS.setAppearancePreferences, preferences),
          ),
          WindowPreferencesResultSchema,
        ),
      previewDiagnostics: () =>
        invoke(
          IPC_CHANNELS.appPreviewDiagnostics,
          AppPreviewDiagnosticsCommandSchema.parse(envelope(APP_COMMANDS.previewDiagnostics, {})),
          DiagnosticPreviewResultSchema,
        ),
      exportDiagnostics: () =>
        invoke(
          IPC_CHANNELS.appExportDiagnostics,
          AppExportDiagnosticsCommandSchema.parse(
            envelope(APP_COMMANDS.exportDiagnostics, { confirmation: true }),
          ),
          DiagnosticExportResultSchema,
        ),
    },
    providers: {
      list: () =>
        invoke(
          IPC_CHANNELS.providerList,
          ProviderListCommandSchema.parse(envelope(APP_COMMANDS.providerList, {})),
          ProviderListResultSchema,
        ),
      save: (input) =>
        invoke(
          IPC_CHANNELS.providerSave,
          ProviderSaveCommandSchema.parse(envelope(APP_COMMANDS.providerSave, input)),
          ProviderSummaryResultSchema,
        ),
      remove: (providerId) =>
        invoke(
          IPC_CHANNELS.providerRemove,
          ProviderRemoveCommandSchema.parse(envelope(APP_COMMANDS.providerRemove, { providerId })),
          ProviderRemoveResultSchema,
        ),
      testConnection: (providerId) =>
        invoke(
          IPC_CHANNELS.providerTestConnection,
          ProviderTestConnectionCommandSchema.parse(
            envelope(APP_COMMANDS.providerTestConnection, { providerId }),
          ),
          ProviderConnectionTestResultEnvelopeSchema,
        ),
    },
    generation: {
      start: (input) =>
        invoke(
          GENERATION_IPC_CHANNELS.start,
          GenerationStartCommandSchema.parse(envelope(GENERATION_COMMANDS.start, input)),
          GenerationStartResultSchema,
        ),
      getRun: (projectId, runId) =>
        invoke(
          GENERATION_IPC_CHANNELS.getRun,
          GenerationGetRunCommandSchema.parse(
            envelope(GENERATION_COMMANDS.getRun, { projectId, runId }),
          ),
          GenerationRunResultSchema,
        ),
      listRuns: (input) =>
        invoke(
          GENERATION_IPC_CHANNELS.listRuns,
          GenerationListRunsCommandSchema.parse(envelope(GENERATION_COMMANDS.listRuns, input)),
          GenerationRunListResultSchema,
        ),
      cancel: (input) =>
        invoke(
          GENERATION_IPC_CHANNELS.cancel,
          GenerationCancelCommandSchema.parse(envelope(GENERATION_COMMANDS.cancel, input)),
          GenerationRunResultSchema,
        ),
      savePartial: (input) =>
        invoke(
          GENERATION_IPC_CHANNELS.savePartial,
          GenerationSavePartialCommandSchema.parse(
            envelope(GENERATION_COMMANDS.savePartial, input),
          ),
          GenerationPartialDecisionResultSchema,
        ),
      discardPartial: (input) =>
        invoke(
          GENERATION_IPC_CHANNELS.discardPartial,
          GenerationDiscardPartialCommandSchema.parse(
            envelope(GENERATION_COMMANDS.discardPartial, input),
          ),
          GenerationPartialDecisionResultSchema,
        ),
      getModelSupport: (input) =>
        invoke(
          GENERATION_IPC_CHANNELS.getModelSupport,
          GenerationGetModelSupportCommandSchema.parse(
            envelope(GENERATION_COMMANDS.getModelSupport, input),
          ),
          GenerationModelSupportEnvelopeSchema,
        ),
    },
    settings: {
      get: () =>
        invoke(
          IPC_CHANNELS.settingsGet,
          SettingsGetCommandSchema.parse(envelope(APP_COMMANDS.settingsGet, {})),
          AppSettingsSnapshotResultSchema,
        ),
      set: (settings) =>
        invoke(
          IPC_CHANNELS.settingsSet,
          SettingsSetCommandSchema.parse(envelope(APP_COMMANDS.settingsSet, settings)),
          AppSettingsSnapshotResultSchema,
        ),
      reset: () =>
        invoke(
          IPC_CHANNELS.settingsReset,
          SettingsResetCommandSchema.parse(envelope(APP_COMMANDS.settingsReset, {})),
          AppSettingsSnapshotResultSchema,
        ),
    },
    ai: {
      setCredential: (providerId, credential) =>
        invoke(
          IPC_CHANNELS.aiSetCredential,
          AiSetCredentialCommandSchema.parse(
            envelope(APP_COMMANDS.setCredential, { providerId, credential }),
          ),
          CredentialReferenceResultSchema,
        ),
      removeCredential: (credentialRef) =>
        invoke(
          IPC_CHANNELS.aiRemoveCredential,
          AiRemoveCredentialCommandSchema.parse(
            envelope(APP_COMMANDS.removeCredential, { credentialRef }),
          ),
          CredentialPresenceResultSchema,
        ),
      hasCredential: (credentialRef) =>
        invoke(
          IPC_CHANNELS.aiHasCredential,
          AiHasCredentialCommandSchema.parse(
            envelope(APP_COMMANDS.hasCredential, { credentialRef }),
          ),
          CredentialPresenceResultSchema,
        ),
    },
  };
}
