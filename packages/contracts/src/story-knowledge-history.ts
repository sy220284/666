import { z } from 'zod';

import {
  CandidateCompletenessSchema,
  CandidateStatusSchema,
  CandidateTypeSchema,
} from './candidate.js';
import { BackupFailureRecordSchema, BackupRecordSchema } from './recovery.js';

export const StoryKnowledgeHistoryCandidateSchema = z.strictObject({
  candidateId: z.uuid(),
  title: z.string().trim().min(1).max(240),
  candidateType: CandidateTypeSchema,
  completeness: CandidateCompletenessSchema,
  status: CandidateStatusSchema,
  generationRunId: z.uuid().nullable(),
  sourceVersionId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
});

export const StoryKnowledgeHistoryRecoverySchema = z.strictObject({
  checkpoints: z.array(BackupRecordSchema).max(100),
  checkpointsTruncated: z.boolean(),
  backupFailures: z.array(BackupFailureRecordSchema).max(100),
  backupFailuresTruncated: z.boolean(),
});

export const storyKnowledgeHistoryMetadataShape = {
  candidates: z.array(StoryKnowledgeHistoryCandidateSchema).max(100),
  candidatesTruncated: z.boolean(),
  recovery: StoryKnowledgeHistoryRecoverySchema,
};
