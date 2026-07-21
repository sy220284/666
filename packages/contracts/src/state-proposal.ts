import { z } from 'zod';

import { CanonAuthoritySchema } from './entity-canon.js';
import { ErrorCodeSchema } from './error-codes.js';
import { EvidenceAnchorSchema, EntityStateKeySchema } from './continuity.js';
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

export const STATE_PROPOSAL_VALID_UNTIL_EVIDENCE_NOTE =
  'worldforge:state-valid-until-exclusive' as const;

export const StateProposalTypeSchema = z.enum(['entity_state', 'arc_milestone']);
export const StateProposalStatusSchema = z.enum(['pending', 'accepted', 'edited', 'rejected']);
export const StateProposalSourceSchema = z.enum(['rule', 'provider_stub']);
export const StateProposalDecisionSchema = z.enum(['accept', 'edit_accept', 'reject']);
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
]);
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

function validityEvidence(
  evidence: readonly z.infer<typeof EvidenceAnchorSchema>[],
): readonly z.infer<typeof EvidenceAnchorSchema>[] {
  return evidence.filter(
    (anchor) =>
      anchor.kind === 'chapter' && anchor.note === STATE_PROPOSAL_VALID_UNTIL_EVIDENCE_NOTE,
  );
}

export const EntityStateProposalDraftSchema = z
  .strictObject({
    proposalType: z.literal('entity_state'),
    entityId: z.uuid(),
    stateKey: EntityStateKeySchema,
    proposedValue: z.json(),
    validUntilChapterId: z.uuid().nullable().default(null),
    ...proposalBase,
  })
  .superRefine((value, context) => {
    const markers = validityEvidence(value.evidence);
    if (markers.length > 1) {
      context.addIssue({
        code: 'custom',
        path: ['evidence'],
        message: 'EntityState proposal validity evidence must be unique.',
      });
      return;
    }
    if (value.validUntilChapterId === null && markers.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['evidence'],
        message: 'Validity evidence requires validUntilChapterId.',
      });
      return;
    }
    if (
      value.validUntilChapterId !== null &&
      markers.length === 1 &&
      markers[0]?.targetId !== value.validUntilChapterId
    ) {
      context.addIssue({
        code: 'custom',
        path: ['evidence'],
        message: 'Validity evidence must match validUntilChapterId.',
      });
    }
    if (
      value.validUntilChapterId !== null &&
      markers.length === 0 &&
      value.evidence.length >= 100
    ) {
      context.addIssue({
        code: 'custom',
        path: ['evidence'],
        message: 'Validity evidence would exceed the proposal evidence limit.',
      });
    }
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

export const StateProposalDraftSchema = z.discriminatedUnion('proposalType', [
  EntityStateProposalDraftSchema,
  ArcMilestoneProposalDraftSchema,
]);

const StateProposalRecordSchema = z
  .strictObject({
    id: z.uuid(),
    projectId: ProjectIdSchema,
    chapterId: z.uuid(),
    sourceVersionId: z.uuid(),
    proposalType: StateProposalTypeSchema,
    source: StateProposalSourceSchema,
    entityId: z.uuid().nullable(),
    stateKey: EntityStateKeySchema.nullable(),
    arcMilestoneId: z.uuid().nullable(),
    previousValue: z.json().nullable(),
    proposedValue: z.json(),
    evidence: z.array(EvidenceAnchorSchema).min(1).max(100),
    confidence: z.number().finite().min(0).max(1),
    status: StateProposalStatusSchema,
    resolvedValue: z.json().nullable(),
    validUntilChapterId: z.uuid().nullable().optional(),
    createdAt: z.iso.datetime(),
    resolvedAt: z.iso.datetime().nullable(),
  })
  .superRefine((value, context) => {
    const markers = validityEvidence(value.evidence);
    if (markers.length > 1) {
      context.addIssue({
        code: 'custom',
        path: ['evidence'],
        message: 'Persisted StateProposal validity evidence must be unique.',
      });
      return;
    }
    const derived = value.proposalType === 'entity_state' ? (markers[0]?.targetId ?? null) : null;
    if (value.validUntilChapterId !== undefined && value.validUntilChapterId !== derived) {
      context.addIssue({
        code: 'custom',
        path: ['validUntilChapterId'],
        message: 'Persisted StateProposal validity does not match its evidence.',
      });
    }
  });

export const StateProposalSchema = StateProposalRecordSchema.transform((value) => {
  const marker = validityEvidence(value.evidence)[0];
  const { validUntilChapterId: _providedValidity, ...proposal } = value;
  return {
    ...proposal,
    validUntilChapterId:
      value.proposalType === 'entity_state' ? (marker?.targetId ?? null) : null,
  };
});

export const EndingSnapshotContentSchema = z.strictObject({
  entityStates: z.array(
    z.strictObject({
      entityId: z.uuid(),
      stateKey: EntityStateKeySchema,
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
  staleReasons: z.array(DerivedChangeTypeSchema).max(20),
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
  proposals: z.array(StateProposalSchema),
  snapshots: z.array(EndingSnapshotSchema),
  invalidations: z.array(DerivedInvalidationSchema),
});

export const StateProposalListInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: z.uuid().nullable().default(null),
  includeResolved: z.boolean().default(true),
});

const StateProposalGenerateInputBaseSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: z.uuid(),
  sourceVersionId: z.uuid(),
  source: StateProposalSourceSchema,
  proposals: z.array(StateProposalDraftSchema).max(200),
});

export const StateProposalGenerateInputSchema = StateProposalGenerateInputBaseSchema.transform(
  (value) => ({
    ...value,
    proposals: value.proposals.map((proposal) => {
      if (proposal.proposalType !== 'entity_state' || proposal.validUntilChapterId === null) {
        return proposal;
      }
      if (validityEvidence(proposal.evidence).length > 0) return proposal;
      return {
        ...proposal,
        evidence: [
          ...proposal.evidence,
          {
            kind: 'chapter' as const,
            targetId: proposal.validUntilChapterId,
            note: STATE_PROPOSAL_VALID_UNTIL_EVIDENCE_NOTE,
          },
        ],
      };
    }),
  }),
);

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
