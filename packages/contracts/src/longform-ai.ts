import { z } from 'zod';

import { GenerationRunTypeSchema } from './generation.js';
import { ErrorCodeSchema } from './error-codes.js';
import { ProviderConfigIdSchema } from './app-data.js';
import { ProjectIdSchema, TASK_PROTOCOL_VERSION } from './task-protocol.js';

export const LONGFORM_AI_IPC_CHANNELS = {
  getSettings: 'worldforge:longform-ai:get-settings',
  updateSettings: 'worldforge:longform-ai:update-settings',
  listDigests: 'worldforge:longform-ai:list-digests',
  rebuildDigests: 'worldforge:longform-ai:rebuild-digests',
  evaluateStyle: 'worldforge:longform-ai:evaluate-style',
  resolveTaskRoute: 'worldforge:longform-ai:resolve-task-route',
} as const;

export const LONGFORM_AI_COMMANDS = {
  getSettings: 'longformAi.getSettings',
  updateSettings: 'longformAi.updateSettings',
  listDigests: 'longformAi.listDigests',
  rebuildDigests: 'longformAi.rebuildDigests',
  evaluateStyle: 'longformAi.evaluateStyle',
  resolveTaskRoute: 'longformAi.resolveTaskRoute',
} as const;

export const StoryDigestScopeTypeSchema = z.enum(['chapter', 'volume', 'project']);
export const StoryDigestFreshnessSchema = z.enum(['fresh', 'stale']);
export const StoryDigestGenerationSourceSchema = z.literal('local_extractive_v1');

export const StoryDigestSchema = z.strictObject({
  id: z.uuid(),
  projectId: ProjectIdSchema,
  scopeType: StoryDigestScopeTypeSchema,
  scopeId: z.uuid(),
  sourceHash: z.string().regex(/^[0-9a-f]{64}$/u),
  sourceVersionIds: z.array(z.uuid()).max(100_000),
  semanticRevision: z.number().int().positive(),
  freshness: StoryDigestFreshnessSchema,
  content: z.string().max(200_000),
  generationSource: StoryDigestGenerationSourceSchema,
  generatedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const StoryDigestListInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  scopeType: StoryDigestScopeTypeSchema.nullable().default(null),
  scopeId: z.uuid().nullable().default(null),
  freshness: StoryDigestFreshnessSchema.nullable().default(null),
  limit: z.number().int().min(1).max(10_000).default(500),
});

export const StoryDigestListSchema = z.strictObject({
  projectId: ProjectIdSchema,
  digests: z.array(StoryDigestSchema).max(10_000),
});

export const StoryDigestRebuildInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  scopeType: StoryDigestScopeTypeSchema,
  scopeId: z.uuid(),
});

export const StoryDigestRebuildResultSchema = z.strictObject({
  projectId: ProjectIdSchema,
  requestedScopeType: StoryDigestScopeTypeSchema,
  requestedScopeId: z.uuid(),
  rebuilt: z.array(StoryDigestSchema).max(100_000),
  skippedUnfinalizedChapters: z.number().int().nonnegative(),
});

export const StyleMetricSchema = z.strictObject({
  averageSentenceCharacters: z.number().finite().min(0).max(100_000),
  averageParagraphCharacters: z.number().finite().min(0).max(1_000_000),
  dialogueRatio: z.number().finite().min(0).max(1),
});

export const StyleProfileSceneMappingSchema = z.strictObject({
  sceneType: z.string().trim().min(1).max(120),
  instructions: z.array(z.string().trim().min(1).max(2_000)).min(1).max(16),
});

export const StyleProfileSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().trim().min(1).max(120),
  origin: z.enum(['preset', 'learned', 'manual']),
  instructions: z.array(z.string().trim().min(1).max(2_000)).max(32),
  sampleVersionIds: z.array(z.uuid()).max(200),
  targetMetrics: StyleMetricSchema.nullable(),
  sceneMappings: z.array(StyleProfileSceneMappingSchema).max(32),
});

export const AiTaskRouteSchema = z
  .strictObject({
    taskType: GenerationRunTypeSchema,
    primaryProviderId: ProviderConfigIdSchema.nullable(),
    fallbackProviderIds: z.array(ProviderConfigIdSchema).max(16),
    minimumSupport: z.enum(['verified', 'limited', 'unverified']),
  })
  .superRefine((route, context) => {
    if (new Set(route.fallbackProviderIds).size !== route.fallbackProviderIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['fallbackProviderIds'],
        message: 'Fallback Providers must be unique.',
      });
    }
    if (route.primaryProviderId && route.fallbackProviderIds.includes(route.primaryProviderId)) {
      context.addIssue({
        code: 'custom',
        path: ['fallbackProviderIds'],
        message: 'The primary Provider cannot also be a fallback.',
      });
    }
  });

export const LongformAiSettingsSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    activeStyleProfileId: z.uuid().nullable(),
    styleProfiles: z.array(StyleProfileSchema).max(32),
    taskRoutes: z.array(AiTaskRouteSchema).max(16),
    updatedAt: z.iso.datetime().nullable(),
  })
  .superRefine((settings, context) => {
    const profileIds = settings.styleProfiles.map((profile) => profile.id);
    if (new Set(profileIds).size !== profileIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['styleProfiles'],
        message: 'Profile ids must be unique.',
      });
    }
    if (settings.activeStyleProfileId && !profileIds.includes(settings.activeStyleProfileId)) {
      context.addIssue({
        code: 'custom',
        path: ['activeStyleProfileId'],
        message: 'The active StyleProfile must exist in this Project.',
      });
    }
    const taskTypes = settings.taskRoutes.map((route) => route.taskType);
    if (new Set(taskTypes).size !== taskTypes.length) {
      context.addIssue({
        code: 'custom',
        path: ['taskRoutes'],
        message: 'Task routes must be unique.',
      });
    }
  });

const LongformAiSettingsValueSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    activeStyleProfileId: z.uuid().nullable(),
    styleProfiles: z.array(StyleProfileSchema).max(32),
    taskRoutes: z.array(AiTaskRouteSchema).max(16),
  })
  .superRefine((settings, context) => {
    const profileIds = settings.styleProfiles.map((profile) => profile.id);
    if (new Set(profileIds).size !== profileIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['styleProfiles'],
        message: 'Profile ids must be unique.',
      });
    }
    if (settings.activeStyleProfileId && !profileIds.includes(settings.activeStyleProfileId)) {
      context.addIssue({
        code: 'custom',
        path: ['activeStyleProfileId'],
        message: 'The active StyleProfile must exist in this Project.',
      });
    }
    const taskTypes = settings.taskRoutes.map((route) => route.taskType);
    if (new Set(taskTypes).size !== taskTypes.length) {
      context.addIssue({
        code: 'custom',
        path: ['taskRoutes'],
        message: 'Task routes must be unique.',
      });
    }
  });

export const LongformAiSettingsUpdateInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  authority: z.literal('author'),
  expectedUpdatedAt: z.iso.datetime().nullable(),
  settings: LongformAiSettingsValueSchema,
});

export const StyleDeviationInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  profileId: z.uuid(),
  versionId: z.uuid(),
});

export const StyleDeviationSchema = z.strictObject({
  projectId: ProjectIdSchema,
  profileId: z.uuid(),
  versionId: z.uuid(),
  status: z.enum(['insufficient_samples', 'within_profile', 'deviated']),
  measured: StyleMetricSchema,
  target: StyleMetricSchema.nullable(),
  deviations: z.array(
    z.strictObject({
      metric: z.enum(['averageSentenceCharacters', 'averageParagraphCharacters', 'dialogueRatio']),
      relativeDifference: z.number().finite().nonnegative(),
    }),
  ),
});

export const AiTaskRouteCandidateSchema = z.strictObject({
  providerId: ProviderConfigIdSchema,
  model: z.string().trim().min(1).max(256),
  credentialConfigured: z.boolean(),
});

export const AiTaskRouteResolveInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  taskType: GenerationRunTypeSchema,
  candidates: z.array(AiTaskRouteCandidateSchema).max(64),
});

export const AiTaskRouteResolutionSchema = z.strictObject({
  projectId: ProjectIdSchema,
  taskType: GenerationRunTypeSchema,
  providerId: ProviderConfigIdSchema,
  model: z.string().min(1).max(256),
  selection: z.enum(['primary', 'fallback', 'default']),
  support: z.enum(['verified', 'limited', 'unverified']),
  rejectedProviderIds: z.array(ProviderConfigIdSchema).max(64),
});

const commandEnvelope = {
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: z.uuid(),
  sentAt: z.iso.datetime(),
};

const command = <Name extends string, Payload extends z.ZodType>(name: Name, payload: Payload) =>
  z.strictObject({ ...commandEnvelope, command: z.literal(name), payload });

export const LongformAiGetSettingsCommandSchema = command(
  LONGFORM_AI_COMMANDS.getSettings,
  z.strictObject({ projectId: ProjectIdSchema }),
);
export const LongformAiUpdateSettingsCommandSchema = command(
  LONGFORM_AI_COMMANDS.updateSettings,
  LongformAiSettingsUpdateInputSchema,
);
export const LongformAiListDigestsCommandSchema = command(
  LONGFORM_AI_COMMANDS.listDigests,
  StoryDigestListInputSchema,
);
export const LongformAiRebuildDigestsCommandSchema = command(
  LONGFORM_AI_COMMANDS.rebuildDigests,
  StoryDigestRebuildInputSchema,
);
export const LongformAiEvaluateStyleCommandSchema = command(
  LONGFORM_AI_COMMANDS.evaluateStyle,
  StyleDeviationInputSchema,
);
export const LongformAiResolveTaskRouteCommandSchema = command(
  LONGFORM_AI_COMMANDS.resolveTaskRoute,
  AiTaskRouteResolveInputSchema,
);

export const CoreLongformAiOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal(LONGFORM_AI_COMMANDS.getSettings),
    input: z.strictObject({ projectId: ProjectIdSchema }),
  }),
  z.strictObject({
    operation: z.literal(LONGFORM_AI_COMMANDS.updateSettings),
    input: LongformAiSettingsUpdateInputSchema,
  }),
  z.strictObject({
    operation: z.literal(LONGFORM_AI_COMMANDS.listDigests),
    input: StoryDigestListInputSchema,
  }),
  z.strictObject({
    operation: z.literal(LONGFORM_AI_COMMANDS.rebuildDigests),
    input: StoryDigestRebuildInputSchema,
  }),
  z.strictObject({
    operation: z.literal(LONGFORM_AI_COMMANDS.evaluateStyle),
    input: StyleDeviationInputSchema,
  }),
  z.strictObject({
    operation: z.literal(LONGFORM_AI_COMMANDS.resolveTaskRoute),
    input: AiTaskRouteResolveInputSchema,
  }),
]);

const coreSuccess = <Name extends string, Data extends z.ZodType>(operation: Name, data: Data) =>
  z.strictObject({ ok: z.literal(true), operation: z.literal(operation), data });

export const CoreLongformAiResultSchema = z.union([
  coreSuccess(LONGFORM_AI_COMMANDS.getSettings, LongformAiSettingsSchema),
  coreSuccess(LONGFORM_AI_COMMANDS.updateSettings, LongformAiSettingsSchema),
  coreSuccess(LONGFORM_AI_COMMANDS.listDigests, StoryDigestListSchema),
  coreSuccess(LONGFORM_AI_COMMANDS.rebuildDigests, StoryDigestRebuildResultSchema),
  coreSuccess(LONGFORM_AI_COMMANDS.evaluateStyle, StyleDeviationSchema),
  coreSuccess(LONGFORM_AI_COMMANDS.resolveTaskRoute, AiTaskRouteResolutionSchema),
  z.strictObject({
    ok: z.literal(false),
    operation: z.enum(LONGFORM_AI_COMMANDS),
    errorCode: ErrorCodeSchema,
  }),
]);

const commandFailure = z.strictObject({
  ok: z.literal(false),
  requestId: z.uuid(),
  error: z.strictObject({
    code: ErrorCodeSchema,
    message: z.string().min(1).max(512),
    retryable: z.boolean(),
  }),
});
const result = <Data extends z.ZodType>(data: Data) =>
  z.union([z.strictObject({ ok: z.literal(true), requestId: z.uuid(), data }), commandFailure]);

export const LongformAiSettingsResultSchema = result(LongformAiSettingsSchema);
export const StoryDigestListResultSchema = result(StoryDigestListSchema);
export const StoryDigestRebuildCommandResultSchema = result(StoryDigestRebuildResultSchema);
export const StyleDeviationResultSchema = result(StyleDeviationSchema);
export const AiTaskRouteResolutionResultSchema = result(AiTaskRouteResolutionSchema);

export interface LongformAiBridge {
  readonly getSettings: (
    projectId: string,
  ) => Promise<z.infer<typeof LongformAiSettingsResultSchema>>;
  readonly updateSettings: (
    input: z.infer<typeof LongformAiSettingsUpdateInputSchema>,
  ) => Promise<z.infer<typeof LongformAiSettingsResultSchema>>;
  readonly listDigests: (
    input: z.input<typeof StoryDigestListInputSchema>,
  ) => Promise<z.infer<typeof StoryDigestListResultSchema>>;
  readonly rebuildDigests: (
    input: z.infer<typeof StoryDigestRebuildInputSchema>,
  ) => Promise<z.infer<typeof StoryDigestRebuildCommandResultSchema>>;
  readonly evaluateStyle: (
    input: z.infer<typeof StyleDeviationInputSchema>,
  ) => Promise<z.infer<typeof StyleDeviationResultSchema>>;
  readonly resolveTaskRoute: (
    input: z.infer<typeof AiTaskRouteResolveInputSchema>,
  ) => Promise<z.infer<typeof AiTaskRouteResolutionResultSchema>>;
}

export type StoryDigestScopeType = z.infer<typeof StoryDigestScopeTypeSchema>;
export type StoryDigest = z.infer<typeof StoryDigestSchema>;
export type StoryDigestListInput = z.input<typeof StoryDigestListInputSchema>;
export type StoryDigestRebuildInput = z.infer<typeof StoryDigestRebuildInputSchema>;
export type LongformAiSettings = z.infer<typeof LongformAiSettingsSchema>;
export type LongformAiSettingsUpdateInput = z.infer<typeof LongformAiSettingsUpdateInputSchema>;
export type StyleDeviationInput = z.infer<typeof StyleDeviationInputSchema>;
export type StyleDeviation = z.infer<typeof StyleDeviationSchema>;
export type AiTaskRouteResolveInput = z.infer<typeof AiTaskRouteResolveInputSchema>;
export type AiTaskRouteResolution = z.infer<typeof AiTaskRouteResolutionSchema>;
export type CoreLongformAiOperation = z.infer<typeof CoreLongformAiOperationSchema>;
export type CoreLongformAiResult = z.infer<typeof CoreLongformAiResultSchema>;
