import { z } from 'zod';

import { ProjectIdSchema } from './task-protocol.js';

export const SearchSourceTypeSchema = z.enum(['draft', 'version', 'entity']);
export const SearchIndexStatusSchema = z.enum(['ready', 'stale', 'rebuilding']);
export const SearchStrategySchema = z.enum(['fts', 'authoritative-like', 'dictionary']);

export const SearchIndexStateSchema = z.strictObject({
  projectId: ProjectIdSchema,
  status: SearchIndexStatusSchema,
  pendingCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  lastIndexedAt: z.iso.datetime().nullable(),
  staleAt: z.iso.datetime().nullable(),
  lastErrorCode: z.string().min(1).max(128).nullable(),
  updatedAt: z.iso.datetime(),
});

export const SearchProjectInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  query: z.string().trim().min(1).max(500),
  sourceTypes: z.array(SearchSourceTypeSchema).min(1).max(3).optional(),
  includeArchived: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(50),
});

export const SearchResultItemSchema = z.strictObject({
  sourceType: SearchSourceTypeSchema,
  targetId: z.uuid(),
  anchorId: z.uuid().nullable(),
  chapterId: z.uuid().nullable(),
  title: z.string().max(500),
  excerpt: z.string().max(2_000),
  score: z.number().finite().nullable(),
});

export const SearchProjectResultSchema = z.strictObject({
  projectId: ProjectIdSchema,
  query: z.string().min(1).max(500),
  normalizedQuery: z.string().min(1).max(500),
  strategy: SearchStrategySchema,
  indexStatus: SearchIndexStatusSchema,
  items: z.array(SearchResultItemSchema),
});

export const SearchIndexProcessInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  limit: z.number().int().min(1).max(1_000).default(100),
});

export const SearchIndexProcessResultSchema = z.strictObject({
  projectId: ProjectIdSchema,
  processed: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  status: SearchIndexStatusSchema,
});

export const SearchIndexRebuildResultSchema = z.strictObject({
  projectId: ProjectIdSchema,
  draftCount: z.number().int().nonnegative(),
  versionCount: z.number().int().nonnegative(),
  entityCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  status: SearchIndexStatusSchema,
});

export const DictionaryCategorySchema = z.enum([
  'character',
  'location',
  'faction',
  'item',
  'ability',
  'rule',
  'event',
  'terminology',
  'custom',
]);
export const DictionaryActionSchema = z.enum(['canonical', 'alias', 'ignore', 'replace']);

export const ProjectDictionaryEntrySchema = z.strictObject({
  term: z.string().trim().min(1).max(240),
  normalizedTerm: z.string().min(1).max(240),
  category: DictionaryCategorySchema,
  action: DictionaryActionSchema,
  replacementTerm: z.string().trim().min(1).max(240).nullable(),
  notes: z.string().max(20_000),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const ProjectDictionaryListInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  category: DictionaryCategorySchema.optional(),
  action: DictionaryActionSchema.optional(),
});

export const ProjectDictionaryListSchema = z.strictObject({
  projectId: ProjectIdSchema,
  entries: z.array(ProjectDictionaryEntrySchema),
});

export const ProjectDictionaryUpsertInputSchema = z
  .strictObject({
    projectId: ProjectIdSchema,
    authority: z.enum(['author', 'ai']),
    term: z.string().trim().min(1).max(240),
    category: DictionaryCategorySchema,
    action: DictionaryActionSchema,
    replacementTerm: z.string().trim().min(1).max(240).nullable().optional(),
    notes: z.string().trim().max(20_000).default(''),
  })
  .superRefine((input, context) => {
    const needsReplacement = input.action === 'alias' || input.action === 'replace';
    if (needsReplacement && !input.replacementTerm) {
      context.addIssue({
        code: 'custom',
        path: ['replacementTerm'],
        message: 'Alias and replace entries require a replacement term.',
      });
    }
    if (!needsReplacement && input.replacementTerm) {
      context.addIssue({
        code: 'custom',
        path: ['replacementTerm'],
        message: 'Canonical and ignore entries cannot define a replacement term.',
      });
    }
  });

export const ProjectDictionaryDeleteInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  authority: z.enum(['author', 'ai']),
  term: z.string().trim().min(1).max(240),
});

export type SearchSourceType = z.infer<typeof SearchSourceTypeSchema>;
export type SearchIndexStatus = z.infer<typeof SearchIndexStatusSchema>;
export type SearchStrategy = z.infer<typeof SearchStrategySchema>;
export type SearchIndexState = z.infer<typeof SearchIndexStateSchema>;
export type SearchProjectInput = z.input<typeof SearchProjectInputSchema>;
export type SearchProjectResult = z.infer<typeof SearchProjectResultSchema>;
export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;
export type SearchIndexProcessInput = z.input<typeof SearchIndexProcessInputSchema>;
export type SearchIndexProcessResult = z.infer<typeof SearchIndexProcessResultSchema>;
export type SearchIndexRebuildResult = z.infer<typeof SearchIndexRebuildResultSchema>;
export type DictionaryCategory = z.infer<typeof DictionaryCategorySchema>;
export type DictionaryAction = z.infer<typeof DictionaryActionSchema>;
export type ProjectDictionaryEntry = z.infer<typeof ProjectDictionaryEntrySchema>;
export type ProjectDictionaryListInput = z.infer<typeof ProjectDictionaryListInputSchema>;
export type ProjectDictionaryList = z.infer<typeof ProjectDictionaryListSchema>;
export type ProjectDictionaryUpsertInput = z.input<typeof ProjectDictionaryUpsertInputSchema>;
export type ProjectDictionaryDeleteInput = z.infer<typeof ProjectDictionaryDeleteInputSchema>;
