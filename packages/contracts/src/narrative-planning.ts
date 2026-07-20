import { z } from 'zod';

import { CanonAuthoritySchema } from './entity-canon.js';
import { ErrorCodeSchema } from './error-codes.js';
import { ProjectIdSchema, TASK_PROTOCOL_VERSION } from './task-protocol.js';

export const NARRATIVE_PLANNING_IPC_CHANNELS = {
  list: 'worldforge:narrative-planning:list',
  saveForeshadowing: 'worldforge:narrative-planning:save-foreshadowing',
  transitionForeshadowing: 'worldforge:narrative-planning:transition-foreshadowing',
  saveCharacterArc: 'worldforge:narrative-planning:save-character-arc',
  saveArcMilestone: 'worldforge:narrative-planning:save-arc-milestone',
  transitionArcMilestone: 'worldforge:narrative-planning:transition-arc-milestone',
} as const;

export const NARRATIVE_PLANNING_COMMANDS = {
  list: 'narrativePlanning.list',
  saveForeshadowing: 'narrativePlanning.saveForeshadowing',
  transitionForeshadowing: 'narrativePlanning.transitionForeshadowing',
  saveCharacterArc: 'narrativePlanning.saveCharacterArc',
  saveArcMilestone: 'narrativePlanning.saveArcMilestone',
  transitionArcMilestone: 'narrativePlanning.transitionArcMilestone',
} as const;

export const ForeshadowingStatusSchema = z.enum([
  'planned',
  'planted',
  'reinforced',
  'partially_revealed',
  'revealed',
  'cancelled',
]);
export const ForeshadowingChapterRoleSchema = z.enum([
  'plant',
  'reinforce',
  'partial_reveal',
  'reveal',
  'reference',
]);
export const ForeshadowingRelationKindSchema = z.enum([
  'depends_on',
  'blocks',
  'mutually_exclusive',
  'reinforces',
]);
export const CharacterArcTypeSchema = z.enum([
  'growth',
  'darkening',
  'awakening',
  'fall',
  'redemption',
  'custom',
]);
export const CharacterArcStatusSchema = z.enum(['planned', 'active', 'completed', 'abandoned']);
export const ArcMilestoneStatusSchema = z.enum(['planned', 'hit', 'skipped']);
export const ArcMilestoneConfirmationSourceSchema = z.enum(['author', 'state_proposal']);
export const NarrativeAttentionSchema = z.enum(['none', 'due', 'overdue', 'blocked']);

export const ForeshadowingChapterLinkSchema = z.strictObject({
  chapterId: z.uuid(),
  role: ForeshadowingChapterRoleSchema,
});
export const ForeshadowingRelationSchema = z.strictObject({
  targetForeshadowingId: z.uuid(),
  kind: ForeshadowingRelationKindSchema,
});

export const ForeshadowingSchema = z.strictObject({
  id: z.uuid(),
  projectId: ProjectIdSchema,
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(20_000),
  status: ForeshadowingStatusSchema,
  revealFromChapterId: z.uuid().nullable(),
  revealByChapterId: z.uuid().nullable(),
  chapterLinks: z.array(ForeshadowingChapterLinkSchema).max(500),
  relations: z.array(ForeshadowingRelationSchema).max(500),
  attention: NarrativeAttentionSchema,
  warnings: z.array(z.string().trim().min(1).max(512)).max(100),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const ArcMilestoneSchema = z.strictObject({
  id: z.uuid(),
  projectId: ProjectIdSchema,
  arcId: z.uuid(),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(20_000),
  sortIndex: z.number().int().nonnegative(),
  plannedChapterId: z.uuid().nullable(),
  actualChapterId: z.uuid().nullable(),
  status: ArcMilestoneStatusSchema,
  confirmationSource: ArcMilestoneConfirmationSourceSchema.nullable(),
  dependencyMilestoneIds: z.array(z.uuid()).max(200),
  dependencyTimelineEventIds: z.array(z.uuid()).max(200),
  attention: NarrativeAttentionSchema,
  warnings: z.array(z.string().trim().min(1).max(512)).max(100),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const CharacterArcSchema = z.strictObject({
  id: z.uuid(),
  projectId: ProjectIdSchema,
  characterId: z.uuid(),
  title: z.string().trim().min(1).max(240),
  arcType: CharacterArcTypeSchema,
  customType: z.string().trim().min(1).max(120).nullable(),
  status: CharacterArcStatusSchema,
  authorIntent: z.string().trim().max(20_000),
  milestones: z.array(ArcMilestoneSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const NarrativePlanningCatalogSchema = z.strictObject({
  projectId: ProjectIdSchema,
  foreshadowings: z.array(ForeshadowingSchema),
  characterArcs: z.array(CharacterArcSchema),
});

export const NarrativePlanningListInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  query: z.string().trim().max(240).default(''),
  includeResolved: z.boolean().default(true),
  referenceChapterId: z.uuid().nullable().default(null),
});

export const ForeshadowingSaveInputSchema = z
  .strictObject({
    projectId: ProjectIdSchema,
    authority: CanonAuthoritySchema,
    foreshadowingId: z.uuid().nullable().default(null),
    title: z.string().trim().min(1).max(240),
    description: z.string().trim().max(20_000).default(''),
    revealFromChapterId: z.uuid().nullable().default(null),
    revealByChapterId: z.uuid().nullable().default(null),
    chapterLinks: z.array(ForeshadowingChapterLinkSchema).max(500).default([]),
    relations: z.array(ForeshadowingRelationSchema).max(500).default([]),
  })
  .superRefine((value, context) => {
    const relationKeys = value.relations.map(
      (relation) => `${relation.targetForeshadowingId}:${relation.kind}`,
    );
    if (new Set(relationKeys).size !== relationKeys.length) {
      context.addIssue({
        code: 'custom',
        path: ['relations'],
        message: 'Relations must be unique.',
      });
    }
    const chapterKeys = value.chapterLinks.map((link) => `${link.chapterId}:${link.role}`);
    if (new Set(chapterKeys).size !== chapterKeys.length) {
      context.addIssue({
        code: 'custom',
        path: ['chapterLinks'],
        message: 'Chapter links must be unique.',
      });
    }
  });

export const ForeshadowingTransitionInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  authority: CanonAuthoritySchema,
  foreshadowingId: z.uuid(),
  status: ForeshadowingStatusSchema,
});

export const CharacterArcSaveInputSchema = z
  .strictObject({
    projectId: ProjectIdSchema,
    authority: CanonAuthoritySchema,
    arcId: z.uuid().nullable().default(null),
    characterId: z.uuid(),
    title: z.string().trim().min(1).max(240),
    arcType: CharacterArcTypeSchema,
    customType: z.string().trim().min(1).max(120).nullable().default(null),
    status: CharacterArcStatusSchema.default('planned'),
    authorIntent: z.string().trim().max(20_000).default(''),
  })
  .superRefine((value, context) => {
    if (value.arcType === 'custom' && value.customType === null) {
      context.addIssue({
        code: 'custom',
        path: ['customType'],
        message: 'Custom arcs require a custom type.',
      });
    }
    if (value.arcType !== 'custom' && value.customType !== null) {
      context.addIssue({
        code: 'custom',
        path: ['customType'],
        message: 'Only custom arcs may define a custom type.',
      });
    }
  });

export const ArcMilestoneSaveInputSchema = z
  .strictObject({
    projectId: ProjectIdSchema,
    authority: CanonAuthoritySchema,
    milestoneId: z.uuid().nullable().default(null),
    arcId: z.uuid(),
    title: z.string().trim().min(1).max(240),
    description: z.string().trim().max(20_000).default(''),
    sortIndex: z.number().int().nonnegative(),
    plannedChapterId: z.uuid().nullable().default(null),
    dependencyMilestoneIds: z.array(z.uuid()).max(200).default([]),
    dependencyTimelineEventIds: z.array(z.uuid()).max(200).default([]),
  })
  .superRefine((value, context) => {
    if (new Set(value.dependencyMilestoneIds).size !== value.dependencyMilestoneIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['dependencyMilestoneIds'],
        message: 'Milestone dependencies must be unique.',
      });
    }
    if (
      new Set(value.dependencyTimelineEventIds).size !== value.dependencyTimelineEventIds.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['dependencyTimelineEventIds'],
        message: 'Timeline dependencies must be unique.',
      });
    }
  });

export const ArcMilestoneTransitionInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  authority: CanonAuthoritySchema,
  milestoneId: z.uuid(),
  status: ArcMilestoneStatusSchema,
  actualChapterId: z.uuid().nullable().default(null),
});

const envelope = {
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: z.uuid(),
  sentAt: z.iso.datetime(),
};
const command = <Command extends string, Payload extends z.ZodType>(
  commandName: Command,
  payload: Payload,
) => z.strictObject({ ...envelope, command: z.literal(commandName), payload });

export const NarrativePlanningListCommandSchema = command(
  NARRATIVE_PLANNING_COMMANDS.list,
  NarrativePlanningListInputSchema,
);
export const ForeshadowingSaveCommandSchema = command(
  NARRATIVE_PLANNING_COMMANDS.saveForeshadowing,
  ForeshadowingSaveInputSchema,
);
export const ForeshadowingTransitionCommandSchema = command(
  NARRATIVE_PLANNING_COMMANDS.transitionForeshadowing,
  ForeshadowingTransitionInputSchema,
);
export const CharacterArcSaveCommandSchema = command(
  NARRATIVE_PLANNING_COMMANDS.saveCharacterArc,
  CharacterArcSaveInputSchema,
);
export const ArcMilestoneSaveCommandSchema = command(
  NARRATIVE_PLANNING_COMMANDS.saveArcMilestone,
  ArcMilestoneSaveInputSchema,
);
export const ArcMilestoneTransitionCommandSchema = command(
  NARRATIVE_PLANNING_COMMANDS.transitionArcMilestone,
  ArcMilestoneTransitionInputSchema,
);

const failure = z.strictObject({
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
export const NarrativePlanningCatalogResultSchema = z.union([
  z.strictObject({
    ok: z.literal(true),
    requestId: z.uuid(),
    data: NarrativePlanningCatalogSchema,
  }),
  failure,
]);

export const CoreNarrativePlanningOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal(NARRATIVE_PLANNING_COMMANDS.list),
    input: NarrativePlanningListInputSchema,
  }),
  z.strictObject({
    operation: z.literal(NARRATIVE_PLANNING_COMMANDS.saveForeshadowing),
    input: ForeshadowingSaveInputSchema,
  }),
  z.strictObject({
    operation: z.literal(NARRATIVE_PLANNING_COMMANDS.transitionForeshadowing),
    input: ForeshadowingTransitionInputSchema,
  }),
  z.strictObject({
    operation: z.literal(NARRATIVE_PLANNING_COMMANDS.saveCharacterArc),
    input: CharacterArcSaveInputSchema,
  }),
  z.strictObject({
    operation: z.literal(NARRATIVE_PLANNING_COMMANDS.saveArcMilestone),
    input: ArcMilestoneSaveInputSchema,
  }),
  z.strictObject({
    operation: z.literal(NARRATIVE_PLANNING_COMMANDS.transitionArcMilestone),
    input: ArcMilestoneTransitionInputSchema,
  }),
]);

const coreSuccess = <Operation extends string>(operation: Operation) =>
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(operation),
    data: NarrativePlanningCatalogSchema,
  });
export const CoreNarrativePlanningResultSchema = z.union([
  coreSuccess(NARRATIVE_PLANNING_COMMANDS.list),
  coreSuccess(NARRATIVE_PLANNING_COMMANDS.saveForeshadowing),
  coreSuccess(NARRATIVE_PLANNING_COMMANDS.transitionForeshadowing),
  coreSuccess(NARRATIVE_PLANNING_COMMANDS.saveCharacterArc),
  coreSuccess(NARRATIVE_PLANNING_COMMANDS.saveArcMilestone),
  coreSuccess(NARRATIVE_PLANNING_COMMANDS.transitionArcMilestone),
  z.strictObject({
    ok: z.literal(false),
    operation: z.enum(NARRATIVE_PLANNING_COMMANDS),
    errorCode: ErrorCodeSchema,
  }),
]);

export type ForeshadowingStatus = z.infer<typeof ForeshadowingStatusSchema>;
export type Foreshadowing = z.infer<typeof ForeshadowingSchema>;
export type CharacterArc = z.infer<typeof CharacterArcSchema>;
export type ArcMilestone = z.infer<typeof ArcMilestoneSchema>;
export type NarrativePlanningCatalog = z.infer<typeof NarrativePlanningCatalogSchema>;
export type NarrativePlanningListInput = z.infer<typeof NarrativePlanningListInputSchema>;
export type ForeshadowingSaveInput = z.infer<typeof ForeshadowingSaveInputSchema>;
export type ForeshadowingTransitionInput = z.infer<typeof ForeshadowingTransitionInputSchema>;
export type CharacterArcSaveInput = z.infer<typeof CharacterArcSaveInputSchema>;
export type ArcMilestoneSaveInput = z.infer<typeof ArcMilestoneSaveInputSchema>;
export type ArcMilestoneTransitionInput = z.infer<typeof ArcMilestoneTransitionInputSchema>;
