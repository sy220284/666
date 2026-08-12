import { z } from 'zod';

import { DraftEntityIdSchema } from './draft.js';
import { ProjectIdSchema } from './task-protocol.js';

export const GenerationScopeTypeSchema = z.enum([
  'project',
  'volume',
  'chapter',
  'scene',
  'entity',
  'selection',
]);

export const GenerationScopeSchema = z
  .strictObject({
    projectId: ProjectIdSchema,
    scopeType: GenerationScopeTypeSchema,
    scopeId: DraftEntityIdSchema,
    chapterId: DraftEntityIdSchema.nullable().default(null),
  })
  .superRefine((scope, context) => {
    if (scope.scopeType === 'project' && scope.scopeId !== scope.projectId) {
      context.addIssue({
        code: 'custom',
        path: ['scopeId'],
        message: 'Project generation scope must use the projectId as scopeId.',
      });
    }
    if (scope.scopeType === 'chapter' && scope.chapterId !== scope.scopeId) {
      context.addIssue({
        code: 'custom',
        path: ['chapterId'],
        message: 'Chapter generation scope must use the same chapterId and scopeId.',
      });
    }
  });

export type GenerationScopeType = z.infer<typeof GenerationScopeTypeSchema>;
export type GenerationScope = z.infer<typeof GenerationScopeSchema>;
