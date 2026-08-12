import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  GenerationScopeTypeSchema,
  IdeaSourceContextSchema,
  type GenerationScopeType,
  type IdeaSourceContext,
} from '@worldforge/contracts';

import type { ProjectWorkspaceService } from '../project-workspace.js';
import { stableJson } from '../stable-json.js';
import { GenerationRunServiceError, type GenerationInputSourceInput } from './run-repository.js';

export interface IdeaScopeContextInput {
  readonly projectId: string;
  readonly scopeType: GenerationScopeType;
  readonly scopeId: string;
  readonly chapterId: string | null;
}

export interface IdeaScopeContext {
  readonly sourceContext: IdeaSourceContext;
  readonly context: string;
  readonly constraintHash: string;
  readonly inputSources: readonly GenerationInputSourceInput[];
}

interface ScopeRecord extends Record<string, unknown> {
  readonly label?: string | null;
}

function hash(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

function serializableScopeValue(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(serializableScopeValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, serializableScopeValue(nested)]),
    );
  }
  return value;
}

function scopeRecord(
  database: DatabaseSync,
  input: IdeaScopeContextInput,
): ScopeRecord | undefined {
  switch (input.scopeType) {
    case 'project':
      return database
        .prepare(
          `SELECT project.name AS label, project.channel,
                  brief.concept, brief.reading_promise AS readingPromise,
                  brief.protagonist_goal AS protagonistGoal,
                  brief.core_conflict AS coreConflict,
                  brief.ending_intent AS endingIntent,
                  brief.required_json AS requiredJson,
                  brief.forbidden_json AS forbiddenJson
             FROM projects project
             LEFT JOIN project_briefs brief ON brief.project_id = project.id
            WHERE project.id = ? AND ? = project.id`,
        )
        .get(input.projectId, input.scopeId) as ScopeRecord | undefined;
    case 'volume':
      return database
        .prepare(
          `SELECT title AS label, status, order_key AS orderKey
             FROM volumes
            WHERE id = ? AND project_id = ? AND deleted_at IS NULL`,
        )
        .get(input.scopeId, input.projectId) as ScopeRecord | undefined;
    case 'chapter':
      return database
        .prepare(
          `SELECT chapter.title AS label, chapter.status,
                  chapter.target_word_min AS targetWordMin,
                  chapter.target_word_max AS targetWordMax,
                  volume.title AS volumeTitle
             FROM chapters chapter
             JOIN volumes volume ON volume.id = chapter.volume_id
            WHERE chapter.id = ? AND volume.project_id = ?
              AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL
              AND ? = chapter.id`,
        )
        .get(input.scopeId, input.projectId, input.chapterId) as ScopeRecord | undefined;
    case 'scene':
      return database
        .prepare(
          `SELECT beat.title AS label, beat.goal, beat.core_conflict AS coreConflict,
                  beat.expected_result AS expectedResult, beat.beat_type AS beatType,
                  chapter.title AS chapterTitle
             FROM scene_beats beat
             JOIN chapters chapter ON chapter.id = beat.chapter_id
             JOIN volumes volume ON volume.id = chapter.volume_id
            WHERE beat.id = ? AND beat.project_id = ? AND volume.project_id = ?
              AND beat.deleted_at IS NULL AND chapter.deleted_at IS NULL
              AND volume.deleted_at IS NULL`,
        )
        .get(input.scopeId, input.projectId, input.projectId) as ScopeRecord | undefined;
    case 'entity':
      return database
        .prepare(
          `SELECT entity.name AS label, entity.entity_type AS entityType,
                  entity.summary, entity.aliases_json AS aliasesJson
             FROM entities entity
            WHERE entity.id = ? AND entity.project_id = ? AND entity.status = 'active'`,
        )
        .get(input.scopeId, input.projectId) as ScopeRecord | undefined;
    case 'selection':
      return database
        .prepare(
          `SELECT chapter.title AS label, block.block_type AS blockType,
                  block.text, block.attributes_json AS attributesJson,
                  block.content_hash AS contentHash
             FROM draft_blocks block
             JOIN drafts draft ON draft.id = block.draft_id
             JOIN chapters chapter ON chapter.id = draft.chapter_id
             JOIN volumes volume ON volume.id = chapter.volume_id
            WHERE block.logical_block_id = ? AND volume.project_id = ?
              AND chapter.active_draft_id = draft.id AND draft.status = 'active'
              AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL`,
        )
        .get(input.scopeId, input.projectId) as ScopeRecord | undefined;
  }
}

function assertCompatibilityChapter(database: DatabaseSync, input: IdeaScopeContextInput): void {
  if (input.chapterId === null || input.scopeType === 'chapter') return;
  const found = database
    .prepare(
      `SELECT 1
         FROM chapters chapter
         JOIN volumes volume ON volume.id = chapter.volume_id
        WHERE chapter.id = ? AND volume.project_id = ?
          AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL`,
    )
    .get(input.chapterId, input.projectId);
  if (!found) {
    throw new GenerationRunServiceError(
      'GENERATION_BASE_CONFLICT',
      'The Idea exploration compatibility chapter is outside the project.',
    );
  }
}

export function resolveIdeaScopeContext(
  workspace: ProjectWorkspaceService,
  raw: IdeaScopeContextInput,
): IdeaScopeContext {
  const input = { ...raw, scopeType: GenerationScopeTypeSchema.parse(raw.scopeType) };
  return workspace.readProject(input.projectId, (database) => {
    assertCompatibilityChapter(database, input);
    const persistedRecord = scopeRecord(database, input);
    if (!persistedRecord) {
      throw new GenerationRunServiceError(
        'GENERATION_BASE_CONFLICT',
        'The Idea exploration scope is missing, stale, or outside the project.',
      );
    }
    const record = serializableScopeValue(persistedRecord) as ScopeRecord;
    const sourceContext = IdeaSourceContextSchema.parse({
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      chapterId: input.chapterId,
      ...(typeof record.label === 'string' && record.label.trim() ? { label: record.label } : {}),
    });
    const contextObject = {
      projectId: input.projectId,
      sourceContext,
      scope: record,
    };
    const constraintHash = hash(contextObject);
    return {
      sourceContext,
      context: JSON.stringify(contextObject),
      constraintHash,
      inputSources: [
        {
          sourceType: 'scope',
          sourceId: input.scopeId,
          sourceOrder: 0,
          contentHash: constraintHash,
          metadata: {
            scopeType: input.scopeType,
            chapterId: input.chapterId,
          },
        },
      ],
    };
  });
}
