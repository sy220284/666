import { z } from 'zod';

import { ProviderProtocolSchema } from './ai-output-protocol.js';
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
export const ThemeIdSchema = z.enum(['theme-a', 'theme-b']);
export const ThemeVariantSchema = z.enum(['light', 'dark', 'eye-care', 'high-contrast']);

export const AppSettingsSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    language: AppLanguageSchema,
    startupBehavior: StartupBehaviorSchema,
    defaultMode: AuthorModeSchema,
    themeId: ThemeIdSchema,
    themeVariant: ThemeVariantSchema,
    reduceMotion: z.boolean(),
  })
  .superRefine((settings, context) => {
    if (
      settings.themeId === 'theme-b' &&
      settings.themeVariant !== 'light' &&
      settings.themeVariant !== 'dark'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['themeVariant'],
        message: 'Theme B supports only light and dark variants in V1.0 P0.',
      });
    }
  });

export const AppSettingsUpdateSchema = z.strictObject({
  language: AppLanguageSchema.optional(),
  startupBehavior: StartupBehaviorSchema.optional(),
  defaultMode: AuthorModeSchema.optional(),
  themeId: ThemeIdSchema.optional(),
  themeVariant: ThemeVariantSchema.optional(),
  reduceMotion: z.boolean().optional(),
});

export const DEFAULT_APP_SETTINGS = {
  schemaVersion: 1,
  language: 'zh-CN',
  startupBehavior: 'show-home',
  defaultMode: 'beginner',
  themeId: 'theme-a',
  themeVariant: 'light',
  reduceMotion: false,
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

type ProviderOptionValue =
  | string
  | number
  | boolean
  | null
  | readonly ProviderOptionValue[]
  | { readonly [key: string]: ProviderOptionValue };

const ProviderOptionValueSchema: z.ZodType<ProviderOptionValue> = z.lazy(() =>
  z.union([
    z.string().max(4_096),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(ProviderOptionValueSchema).max(256),
    z.record(z.string().min(1).max(128), ProviderOptionValueSchema),
  ]),
);

const sensitiveOptionKey = /(?:api[-_]?key|access[-_]?token|token|secret|password|credential)/i;

function reportSensitiveKeys(
  value: ProviderOptionValue,
  context: z.RefinementCtx,
  path: readonly (string | number)[] = [],
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => reportSensitiveKeys(item, context, [...path, index]));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    const itemPath = [...path, key];
    if (sensitiveOptionKey.test(key)) {
      context.addIssue({
        code: 'custom',
        path: itemPath,
        message: 'Provider credentials must be stored only through credentialRef.',
      });
    }
    reportSensitiveKeys(item, context, itemPath);
  }
}

export const ProviderOptionsSchema = z
  .record(z.string().min(1).max(128), ProviderOptionValueSchema)
  .superRefine((options, context) => reportSensitiveKeys(options, context));

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
export const ProviderConfigInputSchema = z.strictObject({
  id: ProviderConfigIdSchema,
  name: z.string().trim().min(1).max(240),
  protocol: ProviderProtocolSchema,
  baseUrl: ProviderBaseUrlSchema,
  model: z.string().trim().min(1).max(512),
  credentialRef: ProviderCredentialRefSchema.nullable(),
  timeoutMs: z.number().int().min(1_000).max(600_000),
  options: ProviderOptionsSchema,
});
export const ProviderConfigSchema = ProviderConfigInputSchema.extend({
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strict();

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
export type RecentProject = z.infer<typeof RecentProjectSchema>;
export type RecentProjectRegistration = z.infer<typeof RecentProjectRegistrationSchema>;
export type ProviderOptions = z.infer<typeof ProviderOptionsSchema>;
export type ProviderConfigInput = z.infer<typeof ProviderConfigInputSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type CoreAppDataOperation = z.infer<typeof CoreAppDataOperationSchema>;
export type CoreAppDataResult = z.infer<typeof CoreAppDataResultSchema>;
