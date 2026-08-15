import { z } from 'zod';

import { ErrorCodeSchema } from './error-codes.js';
import { CoreDraftOperationSchema, CoreDraftResultSchema } from './draft.js';
import { CoreVersionOperationSchema, CoreVersionResultSchema } from './version.js';
import { CoreRecoveryOperationSchema, CoreRecoveryResultSchema } from './recovery.js';
import { CoreTextIoOperationSchema, CoreTextIoResultSchema } from './import-export.js';
import { CoreCandidateOperationSchema, CoreCandidateResultSchema } from './candidate.js';
import {
  CoreCandidateApplyOperationSchema,
  CoreCandidateApplyResultSchema,
} from './candidate-apply.js';
import {
  CoreProjectStructureOperationSchema,
  CoreProjectStructureResultSchema,
} from './project-structure.js';
import {
  CoreProjectPlanningOperationSchema,
  CoreProjectPlanningResultSchema,
} from './project-planning.js';
import { CoreSceneBeatOperationSchema, CoreSceneBeatResultSchema } from './scene-beat.js';
import { CoreEntityCanonOperationSchema, CoreEntityCanonResultSchema } from './entity-canon.js';
import { CoreContinuityOperationSchema, CoreContinuityResultSchema } from './continuity.js';
import {
  CoreNarrativePlanningOperationSchema,
  CoreNarrativePlanningResultSchema,
} from './narrative-planning.js';
import {
  CoreStateProposalOperationSchema,
  CoreStateProposalResultSchema,
} from './state-proposal.js';
import { CoreValidationOperationSchema, CoreValidationResultSchema } from './validation.js';
import { CoreSearchToolsOperationSchema, CoreSearchToolsResultSchema } from './search-tools.js';
import { CoreRhythmOperationSchema, CoreRhythmResultSchema } from './rhythm.js';
import {
  CoreStoryKnowledgeOperationSchema,
  CoreStoryKnowledgeResultSchema,
} from './story-knowledge.js';
import { CoreIdeaOperationSchema, CoreIdeaResultSchema } from './idea-capsule.js';
import { CoreLongformAiOperationSchema, CoreLongformAiResultSchema } from './longform-ai.js';
import { CoreResearchOperationSchema, CoreResearchResultSchema } from './research.js';
import { CoreJournalOperationSchema, CoreJournalResultSchema } from './journal.js';
import { ProjectIdSchema, TASK_PROTOCOL_VERSION } from './task-protocol.js';

export const PROJECT_WORKSPACE_IPC_CHANNELS = {
  getActive: 'worldforge:project:get-active',
  getContinuation: 'worldforge:project:get-continuation',
  saveContinuation: 'worldforge:project:save-continuation',
  create: 'worldforge:project:create',
  openSelected: 'worldforge:project:open-selected',
  openRecent: 'worldforge:project:open-recent',
  close: 'worldforge:project:close',
  move: 'worldforge:project:move',
} as const;

export const PROJECT_WORKSPACE_COMMANDS = {
  getActive: 'project.getActive',
  getContinuation: 'project.getContinuation',
  saveContinuation: 'project.saveContinuation',
  create: 'project.create',
  openSelected: 'project.openSelected',
  openRecent: 'project.openRecent',
  close: 'project.close',
  move: 'project.move',
} as const;

export const ProjectNameSchema = z.string().trim().min(1).max(240);
export const ProjectChannelSchema = z.string().trim().min(1).max(120);

export const ProjectOnboardingContentSchema = z
  .strictObject({
    brief: z
      .strictObject({
        concept: z.string().trim().max(4_000),
        readingPromise: z.string().trim().max(4_000),
        protagonistGoal: z.string().trim().max(4_000),
        coreConflict: z.string().trim().max(4_000),
        endingIntent: z.string().trim().max(4_000),
        required: z.array(z.string().trim().min(1).max(500)).max(100),
        forbidden: z.array(z.string().trim().min(1).max(500)).max(100),
      })
      .nullable(),
    protagonist: z
      .strictObject({
        name: z.string().trim().min(1).max(240),
        identity: z.string().trim().max(500),
        goal: z.string().trim().max(4_000),
        boundary: z.string().trim().max(500),
      })
      .nullable(),
    firstChapter: z
      .strictObject({
        title: z.string().trim().min(1).max(240),
        targetWordMin: z.number().int().min(0).max(1_000_000).nullable(),
        targetWordMax: z.number().int().min(0).max(1_000_000).nullable(),
      })
      .nullable(),
    sceneGoals: z.array(z.string().trim().min(1).max(4_000)).max(20),
  })
  .superRefine((content, context) => {
    const minimum = content.firstChapter?.targetWordMin;
    const maximum = content.firstChapter?.targetWordMax;
    if (minimum !== null && minimum !== undefined && maximum !== null && maximum !== undefined) {
      if (minimum > maximum) {
        context.addIssue({
          code: 'custom',
          path: ['firstChapter', 'targetWordMin'],
          message: 'The first chapter minimum word target must not exceed the maximum.',
        });
      }
    }
  });

export const ProjectCreateInputSchema = z
  .strictObject({
    name: ProjectNameSchema,
    channel: ProjectChannelSchema,
    initialStructure: z.enum(['starter', 'blank']).optional(),
    onboarding: ProjectOnboardingContentSchema.optional(),
  })
  .superRefine((input, context) => {
    if (
      input.initialStructure === 'blank' &&
      input.onboarding &&
      (input.onboarding.firstChapter !== null || input.onboarding.sceneGoals.length > 0)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['onboarding'],
        message: 'Blank projects cannot contain first-chapter onboarding content.',
      });
    }
  });

export const ProjectWorkspaceManifestSchema = z.strictObject({
  format: z.literal('worldforge-project'),
  manifestVersion: z.literal(1),
  projectId: ProjectIdSchema,
  displayName: ProjectNameSchema,
  databaseFile: z.literal('project.sqlite'),
  projectSchemaVersion: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
});

export const ProjectDatabaseModeSchema = z.enum(['read-write', 'read-only']);
export const ProjectDatabaseCompatibilitySchema = z.enum([
  'current',
  'migrated',
  'migration-failed',
  'future-schema',
  'checksum-mismatch',
  'integrity-failed',
]);
export const ProjectReadOnlyReasonSchema = ProjectDatabaseCompatibilitySchema.nullable();

export const ProjectWorkspaceSummarySchema = z.strictObject({
  projectId: ProjectIdSchema,
  name: ProjectNameSchema,
  channel: ProjectChannelSchema,
  workspacePath: z.string().min(1).max(32_768),
  schemaVersion: z.number().int().nonnegative(),
  databaseMode: ProjectDatabaseModeSchema,
  compatibility: ProjectDatabaseCompatibilitySchema,
  readOnlyReason: ProjectReadOnlyReasonSchema,
  createdAt: z.iso.datetime(),
});

export const ProjectMoveResultSchema = ProjectWorkspaceSummarySchema.extend({
  sourceRetained: z.boolean(),
}).strict();

export const ProjectCloseResultSchema = z.strictObject({
  projectId: ProjectIdSchema,
  closed: z.literal(true),
});

export const ProjectContinuationPanelSchema = z.enum(['editor', 'versions', 'candidates']);
export const ProjectContinuationInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: z.uuid(),
  draftId: z.uuid(),
  draftRevision: z.number().int().nonnegative(),
  logicalBlockId: z.uuid(),
  expectedBlockHash: z.string().regex(/^[0-9a-f]{64}$/u),
  cursorOffset: z.number().int().nonnegative().max(2_000_000),
  scrollTop: z.number().int().nonnegative().max(50_000_000),
  panel: ProjectContinuationPanelSchema,
});

const continuationSnapshotFields = {
  projectId: ProjectIdSchema,
  chapterId: z.uuid(),
  chapterTitle: z.string().trim().min(1).max(240).nullable(),
  draftId: z.uuid(),
  draftRevision: z.number().int().nonnegative(),
  logicalBlockId: z.uuid(),
  expectedBlockHash: z.string().regex(/^[0-9a-f]{64}$/u),
  cursorOffset: z.number().int().nonnegative().max(2_000_000),
  scrollTop: z.number().int().nonnegative().max(50_000_000),
  panel: ProjectContinuationPanelSchema,
  updatedAt: z.iso.datetime(),
} as const;

export const ProjectContinuationSnapshotSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('ready'),
    ...continuationSnapshotFields,
    chapterTitle: z.string().trim().min(1).max(240),
  }),
  z.strictObject({
    status: z.literal('stale'),
    ...continuationSnapshotFields,
    reason: z.enum(['chapter-missing', 'draft-changed', 'block-changed', 'cursor-out-of-range']),
  }),
]);

const commandEnvelope = {
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: z.uuid(),
  sentAt: z.iso.datetime(),
};

export const ProjectGetActiveCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_WORKSPACE_COMMANDS.getActive),
  payload: z.strictObject({}),
});
export const ProjectGetContinuationCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_WORKSPACE_COMMANDS.getContinuation),
  payload: z.strictObject({ projectId: ProjectIdSchema }),
});
export const ProjectSaveContinuationCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_WORKSPACE_COMMANDS.saveContinuation),
  payload: ProjectContinuationInputSchema,
});
export const ProjectCreateCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_WORKSPACE_COMMANDS.create),
  payload: ProjectCreateInputSchema,
});
export const ProjectOpenSelectedCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_WORKSPACE_COMMANDS.openSelected),
  payload: z.strictObject({}),
});
export const ProjectOpenRecentCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_WORKSPACE_COMMANDS.openRecent),
  payload: z.strictObject({ projectId: ProjectIdSchema }),
});
export const ProjectCloseCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_WORKSPACE_COMMANDS.close),
  payload: z.strictObject({ projectId: ProjectIdSchema }),
});
export const ProjectMoveCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_WORKSPACE_COMMANDS.move),
  payload: z.strictObject({ projectId: ProjectIdSchema }),
});

const projectFailureSchema = z.strictObject({
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

function projectResultSchema<DataSchema extends z.ZodType>(data: DataSchema) {
  return z.union([
    z.strictObject({ ok: z.literal(true), requestId: z.uuid(), data }),
    projectFailureSchema,
  ]);
}

export const ProjectActiveResultSchema = projectResultSchema(
  ProjectWorkspaceSummarySchema.nullable(),
);
export const ProjectContinuationResultSchema = projectResultSchema(
  ProjectContinuationSnapshotSchema.nullable(),
);
export const ProjectContinuationSaveResultSchema = projectResultSchema(
  ProjectContinuationSnapshotSchema,
);
export const ProjectWorkspaceResultSchema = projectResultSchema(ProjectWorkspaceSummarySchema);
export const ProjectMoveCommandResultSchema = projectResultSchema(ProjectMoveResultSchema);
export const ProjectCloseCommandResultSchema = projectResultSchema(ProjectCloseResultSchema);

const CoreProjectWorkspaceOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal(PROJECT_WORKSPACE_COMMANDS.getActive) }),
  z.strictObject({
    operation: z.literal(PROJECT_WORKSPACE_COMMANDS.getContinuation),
    projectId: ProjectIdSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_WORKSPACE_COMMANDS.saveContinuation),
    input: ProjectContinuationInputSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_WORKSPACE_COMMANDS.create),
    input: ProjectCreateInputSchema,
    parentDirectory: z.string().min(1).max(32_768),
  }),
  z.strictObject({
    operation: z.literal(PROJECT_WORKSPACE_COMMANDS.openSelected),
    workspacePath: z.string().min(1).max(32_768),
  }),
  z.strictObject({
    operation: z.literal(PROJECT_WORKSPACE_COMMANDS.openRecent),
    projectId: ProjectIdSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_WORKSPACE_COMMANDS.close),
    projectId: ProjectIdSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_WORKSPACE_COMMANDS.move),
    projectId: ProjectIdSchema,
    targetParentDirectory: z.string().min(1).max(32_768),
  }),
]);

export const CoreProjectOperationSchema = z.union([
  CoreProjectWorkspaceOperationSchema,
  CoreProjectStructureOperationSchema,
  CoreProjectPlanningOperationSchema,
  CoreSceneBeatOperationSchema,
  CoreEntityCanonOperationSchema,
  CoreContinuityOperationSchema,
  CoreNarrativePlanningOperationSchema,
  CoreStateProposalOperationSchema,
  CoreValidationOperationSchema,
  CoreSearchToolsOperationSchema,
  CoreRhythmOperationSchema,
  CoreStoryKnowledgeOperationSchema,
  CoreIdeaOperationSchema,
  CoreLongformAiOperationSchema,
  CoreResearchOperationSchema,
  CoreJournalOperationSchema,
  CoreDraftOperationSchema,
  CoreCandidateOperationSchema,
  CoreCandidateApplyOperationSchema,
  CoreVersionOperationSchema,
  CoreRecoveryOperationSchema,
  CoreTextIoOperationSchema,
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

const CoreProjectWorkspaceResultSchema = z.union([
  coreSuccess(PROJECT_WORKSPACE_COMMANDS.getActive, ProjectWorkspaceSummarySchema.nullable()),
  coreSuccess(
    PROJECT_WORKSPACE_COMMANDS.getContinuation,
    ProjectContinuationSnapshotSchema.nullable(),
  ),
  coreSuccess(PROJECT_WORKSPACE_COMMANDS.saveContinuation, ProjectContinuationSnapshotSchema),
  coreSuccess(PROJECT_WORKSPACE_COMMANDS.create, ProjectWorkspaceSummarySchema),
  coreSuccess(PROJECT_WORKSPACE_COMMANDS.openSelected, ProjectWorkspaceSummarySchema),
  coreSuccess(PROJECT_WORKSPACE_COMMANDS.openRecent, ProjectWorkspaceSummarySchema),
  coreSuccess(PROJECT_WORKSPACE_COMMANDS.close, ProjectCloseResultSchema),
  coreSuccess(PROJECT_WORKSPACE_COMMANDS.move, ProjectMoveResultSchema),
  z.strictObject({
    ok: z.literal(false),
    operation: z.enum(PROJECT_WORKSPACE_COMMANDS),
    errorCode: ErrorCodeSchema,
  }),
]);

export const CoreProjectResultSchema = z.union([
  CoreProjectWorkspaceResultSchema,
  CoreProjectStructureResultSchema,
  CoreProjectPlanningResultSchema,
  CoreSceneBeatResultSchema,
  CoreEntityCanonResultSchema,
  CoreContinuityResultSchema,
  CoreNarrativePlanningResultSchema,
  CoreStateProposalResultSchema,
  CoreValidationResultSchema,
  CoreSearchToolsResultSchema,
  CoreRhythmResultSchema,
  CoreStoryKnowledgeResultSchema,
  CoreIdeaResultSchema,
  CoreLongformAiResultSchema,
  CoreResearchResultSchema,
  CoreJournalResultSchema,
  CoreDraftResultSchema,
  CoreCandidateResultSchema,
  CoreCandidateApplyResultSchema,
  CoreVersionResultSchema,
  CoreRecoveryResultSchema,
  CoreTextIoResultSchema,
]);

export type ProjectCreateInput = z.infer<typeof ProjectCreateInputSchema>;
export type ProjectWorkspaceManifest = z.infer<typeof ProjectWorkspaceManifestSchema>;
export type ProjectWorkspaceSummary = z.infer<typeof ProjectWorkspaceSummarySchema>;
export type ProjectMoveResult = z.infer<typeof ProjectMoveResultSchema>;
export type ProjectCloseResult = z.infer<typeof ProjectCloseResultSchema>;
export type ProjectContinuationPanel = z.infer<typeof ProjectContinuationPanelSchema>;
export type ProjectContinuationInput = z.infer<typeof ProjectContinuationInputSchema>;
export type ProjectContinuationSnapshot = z.infer<typeof ProjectContinuationSnapshotSchema>;
export type CoreProjectOperation = z.infer<typeof CoreProjectOperationSchema>;
export type CoreProjectResult = z.infer<typeof CoreProjectResultSchema>;
