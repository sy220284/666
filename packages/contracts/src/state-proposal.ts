import { z } from 'zod';

import {
  CanonAuthoritySchema,
  CanonFactDescriptionSchema,
  CanonFactKeySchema,
  EntityAliasesSchema,
  EntityNameSchema,
  EntitySummarySchema,
  EntityTypeSchema,
} from './entity-canon.js';
import { ErrorCodeSchema } from './error-codes.js';
import {
  CharacterRelationshipCategorySchema,
  ContinuityKeySchema,
  EvidenceAnchorSchema,
  EntityStateSemanticKindSchema,
  EntityStateKeySchema,
  KnowledgeStatusSchema,
  TimelinePrecisionSchema,
} from './continuity.js';
import { ForeshadowingStatusSchema } from './narrative-planning.js';
import { ProjectIdSchema, TASK_PROTOCOL_VERSION } from './task-protocol.js';

export const STATE_PROPOSAL_IPC_CHANNELS = {
  list: 'worldforge:state-proposal:list',
  generate: 'worldforge:state-proposal:generate',
  resolve: 'worldforge:state-proposal:resolve',
  refreshSnapshot: 'worldforge:state-proposal:refresh-snapshot',
  readSnapshot: 'worldforge:state-proposal:read-snapshot',
  invalidateDerived: 'worldforge:state-proposal:invalidate-derived',
} as const;

export const STATE_PROPOSAL_COMMANDS = {
  list: 'stateProposal.list',
  generate: 'stateProposal.generate',
  resolve: 'stateProposal.resolve',
  refreshSnapshot: 'stateProposal.refreshSnapshot',
  readSnapshot: 'stateProposal.readSnapshot',
  invalidateDerived: 'stateProposal.invalidateDerived',
} as const;

export const StateProposalTypeSchema = z.enum([
  'entity_state',
  'knowledge_state',
  'timeline_event',
  'character_relationship',
  'foreshadowing',
  'arc_milestone',
  'entity_create',
  'canon_fact',
]);
export const AIReviewProposalTypeSchema = StateProposalTypeSchema;
export const StateProposalStatusSchema = z.enum(['pending', 'accepted', 'edited', 'rejected']);
export const StateProposalSourceSchema = z.enum(['rule', 'provider_stub', 'provider']);
export const LegacyStateProposalSourceSchema = z.enum(['rule', 'provider_stub']);
export const StateProposalBatchStatusSchema = z.enum(['pending', 'resolved', 'rejected', 'mixed']);
export const StateProposalDecisionSchema = z.enum(['accept', 'edit_accept', 'reject']);
const StateProposalFreshnessSchema = z.enum(['current', 'stale']);
const StateProposalActionabilitySchema = z.enum(['accept', 'reject_only']);
export const ProposedArcMilestoneStatusSchema = z.enum(['hit', 'skipped']);
export const ArcMilestoneResolutionValueSchema = z
  .strictObject({
    status: ProposedArcMilestoneStatusSchema,
    actualChapterId: z.uuid().nullable(),
  })
  .superRefine((value, context) => {
    if (value.status === 'hit' && value.actualChapterId === null) {
      context.addIssue({
        code: 'custom',
        path: ['actualChapterId'],
        message: 'A hit milestone requires an actual chapter.',
      });
    }
  });
export const EndingSnapshotStatusSchema = z.enum(['valid', 'stale']);
export const SnapshotSourceSchema = z.enum(['snapshot', 'fallback_live_query']);
export const DerivedChangeTypeSchema = z.enum([
  'prose',
  'entity_state',
  'arc_milestone',
  'event',
  'timeline',
  'foreshadowing',
  'knowledge',
  'relationship',
  'canon',
]);
const EndingSnapshotStaleReasonSchema = z.union([DerivedChangeTypeSchema, z.literal('validation')]);
export const DerivedInvalidationScopeSchema = z.enum([
  'continuity',
  'arc',
  'timeline',
  'foreshadowing',
  'validation',
  'cache',
]);

const proposalBase = {
  evidence: z.array(EvidenceAnchorSchema).min(1).max(100),
  confidence: z.number().finite().min(0).max(1),
};

export const EntityStateProposalValueSchema = z.strictObject({
  value: z.json(),
  semanticKind: EntityStateSemanticKindSchema.default('custom'),
  validUntilChapterId: z.uuid().nullable().default(null),
});

export const EntityStateProposalDraftSchema = z.strictObject({
  proposalType: z.literal('entity_state'),
  entityId: z.uuid(),
  stateKey: EntityStateKeySchema,
  semanticKind: EntityStateSemanticKindSchema.default('custom'),
  proposedValue: z.json(),
  validUntilChapterId: z.uuid().nullable().default(null),
  ...proposalBase,
});

export const ArcMilestoneProposalDraftSchema = z
  .strictObject({
    proposalType: z.literal('arc_milestone'),
    arcMilestoneId: z.uuid(),
    proposedStatus: ProposedArcMilestoneStatusSchema,
    actualChapterId: z.uuid().nullable().default(null),
    ...proposalBase,
  })
  .superRefine((value, context) => {
    if (value.proposedStatus === 'hit' && value.actualChapterId === null) {
      context.addIssue({
        code: 'custom',
        path: ['actualChapterId'],
        message: 'A hit milestone proposal requires an actual chapter.',
      });
    }
  });

export const KnowledgeStateProposalValueSchema = z.strictObject({
  knowledgeStatus: KnowledgeStatusSchema,
  validUntilChapterId: z.uuid().nullable().default(null),
  notes: z.string().trim().max(20_000).default(''),
});
export const KnowledgeStateProposalDraftSchema = z.strictObject({
  proposalType: z.literal('knowledge_state'),
  characterId: z.uuid(),
  informationKey: ContinuityKeySchema,
  proposedKnowledge: KnowledgeStateProposalValueSchema,
  ...proposalBase,
});

export const TimelineEventProposalValueSchema = z.strictObject({
  eventId: z.uuid().nullable().default(null),
  title: z.string().trim().min(1).max(240),
  startValue: z.string().trim().min(1).max(120),
  endValue: z.string().trim().min(1).max(120).nullable().default(null),
  precision: TimelinePrecisionSchema,
  locationId: z.uuid().nullable().default(null),
  description: z.string().trim().max(20_000).default(''),
  participantIds: z.array(z.uuid()).max(200).default([]),
  witnessIds: z.array(z.uuid()).max(200).default([]),
  subjectIds: z.array(z.uuid()).max(200).default([]),
  dependencyIds: z.array(z.uuid()).max(200).default([]),
});
export const TimelineEventProposalDraftSchema = z.strictObject({
  proposalType: z.literal('timeline_event'),
  proposedEvent: TimelineEventProposalValueSchema,
  ...proposalBase,
});

export const CharacterRelationshipProposalValueSchema = z.strictObject({
  category: CharacterRelationshipCategorySchema,
  label: z.string().trim().min(1).max(120),
  validUntilChapterId: z.uuid().nullable().default(null),
});
export const CharacterRelationshipProposalDraftSchema = z
  .strictObject({
    proposalType: z.literal('character_relationship'),
    fromCharacterId: z.uuid(),
    toCharacterId: z.uuid(),
    proposedRelationship: CharacterRelationshipProposalValueSchema,
    ...proposalBase,
  })
  .refine((value) => value.fromCharacterId !== value.toCharacterId, {
    path: ['toCharacterId'],
    message: 'A CharacterRelationship requires two different Characters.',
  });

export const ForeshadowingProposalValueSchema = z.strictObject({
  foreshadowingId: z.uuid(),
  status: ForeshadowingStatusSchema,
});
export const ForeshadowingProposalDraftSchema = z.strictObject({
  proposalType: z.literal('foreshadowing'),
  proposedForeshadowing: ForeshadowingProposalValueSchema,
  ...proposalBase,
});

export const EntityCreateProposalValueSchema = z.strictObject({
  entityType: EntityTypeSchema,
  name: EntityNameSchema,
  aliases: EntityAliasesSchema.default([]),
  summary: EntitySummarySchema.default(''),
});
export const EntityCreateProposalDraftSchema = z.strictObject({
  proposalType: z.literal('entity_create'),
  proposedEntity: EntityCreateProposalValueSchema,
  ...proposalBase,
});

export const CanonFactProposalValueSchema = z.strictObject({
  value: z.json(),
  description: CanonFactDescriptionSchema.default(''),
});
export const CanonFactProposalDraftSchema = z.strictObject({
  proposalType: z.literal('canon_fact'),
  entityId: z.uuid(),
  factKey: CanonFactKeySchema,
  proposedFact: CanonFactProposalValueSchema,
  ...proposalBase,
});

export const StateProposalDraftSchema = z.discriminatedUnion('proposalType', [
  EntityStateProposalDraftSchema,
  ArcMilestoneProposalDraftSchema,
  KnowledgeStateProposalDraftSchema,
  TimelineEventProposalDraftSchema,
  CharacterRelationshipProposalDraftSchema,
  ForeshadowingProposalDraftSchema,
  EntityCreateProposalDraftSchema,
  CanonFactProposalDraftSchema,
]);

export const StateProposalTargetSchema = z.discriminatedUnion('targetType', [
  z.strictObject({
    targetType: z.literal('entity_state'),
    entityId: z.uuid(),
    stateKey: EntityStateKeySchema,
  }),
  z.strictObject({
    targetType: z.literal('knowledge_state'),
    characterId: z.uuid(),
    informationKey: ContinuityKeySchema,
  }),
  z.strictObject({
    targetType: z.literal('timeline_event'),
    eventId: z.uuid().nullable(),
  }),
  z.strictObject({
    targetType: z.literal('character_relationship'),
    fromCharacterId: z.uuid(),
    toCharacterId: z.uuid(),
    category: CharacterRelationshipCategorySchema,
    label: z.string().trim().min(1).max(120),
  }),
  z.strictObject({
    targetType: z.literal('foreshadowing'),
    foreshadowingId: z.uuid(),
  }),
  z.strictObject({
    targetType: z.literal('arc_milestone'),
    arcMilestoneId: z.uuid(),
  }),
  z.strictObject({
    targetType: z.literal('entity_create'),
    entityType: EntityTypeSchema,
    name: EntityNameSchema,
  }),
  z.strictObject({
    targetType: z.literal('canon_fact'),
    entityId: z.uuid(),
    factKey: CanonFactKeySchema,
  }),
]);

export const StateProposalSchema = z
  .strictObject({
    id: z.uuid(),
    batchId: z.uuid(),
    generationRunId: z.uuid().nullable(),
    projectId: ProjectIdSchema,
    chapterId: z.uuid(),
    sourceVersionId: z.uuid(),
    proposalType: StateProposalTypeSchema,
    source: StateProposalSourceSchema,
    target: StateProposalTargetSchema,
    previousValue: z.json().nullable(),
    proposedValue: z.json(),
    evidence: z.array(EvidenceAnchorSchema).min(1).max(100),
    confidence: z.number().finite().min(0).max(1),
    status: StateProposalStatusSchema,
    freshness: StateProposalFreshnessSchema.default('current'),
    actionability: StateProposalActionabilitySchema.default('accept'),
    resolvedValue: z.json().nullable(),
    createdAt: z.iso.datetime(),
    resolvedAt: z.iso.datetime().nullable(),
  })
  .superRefine((proposal, context) => {
    if (proposal.proposalType !== proposal.target.targetType) {
      context.addIssue({
        code: 'custom',
        path: ['target'],
        message: 'StateProposal target must match its proposal type.',
      });
    }
    if (proposal.freshness === 'stale' && proposal.actionability !== 'reject_only') {
      context.addIssue({
        code: 'custom',
        path: ['actionability'],
        message: 'A stale StateProposal may only remain rejectable.',
      });
    }
    if (proposal.source === 'provider' && proposal.generationRunId === null) {
      context.addIssue({
        code: 'custom',
        path: ['generationRunId'],
        message: 'Provider proposals require a GenerationRun.',
      });
    }
  });

export const StateProposalBatchSchema = z
  .strictObject({
    batchId: z.uuid(),
    projectId: ProjectIdSchema,
    chapterId: z.uuid(),
    sourceVersionId: z.uuid(),
    generationRunId: z.uuid().nullable(),
    source: StateProposalSourceSchema,
    proposalCount: z.number().int().nonnegative(),
    status: StateProposalBatchStatusSchema,
    createdAt: z.iso.datetime(),
  })
  .superRefine((batch, context) => {
    if ((batch.source === 'provider') !== (batch.generationRunId !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['generationRunId'],
        message: 'Only Provider batches require a GenerationRun.',
      });
    }
  });

export const EndingSnapshotContentSchema = z.strictObject({
  entityStates: z.array(
    z.strictObject({
      entityId: z.uuid(),
      stateKey: EntityStateKeySchema,
      semanticKind: EntityStateSemanticKindSchema.default('custom'),
      value: z.json(),
      sourceVersionId: z.uuid(),
    }),
  ),
  knowledgeStates: z.array(
    z.strictObject({
      characterId: z.uuid(),
      informationKey: z.string().trim().min(1).max(240),
      knowledgeStatus: z.enum(['knows', 'believes', 'suspects', 'misunderstands', 'unknown']),
    }),
  ),
  relationships: z
    .array(
      z.strictObject({
        id: z.uuid(),
        fromCharacterId: z.uuid(),
        toCharacterId: z.uuid(),
        category: CharacterRelationshipCategorySchema,
        label: z.string().trim().min(1).max(120),
        sourceVersionId: z.uuid(),
      }),
    )
    .default([]),
  foreshadowings: z.array(
    z.strictObject({
      id: z.uuid(),
      status: z.enum([
        'planned',
        'planted',
        'reinforced',
        'partially_revealed',
        'revealed',
        'cancelled',
      ]),
    }),
  ),
  arcMilestones: z.array(
    z.strictObject({
      id: z.uuid(),
      status: ProposedArcMilestoneStatusSchema,
      actualChapterId: z.uuid().nullable(),
    }),
  ),
});

export const EndingSnapshotSchema = z.strictObject({
  id: z.uuid(),
  projectId: ProjectIdSchema,
  chapterId: z.uuid(),
  sourceVersionId: z.uuid(),
  status: EndingSnapshotStatusSchema,
  content: EndingSnapshotContentSchema,
  staleReasons: z.array(EndingSnapshotStaleReasonSchema).max(20),
  createdAt: z.iso.datetime(),
  staleAt: z.iso.datetime().nullable(),
});

export const DerivedInvalidationSchema = z.strictObject({
  id: z.uuid(),
  projectId: ProjectIdSchema,
  sourceChapterId: z.uuid(),
  sourceVersionId: z.uuid(),
  targetChapterId: z.uuid().nullable(),
  scope: DerivedInvalidationScopeSchema,
  changeType: DerivedChangeTypeSchema.exclude(['prose']),
  createdAt: z.iso.datetime(),
});

export const StateProposalCatalogSchema = z.strictObject({
  projectId: ProjectIdSchema,
  batches: z.array(StateProposalBatchSchema).default([]),
  proposals: z.array(StateProposalSchema),
  snapshots: z.array(EndingSnapshotSchema),
  invalidations: z.array(DerivedInvalidationSchema),
});

export const StateProposalListInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: z.uuid().nullable().default(null),
  includeResolved: z.boolean().default(true),
});

export const StateProposalGenerateInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: z.uuid(),
  sourceVersionId: z.uuid(),
  source: LegacyStateProposalSourceSchema,
  proposals: z.array(StateProposalDraftSchema).max(200),
});

export const StateProposalResolutionSchema = z
  .strictObject({
    proposalId: z.uuid(),
    decision: StateProposalDecisionSchema,
    editedValue: z.json().optional(),
  })
  .superRefine((value, context) => {
    if (value.decision === 'edit_accept' && value.editedValue === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['editedValue'],
        message: 'Edited acceptance requires an edited value.',
      });
    }
    if (value.decision !== 'edit_accept' && value.editedValue !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['editedValue'],
        message: 'Only edited acceptance may provide an edited value.',
      });
    }
  });

export const StateProposalResolveInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  authority: CanonAuthoritySchema,
  resolutions: z.array(StateProposalResolutionSchema).min(1).max(200),
});

export const EndingSnapshotRefreshInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  authority: CanonAuthoritySchema,
  chapterId: z.uuid(),
  sourceVersionId: z.uuid(),
});

export const EndingSnapshotReadInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: z.uuid(),
});

export const EndingSnapshotReadResultSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: z.uuid(),
  snapshotSource: SnapshotSourceSchema,
  snapshot: EndingSnapshotSchema.nullable(),
  content: EndingSnapshotContentSchema,
});

export const DerivedInvalidationInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  authority: CanonAuthoritySchema,
  sourceChapterId: z.uuid(),
  sourceVersionId: z.uuid(),
  changeTypes: z.array(DerivedChangeTypeSchema).min(1).max(20),
});

export const DerivedInvalidationResultSchema = z.strictObject({
  invalidatedSnapshotIds: z.array(z.uuid()),
  queuedScopes: z.array(DerivedInvalidationScopeSchema),
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

export const StateProposalListCommandSchema = command(
  STATE_PROPOSAL_COMMANDS.list,
  StateProposalListInputSchema,
);
export const StateProposalGenerateCommandSchema = command(
  STATE_PROPOSAL_COMMANDS.generate,
  StateProposalGenerateInputSchema,
);
export const StateProposalResolveCommandSchema = command(
  STATE_PROPOSAL_COMMANDS.resolve,
  StateProposalResolveInputSchema,
);
export const EndingSnapshotRefreshCommandSchema = command(
  STATE_PROPOSAL_COMMANDS.refreshSnapshot,
  EndingSnapshotRefreshInputSchema,
);
export const EndingSnapshotReadCommandSchema = command(
  STATE_PROPOSAL_COMMANDS.readSnapshot,
  EndingSnapshotReadInputSchema,
);
export const DerivedInvalidationCommandSchema = command(
  STATE_PROPOSAL_COMMANDS.invalidateDerived,
  DerivedInvalidationInputSchema,
);

const failure = z.strictObject({
  ok: z.literal(false),
  operation: z.enum(STATE_PROPOSAL_COMMANDS),
  errorCode: ErrorCodeSchema,
});
const success = <Operation extends string, Data extends z.ZodType>(
  operation: Operation,
  data: Data,
) => z.strictObject({ ok: z.literal(true), operation: z.literal(operation), data });

export const CoreStateProposalOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal(STATE_PROPOSAL_COMMANDS.list),
    input: StateProposalListInputSchema,
  }),
  z.strictObject({
    operation: z.literal(STATE_PROPOSAL_COMMANDS.generate),
    input: StateProposalGenerateInputSchema,
  }),
  z.strictObject({
    operation: z.literal(STATE_PROPOSAL_COMMANDS.resolve),
    input: StateProposalResolveInputSchema,
  }),
  z.strictObject({
    operation: z.literal(STATE_PROPOSAL_COMMANDS.refreshSnapshot),
    input: EndingSnapshotRefreshInputSchema,
  }),
  z.strictObject({
    operation: z.literal(STATE_PROPOSAL_COMMANDS.readSnapshot),
    input: EndingSnapshotReadInputSchema,
  }),
  z.strictObject({
    operation: z.literal(STATE_PROPOSAL_COMMANDS.invalidateDerived),
    input: DerivedInvalidationInputSchema,
  }),
]);

export const CoreStateProposalResultSchema = z.union([
  success(STATE_PROPOSAL_COMMANDS.list, StateProposalCatalogSchema),
  success(STATE_PROPOSAL_COMMANDS.generate, StateProposalCatalogSchema),
  success(STATE_PROPOSAL_COMMANDS.resolve, StateProposalCatalogSchema),
  success(STATE_PROPOSAL_COMMANDS.refreshSnapshot, EndingSnapshotSchema),
  success(STATE_PROPOSAL_COMMANDS.readSnapshot, EndingSnapshotReadResultSchema),
  success(STATE_PROPOSAL_COMMANDS.invalidateDerived, DerivedInvalidationResultSchema),
  failure,
]);

export type StateProposal = z.infer<typeof StateProposalSchema>;
export type StateProposalDraft = z.infer<typeof StateProposalDraftSchema>;
export type StateProposalTarget = z.infer<typeof StateProposalTargetSchema>;
export type StateProposalBatch = z.infer<typeof StateProposalBatchSchema>;
export type StateProposalCatalog = z.infer<typeof StateProposalCatalogSchema>;
export type StateProposalGenerateInput = z.infer<typeof StateProposalGenerateInputSchema>;
export type StateProposalResolveInput = z.infer<typeof StateProposalResolveInputSchema>;
export type EndingSnapshot = z.infer<typeof EndingSnapshotSchema>;
export type EndingSnapshotContent = z.infer<typeof EndingSnapshotContentSchema>;
export type EndingSnapshotRefreshInput = z.infer<typeof EndingSnapshotRefreshInputSchema>;
export type EndingSnapshotReadInput = z.infer<typeof EndingSnapshotReadInputSchema>;
export type EndingSnapshotReadResult = z.infer<typeof EndingSnapshotReadResultSchema>;
export type DerivedInvalidationInput = z.infer<typeof DerivedInvalidationInputSchema>;
export type DerivedInvalidationResult = z.infer<typeof DerivedInvalidationResultSchema>;
