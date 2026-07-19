import { z } from 'zod';

import { ErrorCodeSchema } from './error-codes.js';
import { CanonAuthoritySchema } from './entity-canon.js';
import { ProjectIdSchema, TASK_PROTOCOL_VERSION } from './task-protocol.js';

export const CONTINUITY_IPC_CHANNELS = {
  listContinuity: 'worldforge:continuity:list',
  setEntityState: 'worldforge:continuity:set-entity-state',
  saveTimelineEvent: 'worldforge:continuity:save-timeline-event',
  setKnowledgeState: 'worldforge:continuity:set-knowledge-state',
} as const;

export const CONTINUITY_COMMANDS = {
  listContinuity: 'continuity.list',
  setEntityState: 'continuity.setEntityState',
  saveTimelineEvent: 'continuity.saveTimelineEvent',
  setKnowledgeState: 'continuity.setKnowledgeState',
} as const;

export const ContinuityKeySchema = z.string().trim().min(1).max(240);
export const EntityStateKeySchema = z.string().trim().min(1).max(120);
export const EntityStateRecordStatusSchema = z.enum([
  'current',
  'historical',
  'superseded',
  'invalid',
]);
export const KnowledgeStatusSchema = z.enum([
  'knows',
  'believes',
  'suspects',
  'misunderstands',
  'unknown',
]);
export const KnowledgeRecordStatusSchema = z.enum(['current', 'historical']);
export const TimelinePrecisionSchema = z.enum([
  'exact',
  'day',
  'month',
  'year',
  'approximate',
  'unknown',
]);
export const TimelineEntityRoleSchema = z.enum(['participant', 'witness', 'subject']);
export const EvidenceAnchorKindSchema = z.enum([
  'chapter',
  'sceneBeat',
  'block',
  'version',
  'entity',
]);

export const EvidenceAnchorSchema = z.strictObject({
  kind: EvidenceAnchorKindSchema,
  targetId: z.uuid(),
  note: z.string().trim().max(2_000).default(''),
});

export const EntityStateSchema = z.strictObject({
  id: z.uuid(),
  projectId: ProjectIdSchema,
  entityId: z.uuid(),
  stateKey: EntityStateKeySchema,
  value: z.json(),
  validFromChapterId: z.uuid(),
  validUntilChapterId: z.uuid().nullable(),
  recordStatus: EntityStateRecordStatusSchema,
  evidence: z.array(EvidenceAnchorSchema).max(100),
  sourceVersionId: z.uuid(),
  createdAt: z.iso.datetime(),
});

export const TimelineEventSchema = z.strictObject({
  id: z.uuid(),
  projectId: ProjectIdSchema,
  title: z.string().trim().min(1).max(240),
  startValue: z.string().trim().min(1).max(120),
  endValue: z.string().trim().min(1).max(120).nullable(),
  precision: TimelinePrecisionSchema,
  chapterId: z.uuid().nullable(),
  locationId: z.uuid().nullable(),
  description: z.string().trim().max(20_000),
  participantIds: z.array(z.uuid()).max(200),
  dependencyIds: z.array(z.uuid()).max(200),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const KnowledgeStateSchema = z.strictObject({
  id: z.uuid(),
  projectId: ProjectIdSchema,
  informationKey: ContinuityKeySchema,
  characterId: z.uuid(),
  knowledgeStatus: KnowledgeStatusSchema,
  acquiredChapterId: z.uuid().nullable(),
  sourceBlockId: z.uuid().nullable(),
  sourceVersionId: z.uuid().nullable(),
  notes: z.string().trim().max(20_000),
  recordStatus: KnowledgeRecordStatusSchema,
  createdAt: z.iso.datetime(),
  supersededAt: z.iso.datetime().nullable(),
});

export const ContinuityCatalogSchema = z.strictObject({
  projectId: ProjectIdSchema,
  entityStates: z.array(EntityStateSchema),
  timelineEvents: z.array(TimelineEventSchema),
  knowledgeStates: z.array(KnowledgeStateSchema),
});

export const ContinuityListInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  query: z.string().trim().max(240).default(''),
  includeHistory: z.boolean().default(true),
  effectiveAtChapterId: z.uuid().nullable().default(null),
});

export const EntityStateSetInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  authority: CanonAuthoritySchema,
  entityId: z.uuid(),
  stateKey: EntityStateKeySchema,
  value: z.json(),
  validFromChapterId: z.uuid(),
  validUntilChapterId: z.uuid().nullable().default(null),
  evidence: z.array(EvidenceAnchorSchema).max(100).default([]),
  sourceVersionId: z.uuid(),
});

export const TimelineEventSaveInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  authority: CanonAuthoritySchema,
  eventId: z.uuid().nullable().default(null),
  title: z.string().trim().min(1).max(240),
  startValue: z.string().trim().min(1).max(120),
  endValue: z.string().trim().min(1).max(120).nullable().default(null),
  precision: TimelinePrecisionSchema,
  chapterId: z.uuid().nullable().default(null),
  locationId: z.uuid().nullable().default(null),
  description: z.string().trim().max(20_000).default(''),
  participantIds: z.array(z.uuid()).max(200).default([]),
  dependencyIds: z.array(z.uuid()).max(200).default([]),
});

export const KnowledgeStateSetInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  authority: CanonAuthoritySchema,
  informationKey: ContinuityKeySchema,
  characterId: z.uuid(),
  knowledgeStatus: KnowledgeStatusSchema,
  acquiredChapterId: z.uuid().nullable().default(null),
  sourceBlockId: z.uuid().nullable().default(null),
  sourceVersionId: z.uuid().nullable().default(null),
  notes: z.string().trim().max(20_000).default(''),
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

export const ContinuityListCommandSchema = command(
  CONTINUITY_COMMANDS.listContinuity,
  ContinuityListInputSchema,
);
export const EntityStateSetCommandSchema = command(
  CONTINUITY_COMMANDS.setEntityState,
  EntityStateSetInputSchema,
);
export const TimelineEventSaveCommandSchema = command(
  CONTINUITY_COMMANDS.saveTimelineEvent,
  TimelineEventSaveInputSchema,
);
export const KnowledgeStateSetCommandSchema = command(
  CONTINUITY_COMMANDS.setKnowledgeState,
  KnowledgeStateSetInputSchema,
);

const commandFailure = z.strictObject({
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

export const ContinuityCatalogResultSchema = z.union([
  z.strictObject({
    ok: z.literal(true),
    requestId: z.uuid(),
    data: ContinuityCatalogSchema,
  }),
  commandFailure,
]);

export const CoreContinuityOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal(CONTINUITY_COMMANDS.listContinuity),
    input: ContinuityListInputSchema,
  }),
  z.strictObject({
    operation: z.literal(CONTINUITY_COMMANDS.setEntityState),
    input: EntityStateSetInputSchema,
  }),
  z.strictObject({
    operation: z.literal(CONTINUITY_COMMANDS.saveTimelineEvent),
    input: TimelineEventSaveInputSchema,
  }),
  z.strictObject({
    operation: z.literal(CONTINUITY_COMMANDS.setKnowledgeState),
    input: KnowledgeStateSetInputSchema,
  }),
]);

const coreSuccess = <Operation extends string>(operation: Operation) =>
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(operation),
    data: ContinuityCatalogSchema,
  });

export const CoreContinuityResultSchema = z.union([
  coreSuccess(CONTINUITY_COMMANDS.listContinuity),
  coreSuccess(CONTINUITY_COMMANDS.setEntityState),
  coreSuccess(CONTINUITY_COMMANDS.saveTimelineEvent),
  coreSuccess(CONTINUITY_COMMANDS.setKnowledgeState),
  z.strictObject({
    ok: z.literal(false),
    operation: z.enum(CONTINUITY_COMMANDS),
    errorCode: ErrorCodeSchema,
  }),
]);

export type EvidenceAnchor = z.infer<typeof EvidenceAnchorSchema>;
export type EntityState = z.infer<typeof EntityStateSchema>;
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;
export type KnowledgeState = z.infer<typeof KnowledgeStateSchema>;
export type ContinuityCatalog = z.infer<typeof ContinuityCatalogSchema>;
export type ContinuityListInput = z.infer<typeof ContinuityListInputSchema>;
export type EntityStateSetInput = z.infer<typeof EntityStateSetInputSchema>;
export type TimelineEventSaveInput = z.infer<typeof TimelineEventSaveInputSchema>;
export type KnowledgeStateSetInput = z.infer<typeof KnowledgeStateSetInputSchema>;
