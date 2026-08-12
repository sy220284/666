import type { GenerationRun } from '@worldforge/contracts';
import type { DatabaseSync } from 'node:sqlite';

import type { ProjectWorkspaceService } from '../project-workspace.js';
import { stableJson } from '../stable-json.js';
import {
  GenerationRunServiceError,
  type GenerationInputSourceInput,
  type GenerationRunCreateInput,
  type GenerationRunRow,
  mapRun,
  runSelect,
} from './run-repository.js';

const VALIDATION_SEMANTIC_IDENTITY_METADATA_KEY = '__worldforgeValidationSemanticIdentityV1';

interface ConstraintPackageRow {
  readonly constraintHash: string;
  readonly contentHash: string;
  readonly snapshotSource: string;
  readonly sourceVersionIdsJson: string;
  readonly sourcesJson: string;
  readonly estimatedTokens: number | bigint;
  readonly trimLogJson: string;
}

interface InputSourceRow {
  readonly sourceType: string;
  readonly sourceId: string;
  readonly sourceOrder: number | bigint;
  readonly contentHash: string | null;
  readonly metadataJson: string;
}

function parsedJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function commandMetadata(metadata: unknown): unknown {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return metadata;
  const copy = { ...(metadata as Readonly<Record<string, unknown>>) };
  delete copy[VALIDATION_SEMANTIC_IDENTITY_METADATA_KEY];
  return copy;
}

function normalizedSources(sources: readonly GenerationInputSourceInput[]): readonly unknown[] {
  return sources
    .map((source) => ({
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      sourceOrder: source.sourceOrder,
      contentHash: source.contentHash ?? null,
      metadata: commandMetadata(JSON.parse(JSON.stringify(source.metadata ?? {})) as unknown),
    }))
    .sort(
      (left, right) =>
        left.sourceOrder - right.sourceOrder ||
        left.sourceType.localeCompare(right.sourceType, 'en') ||
        left.sourceId.localeCompare(right.sourceId, 'en'),
    );
}

function persistedSources(database: DatabaseSync, runId: string): readonly unknown[] {
  const rows = database
    .prepare(
      `SELECT source_type AS sourceType, source_id AS sourceId,
              source_order AS sourceOrder, content_hash AS contentHash,
              metadata_json AS metadataJson
         FROM generation_input_sources
        WHERE run_id = ?
        ORDER BY source_order, source_type, source_id`,
    )
    .all(runId) as unknown as InputSourceRow[];
  return rows.map((row) => ({
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    sourceOrder: Number(row.sourceOrder),
    contentHash: row.contentHash,
    metadata: commandMetadata(parsedJson(row.metadataJson)),
  }));
}

function expectedConstraintFingerprint(input: GenerationRunCreateInput): unknown {
  const constraint = input.constraintPackage;
  if (constraint === null) return null;
  return {
    constraintHash: constraint.constraintHash,
    contentHash: constraint.contentHash,
    snapshotSource: constraint.snapshotSource,
    sourceVersionIds: constraint.sourceVersionIds,
    sources: constraint.sections,
    estimatedTokens: constraint.estimatedTokens,
    trimLog: constraint.trimLog,
  };
}

export function generationCreateFingerprint(input: GenerationRunCreateInput): string {
  return stableJson({
    command: 'generation.create',
    projectId: input.projectId,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    chapterId: input.chapterId,
    baseDraftId: input.baseDraftId,
    baseDraftRevision: input.baseDraftRevision,
    runType: input.runType,
    promptId: input.promptId,
    promptVersion: input.promptVersion,
    outputMode: input.outputMode,
    providerId: input.providerId,
    actualModel: input.actualModel,
    supportStatus: input.supportStatus,
    constraint: expectedConstraintFingerprint(input),
    inputSources: normalizedSources(input.inputSources ?? []),
    taskId: input.taskId ?? null,
  });
}

export function readGenerationRunReplay(
  workspace: ProjectWorkspaceService,
  requestId: string,
  input: GenerationRunCreateInput,
): GenerationRun | null {
  return workspace.readProject(input.projectId, (database) => {
    const row = database
      .prepare(`${runSelect} WHERE generation.request_id = ? AND generation.project_id = ?`)
      .get(requestId, input.projectId) as GenerationRunRow | undefined;
    if (!row) return null;

    const constraints = database
      .prepare(
        `SELECT constraint_hash AS constraintHash, content_hash AS contentHash,
                snapshot_source AS snapshotSource,
                source_version_ids_json AS sourceVersionIdsJson,
                sources_json AS sourcesJson, estimated_tokens AS estimatedTokens,
                trim_log_json AS trimLogJson
           FROM generation_constraint_packages
          WHERE run_id = ?`,
      )
      .get(row.runId) as ConstraintPackageRow | undefined;
    const run = mapRun(database, row);
    const expectedConstraint = input.constraintPackage;
    const constraintMatches =
      expectedConstraint === null
        ? constraints === undefined
        : constraints !== undefined &&
          constraints.constraintHash === expectedConstraint.constraintHash &&
          constraints.contentHash === expectedConstraint.contentHash &&
          constraints.snapshotSource === expectedConstraint.snapshotSource &&
          Number(constraints.estimatedTokens) === expectedConstraint.estimatedTokens &&
          stableJson(parsedJson(constraints.sourceVersionIdsJson)) ===
            stableJson(expectedConstraint.sourceVersionIds) &&
          stableJson(parsedJson(constraints.sourcesJson)) ===
            stableJson(
              (['P0', 'P1', 'P2', 'P3', 'P4'] as const).flatMap((priority) =>
                expectedConstraint.sections[priority].map((source) => ({
                  id: source.id,
                  priority: source.priority,
                  sourceType: source.sourceType,
                  sourceId: source.sourceId,
                  sourceVersionId: source.sourceVersionId,
                  chapterId: source.chapterId,
                  entityId: source.entityId,
                  semanticKey: source.semanticKey,
                  temporalStatus: source.temporalStatus,
                  contentHash: source.contentHash,
                  estimatedTokens: source.estimatedTokens,
                })),
              ),
            ) &&
          stableJson(parsedJson(constraints.trimLogJson)) ===
            stableJson(expectedConstraint.trimLog);
    const matches =
      run.scopeType === input.scopeType &&
      run.scopeId === input.scopeId &&
      run.chapterId === input.chapterId &&
      run.baseDraftId === input.baseDraftId &&
      run.baseDraftRevision === input.baseDraftRevision &&
      run.runType === input.runType &&
      run.promptId === input.promptId &&
      run.promptVersion === input.promptVersion &&
      run.outputMode === input.outputMode &&
      run.providerId === input.providerId &&
      run.actualModel === input.actualModel &&
      run.supportStatus === input.supportStatus &&
      (input.taskId === undefined || run.taskId === input.taskId) &&
      constraintMatches &&
      stableJson(persistedSources(database, row.runId)) ===
        stableJson(normalizedSources(input.inputSources ?? []));

    if (!matches) {
      throw new GenerationRunServiceError(
        'GENERATION_RESULT_CONFLICT',
        'The requestId was already used for a different GenerationRun command.',
      );
    }
    return run;
  });
}
