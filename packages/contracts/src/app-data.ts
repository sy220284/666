import { z } from 'zod';

import { ErrorCodeSchema } from './error-codes.js';
import { ProjectIdSchema, TASK_PROTOCOL_VERSION } from './task-protocol.js';

export const APP_DATA_IPC_CHANNELS = {
  settingsGet: 'worldforge:settings:get',
  settingsSet: 'worldforge:settings:set',
  settingsReset: 'worldforge:settings:reset',
  projectListRecent: 'worldforge:project:list-recent',
  projectRelocateRecent: 'worldforge:project:relocate-recent',
  projectRemoveRecent: 'worldforge:project:remove-recent',
} as const;

export const APP_DATA_COMMANDS = {
  settingsGet: 'settings.get',
  settingsSet: 'settings.set',
  settingsReset: 'settings.reset',
  projectListRecent: 'project.listRecent',
  projectRelocateRecent: 'project.relocateRecent',
  projectRemoveRecent: 'project.removeRecent',
} as const;

export const ProviderConfigIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
const ProviderCredentialRefSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^cred_[0-9a-f-]{36}$/);

export const AppLanguageSchema = z.enum(['zh-CN']);
export const StartupBehaviorSchema = z.enum(['show-home', 'reopen-last']);
export const AuthorModeSchema = z.enum(['beginner', 'professional']);
export const CreativePathSchema = z.enum(['autonomous', 'hybrid', 'ai-first']);
export const OnboardingTipSchema = z.enum([
  'local-autosave',
  'locked-blocks',
  'candidate-safety',
  'candidate-undo',
  'recovery-copy',
  'focus-mode',
]);
export const ThemeIdSchema = z.enum(['theme-a', 'theme-b']);
export const ThemeVariantSchema = z.enum(['light', 'dark', 'eye-care', 'high-contrast']);
export const ShortcutChordSchema = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[A-Za-z0-9+._-]+$/);
export const ShortcutOverrideSchema = z.strictObject({
  commandId: z.string().min(1).max(160),
  shortcut: ShortcutChordSchema.nullable(),
});
export const ThemeSealTextSchema = z
  .string()
  .trim()
  .max(12)
  .regex(/^[\p{Script=Han}A-Za-z0-9·•._\- ]*$/u);

export const AppSettingsSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    language: AppLanguageSchema,
    startupBehavior: StartupBehaviorSchema,
    defaultMode: AuthorModeSchema,
    creativePath: CreativePathSchema.default('autonomous'),
    onboardingCompleted: z.boolean().default(false),
    onboardingTipsSeen: z.array(OnboardingTipSchema).max(6).default([]),
    onboardingScaffoldDismissed: z.boolean().default(false),
    themeId: ThemeIdSchema,
    themeVariant: ThemeVariantSchema,
    reduceMotion: z.boolean(),
    shortcutOverrides: z.array(ShortcutOverrideSchema).max(64).default([]),
    typewriterMode: z.boolean().default(false),
    typewriterAnchorPercent: z.number().int().min(25).max(75).default(45),
    themeSealText: ThemeSealTextSchema.default(''),
  })
  .superRefine((settings, context) => {
    const commandIds = new Set<string>();
    const shortcutValues = new Set<string>();
    for (const override of settings.shortcutOverrides) {
      if (commandIds.has(override.commandId)) {
        context.addIssue({
          code: 'custom',
          path: ['shortcutOverrides'],
          message: 'Shortcut overrides must contain unique command ids.',
        });
      }
      commandIds.add(override.commandId);
      if (override.shortcut && shortcutValues.has(override.shortcut)) {
        context.addIssue({
          code: 'custom',
          path: ['shortcutOverrides'],
          message: 'Shortcut overrides must not contain duplicate active shortcuts.',
        });
      }
      if (override.shortcut) shortcutValues.add(override.shortcut);
    }
  });

export const AppSettingsUpdateSchema = z.strictObject({
  language: AppLanguageSchema.optional(),
  startupBehavior: StartupBehaviorSchema.optional(),
  defaultMode: AuthorModeSchema.optional(),
  creativePath: CreativePathSchema.optional(),
  onboardingCompleted: z.boolean().optional(),
  onboardingTipsSeen: z.array(OnboardingTipSchema).max(6).optional(),
  onboardingScaffoldDismissed: z.boolean().optional(),
  themeId: ThemeIdSchema.optional(),
  themeVariant: ThemeVariantSchema.optional(),
  reduceMotion: z.boolean().optional(),
  shortcutOverrides: z.array(ShortcutOverrideSchema).max(64).optional(),
  typewriterMode: z.boolean().optional(),
  typewriterAnchorPercent: z.number().int().min(25).max(75).optional(),
  themeSealText: ThemeSealTextSchema.optional(),
});

export const DEFAULT_APP_SETTINGS = {
  schemaVersion: 1,
  language: 'zh-CN',
  startupBehavior: 'show-home',
  defaultMode: 'beginner',
  creativePath: 'autonomous',
  onboardingCompleted: false,
  onboardingTipsSeen: [],
  onboardingScaffoldDismissed: false,
  themeId: 'theme-a',
  themeVariant: 'light',
  reduceMotion: false,
  shortcutOverrides: [],
  typewriterMode: false,
  typewriterAnchorPercent: 45,
  themeSealText: '',
} as const satisfies z.infer<typeof AppSettingsSchema>;

export const AppSettingsSnapshotSchema = z.discriminatedUnion('source', [
  z.strictObject({
    source: z.enum(['default', 'stored']),
    settings: AppSettingsSchema,
  }),
  z.strictObject({
    source: z.literal('recovered'),
    recoveryReason: z.enum(['invalid-json', 'invalid-value', 'unsupported-version']),
    settings: AppSettingsSchema,
  }),
]);

export const WorkspacePathSchema = z.string().min(1).max(32_768);
export const RecentProjectSchema = z.strictObject({
  projectId: ProjectIdSchema,
  workspacePath: WorkspacePathSchema,
  displayName: z.string().trim().min(1).max(240),
  lastOpenedAt: z.iso.datetime(),
  missingSince: z.iso.datetime().nullable(),
});
export const RecentProjectRegistrationSchema = z.strictObject({
  projectId: ProjectIdSchema,
  workspacePath: WorkspacePathSchema,
  displayName: z.string().trim().min(1).max(240),
});

const OpenAiCompatibleProviderOptionsSchema = z.strictObject({});
const AnthropicProviderOptionsSchema = z.strictObject({
  anthropicVersion: z.string().trim().min(1).max(64).optional(),
});
const CustomProviderOptionsSchema = z.strictObject({});
export const ProviderOptionsSchema = z.union([
  OpenAiCompatibleProviderOptionsSchema,
  AnthropicProviderOptionsSchema,
  CustomProviderOptionsSchema,
]);

export const ProviderBaseUrlSchema = z.url().superRefine((value, context) => {
  const separator = value.indexOf('://');
  const protocol = separator >= 0 ? value.slice(0, separator) : '';
  const authority = separator >= 0 ? value.slice(separator + 3).split(/[/?#]/, 1)[0] : '';
  if (!['http', 'https'].includes(protocol) || authority?.includes('@')) {
    context.addIssue({
      code: 'custom',
      message: 'Provider URLs must use HTTP(S) and must not contain credentials.',
    });
  }
});
const providerConfigInputFields = {
  id: ProviderConfigIdSchema,
  name: z.string().trim().min(1).max(240),
  baseUrl: ProviderBaseUrlSchema,
  model: z.string().trim().min(1).max(512),
  credentialRef: ProviderCredentialRefSchema.nullable(),
  timeoutMs: z.number().int().min(1_000).max(600_000),
} as const;

const OpenAiCompatibleProviderConfigInputSchema = z.strictObject({
  ...providerConfigInputFields,
  protocol: z.literal('openai_compatible'),
  options: OpenAiCompatibleProviderOptionsSchema,
});
const AnthropicProviderConfigInputSchema = z.strictObject({
  ...providerConfigInputFields,
  protocol: z.literal('anthropic'),
  options: AnthropicProviderOptionsSchema,
});
const CustomProviderConfigInputSchema = z.strictObject({
  ...providerConfigInputFields,
  protocol: z.literal('custom'),
  options: CustomProviderOptionsSchema,
});
export const ProviderConfigInputSchema = z.discriminatedUnion('protocol', [
  OpenAiCompatibleProviderConfigInputSchema,
  AnthropicProviderConfigInputSchema,
  CustomProviderConfigInputSchema,
]);

const providerConfigStoredFields = {
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
} as const;
export const ProviderConfigSchema = z.discriminatedUnion('protocol', [
  OpenAiCompatibleProviderConfigInputSchema.extend(providerConfigStoredFields),
  AnthropicProviderConfigInputSchema.extend(providerConfigStoredFields),
  CustomProviderConfigInputSchema.extend(providerConfigStoredFields),
]);

const commandEnvelope = {
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: z.uuid(),
  sentAt: z.iso.datetime(),
};

export const SettingsGetCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(APP_DATA_COMMANDS.settingsGet),
  payload: z.strictObject({}),
});
export const SettingsSetCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(APP_DATA_COMMANDS.settingsSet),
  payload: AppSettingsUpdateSchema,
});
export const SettingsResetCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(APP_DATA_COMMANDS.settingsReset),
  payload: z.strictObject({}),
});
export const ProjectListRecentCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(APP_DATA_COMMANDS.projectListRecent),
  payload: z.strictObject({}),
});
export const ProjectRelocateRecentCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(APP_DATA_COMMANDS.projectRelocateRecent),
  payload: z.strictObject({ projectId: ProjectIdSchema }),
});
export const ProjectRemoveRecentCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(APP_DATA_COMMANDS.projectRemoveRecent),
  payload: z.strictObject({ projectId: ProjectIdSchema }),
});

export const RecentProjectsDataSchema = z.strictObject({
  projects: z.array(RecentProjectSchema),
});
export const RecentProjectRemovalSchema = z.strictObject({ removed: z.boolean() });

const appDataFailureSchema = z.strictObject({
  ok: z.literal(false),
  requestId: z.uuid(),
  error: z.strictObject({
    code: ErrorCodeSchema,
    message: z.string().min(1).max(512),
    retryable: z.boolean(),
    userAction: z.string().min(1).max(512).optional(),
    diagnosticId: z.string().min(1).max(128).optional(),
  }),
});

function appDataResultSchema<DataSchema extends z.ZodType>(dataSchema: DataSchema) {
  return z.union([
    z.strictObject({
      ok: z.literal(true),
      requestId: z.uuid(),
      data: dataSchema,
    }),
    appDataFailureSchema,
  ]);
}

export const AppSettingsSnapshotResultSchema = appDataResultSchema(AppSettingsSnapshotSchema);
export const RecentProjectsResultSchema = appDataResultSchema(RecentProjectsDataSchema);
export const RecentProjectResultSchema = appDataResultSchema(RecentProjectSchema);
export const RecentProjectRemovalResultSchema = appDataResultSchema(RecentProjectRemovalSchema);

export const CoreAppDataOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal(APP_DATA_COMMANDS.settingsGet) }),
  z.strictObject({
    operation: z.literal(APP_DATA_COMMANDS.settingsSet),
    settings: AppSettingsUpdateSchema,
  }),
  z.strictObject({ operation: z.literal(APP_DATA_COMMANDS.settingsReset) }),
  z.strictObject({ operation: z.literal(APP_DATA_COMMANDS.projectListRecent) }),
  z.strictObject({
    operation: z.literal(APP_DATA_COMMANDS.projectRelocateRecent),
    projectId: ProjectIdSchema,
    workspacePath: WorkspacePathSchema,
  }),
  z.strictObject({
    operation: z.literal(APP_DATA_COMMANDS.projectRemoveRecent),
    projectId: ProjectIdSchema,
  }),
]);

const coreSuccess = <Operation extends string, DataSchema extends z.ZodType>(
  operation: Operation,
  data: DataSchema,
) =>
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(operation),
    data,
  });

export const CoreAppDataResultSchema = z.union([
  coreSuccess(APP_DATA_COMMANDS.settingsGet, AppSettingsSnapshotSchema),
  coreSuccess(APP_DATA_COMMANDS.settingsSet, AppSettingsSnapshotSchema),
  coreSuccess(APP_DATA_COMMANDS.settingsReset, AppSettingsSnapshotSchema),
  coreSuccess(APP_DATA_COMMANDS.projectListRecent, RecentProjectsDataSchema),
  coreSuccess(APP_DATA_COMMANDS.projectRelocateRecent, RecentProjectSchema),
  coreSuccess(APP_DATA_COMMANDS.projectRemoveRecent, RecentProjectRemovalSchema),
  z.strictObject({
    ok: z.literal(false),
    operation: z.enum(APP_DATA_COMMANDS),
    errorCode: ErrorCodeSchema,
  }),
]);

export type AppSettings = z.infer<typeof AppSettingsSchema>;
export type AppSettingsUpdate = z.infer<typeof AppSettingsUpdateSchema>;
export type AppSettingsSnapshot = z.infer<typeof AppSettingsSnapshotSchema>;
export type ShortcutOverride = z.infer<typeof ShortcutOverrideSchema>;
export type CreativePath = z.infer<typeof CreativePathSchema>;
export type OnboardingTip = z.infer<typeof OnboardingTipSchema>;
export type RecentProject = z.infer<typeof RecentProjectSchema>;
export type RecentProjectRegistration = z.infer<typeof RecentProjectRegistrationSchema>;
export type ProviderOptions = z.infer<typeof ProviderOptionsSchema>;
export type OpenAiCompatibleProviderOptions = z.infer<typeof OpenAiCompatibleProviderOptionsSchema>;
export type AnthropicProviderOptions = z.infer<typeof AnthropicProviderOptionsSchema>;
export type CustomProviderOptions = z.infer<typeof CustomProviderOptionsSchema>;
export type ProviderConfigInput = z.infer<typeof ProviderConfigInputSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type CoreAppDataOperation = z.infer<typeof CoreAppDataOperationSchema>;
export type CoreAppDataResult = z.infer<typeof CoreAppDataResultSchema>;
