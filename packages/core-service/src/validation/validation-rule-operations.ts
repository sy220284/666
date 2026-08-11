import {
  SemanticValidationOutputSchema,
  ValidationRunRulesInputSchema,
  type ValidationCatalog,
} from '@worldforge/contracts';

import type { DatabaseClock } from '../database/index.js';
import type { ProjectWorkspaceService } from '../project-workspace.js';
import { catalog } from './validation-catalog.js';
import {
  aiValidationFingerprint,
  finalVersion,
  json,
  ruleValidationFingerprint,
  stableUuid,
  ValidationServiceError,
  type ValidationAiCompletionInput,
} from './validation-model.js';
import { CONFIG_VERSION, RULE_CONFIG, RULE_VERSION, rules } from './validation-rules.js';
import { isValidationExceptionActive } from './validation-exception-policy.js';

export class ValidationRuleOperations {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;

  constructor(workspace: ProjectWorkspaceService, clock: DatabaseClock, idFactory: () => string) {
    this.#workspace = workspace;
    this.#clock = clock;
    this.#idFactory = idFactory;
  }

  runRules(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    const input = ValidationRunRulesInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const resolved = finalVersion(database, input.projectId, input.sourceVersionId);
      const fingerprint = ruleValidationFingerprint(
        database,
        resolved,
        RULE_VERSION,
        CONFIG_VERSION,
        RULE_CONFIG,
      );
      const existing = database
        .prepare(
          `SELECT id FROM validation_batches
            WHERE project_id = ? AND source_version_id = ?
              AND source = 'rule' AND input_fingerprint = ?`,
        )
        .get(input.projectId, input.sourceVersionId, fingerprint);
      if (existing) return catalog(database, input.projectId);
      const found = rules(database, resolved.version, resolved.blocks).filter(
        (issue) =>
          !isValidationExceptionActive(
            database,
            input.projectId,
            resolved.version.chapterId,
            issue,
          ),
      );
      const batchId = this.#idFactory();
      const now = this.#clock.now().toISOString();
      database
        .prepare(
          `INSERT INTO validation_batches(
             id, project_id, chapter_id, source_version_id, generation_run_id,
             source, rule_version, config_version, input_fingerprint,
             issue_count, created_at
           ) VALUES(?, ?, ?, ?, NULL, 'rule', ?, ?, ?, ?, ?)`,
        )
        .run(
          batchId,
          input.projectId,
          resolved.version.chapterId,
          resolved.version.versionId,
          RULE_VERSION,
          CONFIG_VERSION,
          fingerprint,
          found.length,
          now,
        );
      const insert = database.prepare(
        `INSERT INTO validation_issues(
           id, batch_id, project_id, chapter_id, source_version_id,
           logical_block_id, expected_block_hash, text_quote, range_hint_json,
           issue_type, source, severity, rationale, evidence_ids_json,
           current_evidence_ids_json, conflict_evidence_ids_json,
           suggestion, confidence, rule_id, rule_version, config_version,
           status, created_at, updated_at
         ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rule', ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?,
                  'open', ?, ?)`,
      );
      for (const issue of found) {
        const issueId = stableUuid(
          `${fingerprint}:${issue.ruleId}:${issue.logicalBlockId ?? resolved.version.chapterId}:${
            issue.rangeHint?.start ?? 0
          }:${issue.evidenceIds.join(':')}`,
        );
        insert.run(
          issueId,
          batchId,
          input.projectId,
          resolved.version.chapterId,
          resolved.version.versionId,
          issue.logicalBlockId,
          issue.expectedBlockHash,
          issue.textQuote,
          issue.rangeHint ? JSON.stringify(issue.rangeHint) : null,
          issue.issueType,
          issue.severity,
          issue.rationale,
          JSON.stringify(issue.evidenceIds),
          JSON.stringify(issue.currentEvidenceIds ?? []),
          JSON.stringify(issue.conflictEvidenceIds ?? []),
          issue.suggestion,
          issue.ruleId,
          RULE_VERSION,
          CONFIG_VERSION,
          now,
          now,
        );
      }
      database
        .prepare(
          `UPDATE story_todos
              SET status = 'done', completed_at = ?, updated_at = ?
            WHERE project_id = ? AND status = 'open'
              AND validation_issue_id IN (
                SELECT old_issue.id
                  FROM validation_issues old_issue
                 WHERE old_issue.source = 'rule'
                   AND old_issue.source_version_id <> ?
                   AND NOT EXISTS (
                     SELECT 1 FROM validation_issues current_issue
                      WHERE current_issue.batch_id = ?
                        AND current_issue.issue_type = old_issue.issue_type
                        AND current_issue.logical_block_id IS old_issue.logical_block_id
                   )
              )`,
        )
        .run(now, now, input.projectId, input.sourceVersionId, batchId);
      return catalog(database, input.projectId);
    });
  }

  completeAiBatch(
    requestId: string,
    raw: ValidationAiCompletionInput,
  ): Promise<{ readonly batchId: string; readonly catalog: ValidationCatalog }> {
    const output = SemanticValidationOutputSchema.parse(raw.output);
    return this.#workspace.writeProject(requestId, raw.projectId, (database) => {
      const resolved = finalVersion(database, raw.projectId, raw.sourceVersionId);
      if (resolved.version.chapterId !== raw.chapterId) {
        throw new ValidationServiceError(
          'VALIDATION_CONFLICT',
          'The semantic validation chapter does not match its Final Version.',
        );
      }
      const run = database
        .prepare(
          `SELECT status, run_type AS runType, chapter_id AS chapterId,
                  prompt_id AS promptId, prompt_version AS promptVersion
             FROM generation_runs WHERE id = ? AND project_id = ?`,
        )
        .get(raw.runId, raw.projectId) as
        | {
            readonly status: string;
            readonly runType: string;
            readonly chapterId: string;
            readonly promptId: string;
            readonly promptVersion: number | bigint;
          }
        | undefined;
      if (
        !run ||
        (run.status !== 'queued' && run.status !== 'running') ||
        run.runType !== 'validate' ||
        run.chapterId !== raw.chapterId
      ) {
        throw new ValidationServiceError(
          'VALIDATION_CONFLICT',
          'The semantic issues do not match an active validation run.',
        );
      }
      const source = database
        .prepare(
          `SELECT 1 FROM generation_input_sources
            WHERE run_id = ? AND source_type = 'version' AND source_id = ?`,
        )
        .get(raw.runId, raw.sourceVersionId);
      if (!source) {
        throw new ValidationServiceError(
          'VALIDATION_CONFLICT',
          'The Final Version is not the persisted validation source.',
        );
      }
      const constraint = database
        .prepare(
          `SELECT constraint_hash AS constraintHash, sources_json AS sourcesJson
             FROM generation_constraint_packages WHERE run_id = ?`,
        )
        .get(raw.runId) as
        { readonly constraintHash: string; readonly sourcesJson: string } | undefined;
      if (!constraint) {
        throw new ValidationServiceError(
          'VALIDATION_CONFLICT',
          'The validation GenerationRun is missing its authoritative ConstraintPackage.',
        );
      }
      const allowedEvidence = new Set(resolved.blocks.map((block) => block.logicalBlockId));
      for (const item of (json(constraint.sourcesJson) ?? []) as Array<{
        readonly sourceId?: unknown;
        readonly id?: unknown;
      }>) {
        if (typeof item.sourceId === 'string') allowedEvidence.add(item.sourceId);
        if (typeof item.id === 'string') allowedEvidence.add(item.id);
      }
      const blockById = new Map(resolved.blocks.map((block) => [block.logicalBlockId, block]));
      const acceptedIssues = output.issues.filter(
        (issue) =>
          !isValidationExceptionActive(database, raw.projectId, raw.chapterId, {
            issueType: issue.type,
            evidenceIds: issue.evidenceIds,
          }),
      );
      for (const issue of acceptedIssues) {
        if (issue.evidenceIds.some((id) => !allowedEvidence.has(id))) {
          throw new ValidationServiceError(
            'VALIDATION_INVALID',
            'A semantic issue references evidence outside the authoritative context.',
          );
        }
        if (issue.logicalBlockId) {
          const block = blockById.get(issue.logicalBlockId);
          if (!block || (issue.quote && !block.text.includes(issue.quote))) {
            throw new ValidationServiceError(
              'VALIDATION_INVALID',
              'A semantic issue does not match its Final Version block evidence.',
            );
          }
        } else if (issue.quote) {
          throw new ValidationServiceError(
            'VALIDATION_INVALID',
            'A quoted semantic issue requires a logical block anchor.',
          );
        }
      }
      const fingerprint = aiValidationFingerprint(database, resolved, {
        constraintHash: constraint.constraintHash,
        promptId: run.promptId,
        promptVersion: Number(run.promptVersion),
      });
      const now = this.#clock.now().toISOString();
      const batchId = this.#idFactory();
      database
        .prepare(
          `INSERT INTO validation_batches(
             id, project_id, chapter_id, source_version_id, generation_run_id,
             source, rule_version, config_version, input_fingerprint,
             issue_count, created_at
           ) VALUES(?, ?, ?, ?, ?, 'ai', NULL, NULL, ?, ?, ?)`,
        )
        .run(
          batchId,
          raw.projectId,
          raw.chapterId,
          raw.sourceVersionId,
          raw.runId,
          fingerprint,
          acceptedIssues.length,
          now,
        );
      const insert = database.prepare(
        `INSERT INTO validation_issues(
           id, batch_id, project_id, chapter_id, source_version_id,
           logical_block_id, expected_block_hash, text_quote, range_hint_json,
           issue_type, source, severity, rationale, evidence_ids_json,
           suggestion, confidence, rule_id, rule_version, config_version,
           status, created_at, updated_at
         ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'ai', ?, ?, ?, ?, ?, NULL, NULL, NULL,
                  'open', ?, ?)`,
      );
      for (const issue of acceptedIssues) {
        const block = issue.logicalBlockId ? blockById.get(issue.logicalBlockId) : undefined;
        insert.run(
          this.#idFactory(),
          batchId,
          raw.projectId,
          raw.chapterId,
          raw.sourceVersionId,
          issue.logicalBlockId ?? null,
          block?.contentHash ?? null,
          issue.quote ?? null,
          issue.type,
          issue.severity,
          issue.rationale,
          JSON.stringify(issue.evidenceIds),
          issue.suggestion ?? null,
          issue.confidence,
          now,
          now,
        );
      }
      database
        .prepare(
          `INSERT INTO generation_result_refs(
             run_id, result_type, result_id, candidate_kind, created_at
           ) VALUES(?, 'validation_batch', ?, NULL, ?)`,
        )
        .run(raw.runId, batchId, now);
      const updated = database
        .prepare(
          `UPDATE generation_runs
              SET status = 'succeeded', stage = 'completed',
                  input_tokens = ?, output_tokens = ?,
                  error_code = NULL, retryable = NULL, partial_status = 'unavailable',
                  finished_at = ?
            WHERE id = ? AND project_id = ? AND status IN ('queued', 'running')`,
        )
        .run(
          raw.usage?.inputTokens ?? null,
          raw.usage?.outputTokens ?? null,
          now,
          raw.runId,
          raw.projectId,
        );
      if (Number(updated.changes) !== 1) {
        throw new ValidationServiceError(
          'VALIDATION_CONFLICT',
          'The GenerationRun changed before validation committed.',
        );
      }
      return { batchId, catalog: catalog(database, raw.projectId) };
    });
  }
}
