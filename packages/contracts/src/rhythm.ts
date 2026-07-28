import { z } from 'zod';

import { ErrorCodeSchema } from './error-codes.js';
import { ProjectIdSchema, TASK_PROTOCOL_VERSION } from './task-protocol.js';

export const MutationOriginSchema = z.enum([
  'manual_edit',
  'candidate_apply',
  'import',
  'safe_replace',
  'structure',
  'restore',
  'system',
]);

export const RHYTHM_IPC_CHANNELS = {
  get: 'worldforge:rhythm:get',
  updateProfile: 'worldforge:rhythm:update-profile',
  run: 'worldforge:rhythm:run',
} as const;
export const RHYTHM_COMMANDS = {
  get: 'rhythm.get',
  updateProfile: 'rhythm.updateProfile',
  run: 'rhythm.run',
} as const;

export const GenreRhythmProfileSchema = z
  .strictObject({
    projectId: ProjectIdSchema,
    channel: z.string().trim().min(1).max(120),
    enabled: z.boolean(),
    excitementMinPer1000: z.number().finite().nonnegative(),
    excitementMaxPer1000: z.number().finite().nonnegative(),
    hookEnabled: z.boolean(),
    goldenThreeEnabled: z.boolean(),
    targetDailyCharacters: z.number().int().nonnegative().max(1_000_000),
    idleThresholdSeconds: z.number().int().min(30).max(7_200),
    timeZone: z.string().min(1).max(120),
    statisticsStartedAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .refine((profile) => profile.excitementMaxPer1000 >= profile.excitementMinPer1000, {
    path: ['excitementMaxPer1000'],
    message: 'The maximum excitement density must not be below the minimum.',
  });

export const RhythmProfileUpdateInputSchema = z
  .strictObject({
    projectId: ProjectIdSchema,
    authority: z.enum(['author', 'ai']),
    enabled: z.boolean(),
    excitementMinPer1000: z.number().finite().nonnegative().max(1_000),
    excitementMaxPer1000: z.number().finite().nonnegative().max(1_000),
    hookEnabled: z.boolean(),
    goldenThreeEnabled: z.boolean(),
    targetDailyCharacters: z.number().int().nonnegative().max(1_000_000),
    idleThresholdSeconds: z.number().int().min(30).max(7_200),
    timeZone: z.string().min(1).max(120),
  })
  .refine((profile) => profile.excitementMaxPer1000 >= profile.excitementMinPer1000, {
    path: ['excitementMaxPer1000'],
  });

export const WritingDayMetricSchema = z.strictObject({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  manualNetCharacters: z.number().int(),
  effectiveSeconds: z.number().int().nonnegative(),
});
export const RhythmChapterMetricSchema = z.strictObject({
  chapterId: z.uuid(),
  title: z.string().min(1).max(240),
  ordinal: z.number().int().positive(),
  inGoldenThree: z.boolean(),
  characterCount: z.number().int().nonnegative(),
  excitementBeatCount: z.number().int().nonnegative(),
  excitementPer1000: z.number().finite().nonnegative(),
  endingHookDetected: z.boolean(),
});
export const RhythmSuggestionSchema = z.strictObject({
  suggestionId: z.string().min(1).max(240),
  chapterId: z.uuid().nullable(),
  kind: z.enum(['excitement_density', 'ending_hook', 'golden_three', 'update_pace']),
  priority: z.literal('P3'),
  message: z.string().min(1).max(2_000),
  evidence: z.array(z.string().min(1).max(500)).max(20),
});
export const RhythmDashboardSchema = z.strictObject({
  projectId: ProjectIdSchema,
  profile: GenreRhythmProfileSchema,
  today: WritingDayMetricSchema,
  cumulativeManualNetCharacters: z.number().int(),
  cumulativeEffectiveSeconds: z.number().int().nonnegative(),
  days: z.array(WritingDayMetricSchema).max(366),
  chapters: z.array(RhythmChapterMetricSchema),
  suggestions: z.array(RhythmSuggestionSchema),
  calculatedAt: z.iso.datetime(),
});

const payload = z.strictObject({ projectId: ProjectIdSchema });
const envelope = {
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: z.uuid(),
  sentAt: z.iso.datetime(),
};
export const RhythmGetCommandSchema = z.strictObject({
  ...envelope,
  command: z.literal(RHYTHM_COMMANDS.get),
  payload,
});
export const RhythmRunCommandSchema = z.strictObject({
  ...envelope,
  command: z.literal(RHYTHM_COMMANDS.run),
  payload,
});
export const RhythmUpdateProfileCommandSchema = z.strictObject({
  ...envelope,
  command: z.literal(RHYTHM_COMMANDS.updateProfile),
  payload: RhythmProfileUpdateInputSchema,
});

export const CoreRhythmOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal(RHYTHM_COMMANDS.get), input: payload }),
  z.strictObject({ operation: z.literal(RHYTHM_COMMANDS.run), input: payload }),
  z.strictObject({
    operation: z.literal(RHYTHM_COMMANDS.updateProfile),
    input: RhythmProfileUpdateInputSchema,
  }),
]);
const failure = z.strictObject({
  ok: z.literal(false),
  operation: z.enum(RHYTHM_COMMANDS),
  errorCode: ErrorCodeSchema,
});
const success = <Name extends string>(operation: Name) =>
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(operation),
    data: RhythmDashboardSchema,
  });
export const CoreRhythmResultSchema = z.union([
  success(RHYTHM_COMMANDS.get),
  success(RHYTHM_COMMANDS.run),
  success(RHYTHM_COMMANDS.updateProfile),
  failure,
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
export const RhythmDashboardResultSchema = z.union([
  z.strictObject({ ok: z.literal(true), requestId: z.uuid(), data: RhythmDashboardSchema }),
  commandFailure,
]);

export interface RhythmBridge {
  readonly get: (input: {
    readonly projectId: string;
  }) => Promise<z.infer<typeof RhythmDashboardResultSchema>>;
  readonly run: (input: {
    readonly projectId: string;
  }) => Promise<z.infer<typeof RhythmDashboardResultSchema>>;
  readonly updateProfile: (
    input: z.infer<typeof RhythmProfileUpdateInputSchema>,
  ) => Promise<z.infer<typeof RhythmDashboardResultSchema>>;
}

export type MutationOrigin = z.infer<typeof MutationOriginSchema>;
export type GenreRhythmProfile = z.infer<typeof GenreRhythmProfileSchema>;
export type RhythmDashboard = z.infer<typeof RhythmDashboardSchema>;
export type RhythmProfileUpdateInput = z.infer<typeof RhythmProfileUpdateInputSchema>;
