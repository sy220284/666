import { z } from 'zod';

import { ErrorCodeSchema } from './error-codes.js';
import { EntityStatusSchema, EntityTypeSchema } from './entity-canon.js';
import { ProjectIdSchema, TASK_PROTOCOL_VERSION } from './task-protocol.js';

export const STORY_KNOWLEDGE_IPC_CHANNELS = {
  project: 'worldforge:story-knowledge:project',
} as const;

export const STORY_KNOWLEDGE_COMMANDS = {
  project: 'storyKnowledge.project',
} as const;

const limit = z.number().int().min(1).max(100).default(50);
const chapterId = z.uuid();

export const StoryKnowledgeProjectionInputSchema = z.discriminatedUnion('view', [
  z.strictObject({
    view: z.literal('character_card'),
    projectId: ProjectIdSchema,
    characterId: z.uuid(),
    chapterId: chapterId.nullable().default(null),
    limit,
  }),
  z.strictObject({
    view: z.literal('relationships'),
    projectId: ProjectIdSchema,
    characterId: z.uuid(),
    chapterId,
    limit,
  }),
  z.strictObject({
    view: z.literal('timeline'),
    projectId: ProjectIdSchema,
    chapterId,
    characterId: z.uuid().nullable().default(null),
    before: z.number().int().min(0).max(50).default(12),
    after: z.number().int().min(0).max(50).default(12),
  }),
  z.strictObject({
    view: z.literal('foreshadowing'),
    projectId: ProjectIdSchema,
    chapterId,
    limit,
  }),
  z.strictObject({
    view: z.literal('arc'),
    projectId: ProjectIdSchema,
    characterId: z.uuid(),
    chapterId: chapterId.nullable().default(null),
    limit,
  }),
  z.strictObject({
    view: z.literal('history'),
    projectId: ProjectIdSchema,
    chapterId,
    beforeCreatedAt: z.iso.datetime().nullable().default(null),
    limit,
  }),
  z.strictObject({
    view: z.literal('chapter_assist'),
    projectId: ProjectIdSchema,
    chapterId,
    limit,
  }),
]);

const StoryKnowledgeEntitySummarySchema = z.strictObject({
  id: z.uuid(),
  entityType: EntityTypeSchema,
  name: z.string().min(1).max(240),
  summary: z.string().max(20_000),
  status: EntityStatusSchema,
});

const StoryKnowledgeFactSchema = z.strictObject({
  id: z.uuid(),
  key: z.string().min(1).max(120),
  value: z.json(),
  description: z.string().max(20_000),
});

const StoryKnowledgeStateSchema = z.strictObject({
  id: z.uuid(),
  key: z.string().min(1).max(120),
  semanticKind: z.string().min(1).max(80),
  value: z.json(),
  validFromChapterId: z.uuid(),
  validUntilChapterId: z.uuid().nullable(),
});

const StoryKnowledgeRelationshipSchema = z.strictObject({
  id: z.uuid(),
  fromCharacterId: z.uuid(),
  fromCharacterName: z.string().min(1).max(240),
  toCharacterId: z.uuid(),
  toCharacterName: z.string().min(1).max(240),
  category: z.string().min(1).max(80),
  label: z.string().max(500),
  validFromChapterId: z.uuid(),
  validUntilChapterId: z.uuid().nullable(),
});

const StoryKnowledgeTimelineItemSchema = z.strictObject({
  id: z.uuid(),
  title: z.string().min(1).max(500),
  chapterId: z.uuid(),
  chapterTitle: z.string().min(1).max(240),
  startValue: z.number(),
  endValue: z.number().nullable(),
  precision: z.string().min(1).max(80),
  locationId: z.uuid().nullable(),
});

const StoryKnowledgeForeshadowingItemSchema = z.strictObject({
  id: z.uuid(),
  title: z.string().min(1).max(500),
  description: z.string().max(20_000),
  status: z.string().min(1).max(80),
  revealFromChapterId: z.uuid().nullable(),
  revealByChapterId: z.uuid().nullable(),
});

const StoryKnowledgeArcMilestoneSchema = z.strictObject({
  id: z.uuid(),
  arcId: z.uuid(),
  arcTitle: z.string().min(1).max(500),
  title: z.string().min(1).max(500),
  description: z.string().max(20_000),
  status: z.string().min(1).max(80),
  plannedChapterId: z.uuid().nullable(),
  actualChapterId: z.uuid().nullable(),
  sortIndex: z.number().int().nonnegative(),
});

const StoryKnowledgeHistoryItemSchema = z.strictObject({
  versionId: z.uuid(),
  chapterId: z.uuid(),
  title: z.string().min(1).max(240),
  description: z.string().max(2_000),
  versionType: z.string().min(1).max(80),
  wordCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  finalized: z.boolean(),
});

const projectionBase = {
  projectId: ProjectIdSchema,
  bounded: z.literal(true),
};

export const StoryKnowledgeProjectionSchema = z.discriminatedUnion('view', [
  z.strictObject({
    ...projectionBase,
    view: z.literal('character_card'),
    character: StoryKnowledgeEntitySummarySchema,
    facts: z.array(StoryKnowledgeFactSchema).max(100),
    states: z.array(StoryKnowledgeStateSchema).max(100),
    relationships: z.array(StoryKnowledgeRelationshipSchema).max(100),
  }),
  z.strictObject({
    ...projectionBase,
    view: z.literal('relationships'),
    center: StoryKnowledgeEntitySummarySchema,
    relationships: z.array(StoryKnowledgeRelationshipSchema).max(100),
    truncated: z.boolean(),
  }),
  z.strictObject({
    ...projectionBase,
    view: z.literal('timeline'),
    anchorChapterId: z.uuid(),
    items: z.array(StoryKnowledgeTimelineItemSchema).max(101),
    truncatedBefore: z.boolean(),
    truncatedAfter: z.boolean(),
  }),
  z.strictObject({
    ...projectionBase,
    view: z.literal('foreshadowing'),
    anchorChapterId: z.uuid(),
    items: z.array(StoryKnowledgeForeshadowingItemSchema).max(100),
    truncated: z.boolean(),
  }),
  z.strictObject({
    ...projectionBase,
    view: z.literal('arc'),
    character: StoryKnowledgeEntitySummarySchema,
    milestones: z.array(StoryKnowledgeArcMilestoneSchema).max(100),
    truncated: z.boolean(),
  }),
  z.strictObject({
    ...projectionBase,
    view: z.literal('history'),
    chapterId: z.uuid(),
    items: z.array(StoryKnowledgeHistoryItemSchema).max(100),
    nextBeforeCreatedAt: z.iso.datetime().nullable(),
  }),
  z.strictObject({
    ...projectionBase,
    view: z.literal('chapter_assist'),
    chapterId: z.uuid(),
    characters: z.array(StoryKnowledgeEntitySummarySchema).max(100),
    relationships: z.array(StoryKnowledgeRelationshipSchema).max(100),
    timeline: z.array(StoryKnowledgeTimelineItemSchema).max(100),
    foreshadowings: z.array(StoryKnowledgeForeshadowingItemSchema).max(100),
    milestones: z.array(StoryKnowledgeArcMilestoneSchema).max(100),
  }),
]);

const envelope = {
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: z.uuid(),
  sentAt: z.iso.datetime(),
};

export const StoryKnowledgeProjectCommandSchema = z.strictObject({
  ...envelope,
  command: z.literal(STORY_KNOWLEDGE_COMMANDS.project),
  payload: StoryKnowledgeProjectionInputSchema,
});

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

export const StoryKnowledgeProjectionResultSchema = z.union([
  z.strictObject({ ok: z.literal(true), requestId: z.uuid(), data: StoryKnowledgeProjectionSchema }),
  commandFailure,
]);

export const CoreStoryKnowledgeOperationSchema = z.strictObject({
  operation: z.literal(STORY_KNOWLEDGE_COMMANDS.project),
  input: StoryKnowledgeProjectionInputSchema,
});

export const CoreStoryKnowledgeResultSchema = z.union([
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(STORY_KNOWLEDGE_COMMANDS.project),
    data: StoryKnowledgeProjectionSchema,
  }),
  z.strictObject({
    ok: z.literal(false),
    operation: z.literal(STORY_KNOWLEDGE_COMMANDS.project),
    errorCode: ErrorCodeSchema,
  }),
]);

export type StoryKnowledgeProjectionInput = z.infer<typeof StoryKnowledgeProjectionInputSchema>;
export type StoryKnowledgeProjection = z.infer<typeof StoryKnowledgeProjectionSchema>;
export type StoryKnowledgeBridge = {
  readonly project: (
    input: StoryKnowledgeProjectionInput,
  ) => Promise<z.infer<typeof StoryKnowledgeProjectionResultSchema>>;
};
