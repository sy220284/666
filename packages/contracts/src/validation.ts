import { z } from 'zod';

import { DraftContentHashValueSchema, DraftEntityIdSchema } from './draft.js';
import { ErrorCodeSchema } from './error-codes.js';
import { ProjectIdSchema, TASK_PROTOCOL_VERSION } from './task-protocol.js';

export const VALIDATION_IPC_CHANNELS = {
  list: 'worldforge:validation:list',
  runRules: 'worldforge:validation:run-rules',
  updateIssue: 'worldforge:validation:update-issue',
  createTodoFromIssue: 'worldforge:validation:create-todo-from-issue',
  saveTodo: 'worldforge:validation:save-todo',
  addComment: 'worldforge:validation:add-comment',
  resolveComment: 'worldforge:validation:resolve-comment',
  reopenComment: 'worldforge:validation:reopen-comment',
  batchComments: 'worldforge:validation:batch-comments',
  rememberException: 'worldforge:validation:remember-exception',
  disableException: 'worldforge:validation:disable-exception',
} as const;

export const VALIDATION_COMMANDS = {
  list: 'validation.list',
  runRules: 'validation.runRules',
  updateIssue: 'validation.updateIssue',
  createTodoFromIssue: 'validation.createTodoFromIssue',
  saveTodo: 'validation.saveTodo',
  addComment: 'validation.addComment',
  resolveComment: 'validation.resolveComment',
  reopenComment: 'validation.reopenComment',
  batchComments: 'validation.batchComments',
  rememberException: 'validation.rememberException',
  disableException: 'validation.disableException',
} as const;

export const ValidationSourceSchema = z.enum(['rule', 'ai']);
export const ValidationSeveritySchema = z.enum(['high', 'medium', 'low', 'info']);
export const ValidationIssueStatusSchema = z.enum([
  'open',
  'resolved',
  'ignored',
  'muted',
  'false_positive',
]);
export const ValidationAnchorStateSchema = z.enum(['current', 'stale']);
const ValidationSemanticStateSchema = z.enum(['current', 'stale']);
export const ValidationRangeHintSchema = z
  .strictObject({
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
  })
  .refine((range) => range.end > range.start, {
    path: ['end'],
    message: 'Validation range end must follow its start.',
  });

export const ValidationAnchorSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: DraftEntityIdSchema.nullable(),
  versionId: DraftEntityIdSchema.nullable(),
  logicalBlockId: DraftEntityIdSchema.nullable(),
  expectedBlockHash: DraftContentHashValueSchema.nullable(),
  textQuote: z.string().max(2_000).nullable(),
  rangeHint: ValidationRangeHintSchema.nullable(),
  state: ValidationAnchorStateSchema,
});

export const ValidationBatchSchema = z.strictObject({
  batchId: DraftEntityIdSchema,
  projectId: ProjectIdSchema,
  chapterId: DraftEntityIdSchema,
  sourceVersionId: DraftEntityIdSchema,
  generationRunId: DraftEntityIdSchema.nullable(),
  source: ValidationSourceSchema,
  ruleVersion: z.string().min(1).max(120).nullable(),
  configVersion: z.string().min(1).max(120).nullable(),
  inputFingerprint: DraftContentHashValueSchema.nullable(),
  anchorFreshness: ValidationAnchorStateSchema.default('current'),
  semanticFreshness: ValidationSemanticStateSchema.default('current'),
  constraintHash: DraftContentHashValueSchema.nullable().default(null),
  promptId: z.string().min(1).max(120).nullable().default(null),
  promptVersion: z.number().int().positive().nullable().default(null),
  issueCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
});

export const ValidationIssueSchema = z.strictObject({
  issueId: DraftEntityIdSchema,
  batchId: DraftEntityIdSchema,
  projectId: ProjectIdSchema,
  issueType: z.string().trim().min(1).max(120),
  source: ValidationSourceSchema,
  severity: ValidationSeveritySchema,
  rationale: z.string().trim().min(1).max(8_000),
  evidenceIds: z.array(z.string().trim().min(1).max(240)).max(100),
  currentEvidenceIds: z.array(z.string().trim().min(1).max(240)).max(100).default([]),
  conflictEvidenceIds: z.array(z.string().trim().min(1).max(240)).max(100).default([]),
  suggestion: z.string().trim().min(1).max(8_000).nullable(),
  confidence: z.number().finite().min(0).max(1).nullable(),
  ruleId: z.string().min(1).max(120).nullable(),
  ruleVersion: z.string().min(1).max(120).nullable(),
  configVersion: z.string().min(1).max(120).nullable(),
  status: ValidationIssueStatusSchema,
  anchor: ValidationAnchorSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const ValidationExceptionTypeSchema = z.enum([
  'flashback',
  'dream',
  'illusion',
  'lie',
  'unreliable_narration',
  'hidden_identity',
  'special_rule',
  'time_loop',
  'double',
  'parallel_world',
  'intentional_exception',
  'custom',
]);
export const ValidationExceptionScopeSchema = z.enum([
  'issue',
  'chapter',
  'entity',
  'chapter_range',
  'project_rule',
]);
export const ValidationExceptionSchema = z.strictObject({
  exceptionId: DraftEntityIdSchema,
  projectId: ProjectIdSchema,
  exceptionType: ValidationExceptionTypeSchema,
  scopeType: ValidationExceptionScopeSchema,
  issueType: z.string().trim().min(1).max(120),
  validationIssueId: DraftEntityIdSchema.nullable(),
  chapterId: DraftEntityIdSchema.nullable(),
  entityId: DraftEntityIdSchema.nullable(),
  validFromChapterId: DraftEntityIdSchema.nullable(),
  validUntilChapterId: DraftEntityIdSchema.nullable(),
  projectRuleKey: z.string().trim().min(1).max(120).nullable(),
  notes: z.string().max(8_000),
  active: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const StoryTodoSchema = z.strictObject({
  todoId: DraftEntityIdSchema,
  projectId: ProjectIdSchema,
  chapterId: DraftEntityIdSchema.nullable(),
  sceneBeatId: DraftEntityIdSchema.nullable(),
  logicalBlockId: DraftEntityIdSchema.nullable(),
  validationIssueId: DraftEntityIdSchema.nullable(),
  title: z.string().trim().min(1).max(240),
  status: z.enum(['open', 'done']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});

export const StoryCommentSchema = z.strictObject({
  commentId: DraftEntityIdSchema,
  projectId: ProjectIdSchema,
  chapterId: DraftEntityIdSchema.nullable(),
  sourceVersionId: DraftEntityIdSchema.nullable(),
  logicalBlockId: DraftEntityIdSchema.nullable(),
  validationIssueId: DraftEntityIdSchema.nullable(),
  body: z.string().trim().min(1).max(8_000),
  tags: z.array(z.string().trim().min(1).max(24)).max(12).default([]),
  status: z.enum(['open', 'resolved']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
});

export const ValidationCatalogSchema = z.strictObject({
  projectId: ProjectIdSchema,
  batches: z.array(ValidationBatchSchema),
  issues: z.array(ValidationIssueSchema),
  todos: z.array(StoryTodoSchema),
  comments: z.array(StoryCommentSchema),
  exceptions: z.array(ValidationExceptionSchema).default([]),
});

export const ValidationListInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: DraftEntityIdSchema.nullable().default(null),
  includeClosed: z.boolean().default(true),
});
export const ValidationRunRulesInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  sourceVersionId: DraftEntityIdSchema,
});
export const ValidationIssueActionSchema = z.enum([
  'resolve',
  'ignore',
  'mute',
  'downgrade',
  'false_positive',
  'reopen',
]);
export const ValidationUpdateIssueInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  issueId: DraftEntityIdSchema,
  action: ValidationIssueActionSchema,
});
export const ValidationCreateTodoInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  issueId: DraftEntityIdSchema,
  title: z.string().trim().min(1).max(240).optional(),
});
export const StoryTodoSaveInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  todoId: DraftEntityIdSchema.nullable().default(null),
  chapterId: DraftEntityIdSchema.nullable().default(null),
  sceneBeatId: DraftEntityIdSchema.nullable().default(null),
  logicalBlockId: DraftEntityIdSchema.nullable().default(null),
  title: z.string().trim().min(1).max(240),
  status: z.enum(['open', 'done']).default('open'),
});
export const StoryCommentTagSchema = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .regex(/^[\p{Script=Han}A-Za-z0-9._-]+$/u);

export const StoryCommentAddInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  issueId: DraftEntityIdSchema.nullable().default(null),
  chapterId: DraftEntityIdSchema.nullable().default(null),
  sourceVersionId: DraftEntityIdSchema.nullable().default(null),
  logicalBlockId: DraftEntityIdSchema.nullable().default(null),
  body: z.string().trim().min(1).max(8_000),
});
export const StoryCommentResolveInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  commentId: DraftEntityIdSchema,
});
export const StoryCommentReopenInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  commentId: DraftEntityIdSchema,
});
export const StoryCommentBatchInputSchema = z
  .strictObject({
    projectId: ProjectIdSchema,
    commentIds: z.array(DraftEntityIdSchema).min(1).max(100),
    action: z.enum(['resolve', 'reopen', 'tag']),
    tags: z.array(StoryCommentTagSchema).max(12).default([]),
  })
  .superRefine((input, context) => {
    if (new Set(input.commentIds).size !== input.commentIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['commentIds'],
        message: 'Comment ids must be unique.',
      });
    }
    if (input.action === 'tag' && input.tags.length === 0) {
      context.addIssue({ code: 'custom', path: ['tags'], message: 'Tag action requires tags.' });
    }
  });
export const ValidationExceptionRememberInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  issueId: DraftEntityIdSchema,
  exceptionType: ValidationExceptionTypeSchema,
  scopeType: ValidationExceptionScopeSchema.default('issue'),
  entityId: DraftEntityIdSchema.nullable().default(null),
  validFromChapterId: DraftEntityIdSchema.nullable().default(null),
  validUntilChapterId: DraftEntityIdSchema.nullable().default(null),
  projectRuleKey: z.string().trim().min(1).max(120).nullable().default(null),
  notes: z.string().trim().max(8_000).default(''),
});
export const ValidationExceptionDisableInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  exceptionId: DraftEntityIdSchema,
});

const envelope = {
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: z.uuid(),
  sentAt: z.iso.datetime(),
};
const command = <Command extends string, Payload extends z.ZodType>(
  name: Command,
  payload: Payload,
) => z.strictObject({ ...envelope, command: z.literal(name), payload });

export const ValidationListCommandSchema = command(
  VALIDATION_COMMANDS.list,
  ValidationListInputSchema,
);
export const ValidationRunRulesCommandSchema = command(
  VALIDATION_COMMANDS.runRules,
  ValidationRunRulesInputSchema,
);
export const ValidationUpdateIssueCommandSchema = command(
  VALIDATION_COMMANDS.updateIssue,
  ValidationUpdateIssueInputSchema,
);
export const ValidationCreateTodoCommandSchema = command(
  VALIDATION_COMMANDS.createTodoFromIssue,
  ValidationCreateTodoInputSchema,
);
export const StoryTodoSaveCommandSchema = command(
  VALIDATION_COMMANDS.saveTodo,
  StoryTodoSaveInputSchema,
);
export const StoryCommentAddCommandSchema = command(
  VALIDATION_COMMANDS.addComment,
  StoryCommentAddInputSchema,
);
export const StoryCommentResolveCommandSchema = command(
  VALIDATION_COMMANDS.resolveComment,
  StoryCommentResolveInputSchema,
);
export const StoryCommentReopenCommandSchema = command(
  VALIDATION_COMMANDS.reopenComment,
  StoryCommentReopenInputSchema,
);
export const StoryCommentBatchCommandSchema = command(
  VALIDATION_COMMANDS.batchComments,
  StoryCommentBatchInputSchema,
);
export const ValidationExceptionRememberCommandSchema = command(
  VALIDATION_COMMANDS.rememberException,
  ValidationExceptionRememberInputSchema,
);
export const ValidationExceptionDisableCommandSchema = command(
  VALIDATION_COMMANDS.disableException,
  ValidationExceptionDisableInputSchema,
);

export const CoreValidationOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal(VALIDATION_COMMANDS.list),
    input: ValidationListInputSchema,
  }),
  z.strictObject({
    operation: z.literal(VALIDATION_COMMANDS.runRules),
    input: ValidationRunRulesInputSchema,
  }),
  z.strictObject({
    operation: z.literal(VALIDATION_COMMANDS.updateIssue),
    input: ValidationUpdateIssueInputSchema,
  }),
  z.strictObject({
    operation: z.literal(VALIDATION_COMMANDS.createTodoFromIssue),
    input: ValidationCreateTodoInputSchema,
  }),
  z.strictObject({
    operation: z.literal(VALIDATION_COMMANDS.saveTodo),
    input: StoryTodoSaveInputSchema,
  }),
  z.strictObject({
    operation: z.literal(VALIDATION_COMMANDS.addComment),
    input: StoryCommentAddInputSchema,
  }),
  z.strictObject({
    operation: z.literal(VALIDATION_COMMANDS.resolveComment),
    input: StoryCommentResolveInputSchema,
  }),
  z.strictObject({
    operation: z.literal(VALIDATION_COMMANDS.reopenComment),
    input: StoryCommentReopenInputSchema,
  }),
  z.strictObject({
    operation: z.literal(VALIDATION_COMMANDS.batchComments),
    input: StoryCommentBatchInputSchema,
  }),
  z.strictObject({
    operation: z.literal(VALIDATION_COMMANDS.rememberException),
    input: ValidationExceptionRememberInputSchema,
  }),
  z.strictObject({
    operation: z.literal(VALIDATION_COMMANDS.disableException),
    input: ValidationExceptionDisableInputSchema,
  }),
]);

const failure = z.strictObject({
  ok: z.literal(false),
  operation: z.enum(VALIDATION_COMMANDS),
  errorCode: ErrorCodeSchema,
});
const success = <Operation extends string>(operation: Operation) =>
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(operation),
    data: ValidationCatalogSchema,
  });
export const CoreValidationResultSchema = z.union([
  success(VALIDATION_COMMANDS.list),
  success(VALIDATION_COMMANDS.runRules),
  success(VALIDATION_COMMANDS.updateIssue),
  success(VALIDATION_COMMANDS.createTodoFromIssue),
  success(VALIDATION_COMMANDS.saveTodo),
  success(VALIDATION_COMMANDS.addComment),
  success(VALIDATION_COMMANDS.resolveComment),
  success(VALIDATION_COMMANDS.reopenComment),
  success(VALIDATION_COMMANDS.batchComments),
  success(VALIDATION_COMMANDS.rememberException),
  success(VALIDATION_COMMANDS.disableException),
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
export const ValidationCatalogResultSchema = z.union([
  z.strictObject({
    ok: z.literal(true),
    requestId: z.uuid(),
    data: ValidationCatalogSchema,
  }),
  commandFailure,
]);

export interface ValidationBridge {
  readonly list: (
    input: ValidationListInput,
  ) => Promise<z.infer<typeof ValidationCatalogResultSchema>>;
  readonly runRules: (
    input: ValidationRunRulesInput,
  ) => Promise<z.infer<typeof ValidationCatalogResultSchema>>;
  readonly updateIssue: (
    input: ValidationUpdateIssueInput,
  ) => Promise<z.infer<typeof ValidationCatalogResultSchema>>;
  readonly createTodoFromIssue: (
    input: ValidationCreateTodoInput,
  ) => Promise<z.infer<typeof ValidationCatalogResultSchema>>;
  readonly saveTodo: (
    input: StoryTodoSaveInput,
  ) => Promise<z.infer<typeof ValidationCatalogResultSchema>>;
  readonly addComment: (
    input: StoryCommentAddInput,
  ) => Promise<z.infer<typeof ValidationCatalogResultSchema>>;
  readonly resolveComment: (
    input: StoryCommentResolveInput,
  ) => Promise<z.infer<typeof ValidationCatalogResultSchema>>;
  readonly reopenComment: (
    input: StoryCommentReopenInput,
  ) => Promise<z.infer<typeof ValidationCatalogResultSchema>>;
  readonly batchComments: (
    input: StoryCommentBatchInput,
  ) => Promise<z.infer<typeof ValidationCatalogResultSchema>>;
  readonly rememberException: (
    input: ValidationExceptionRememberInput,
  ) => Promise<z.infer<typeof ValidationCatalogResultSchema>>;
  readonly disableException: (
    input: ValidationExceptionDisableInput,
  ) => Promise<z.infer<typeof ValidationCatalogResultSchema>>;
}

export type ValidationBatch = z.infer<typeof ValidationBatchSchema>;
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;
export type ValidationException = z.infer<typeof ValidationExceptionSchema>;
export type ValidationCatalog = z.infer<typeof ValidationCatalogSchema>;
export type ValidationListInput = z.input<typeof ValidationListInputSchema>;
export type ValidationRunRulesInput = z.infer<typeof ValidationRunRulesInputSchema>;
export type ValidationUpdateIssueInput = z.infer<typeof ValidationUpdateIssueInputSchema>;
export type ValidationCreateTodoInput = z.infer<typeof ValidationCreateTodoInputSchema>;
export type StoryTodoSaveInput = z.input<typeof StoryTodoSaveInputSchema>;
export type StoryCommentAddInput = z.input<typeof StoryCommentAddInputSchema>;
export type StoryCommentResolveInput = z.infer<typeof StoryCommentResolveInputSchema>;
export type StoryCommentReopenInput = z.infer<typeof StoryCommentReopenInputSchema>;
export type StoryCommentBatchInput = z.input<typeof StoryCommentBatchInputSchema>;
export type StoryCommentTag = z.infer<typeof StoryCommentTagSchema>;
export type ValidationExceptionRememberInput = z.input<
  typeof ValidationExceptionRememberInputSchema
>;
export type ValidationExceptionDisableInput = z.infer<typeof ValidationExceptionDisableInputSchema>;
