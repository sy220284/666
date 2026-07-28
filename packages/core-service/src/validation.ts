import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  SemanticValidationOutputSchema,
  StoryCommentAddInputSchema,
  StoryCommentResolveInputSchema,
  StoryTodoSaveInputSchema,
  ValidationCatalogSchema,
  ValidationCreateTodoInputSchema,
  ValidationListInputSchema,
  ValidationRunRulesInputSchema,
  ValidationUpdateIssueInputSchema,
  type SemanticValidationOutput,
  type ValidationCatalog,
} from '@worldforge/contracts';

import type { DatabaseClock } from './database/index.js';
import type { GenerationUsage } from './generation-run.js';
import type { ProjectWorkspaceService } from './project-workspace.js';

const systemClock: DatabaseClock = { now: () => new Date() };
const RULE_VERSION = 'worldforge.rules.v1';
const CONFIG_VERSION = 'general-writing.v1';
const RULE_CONFIG = {
  longParagraphCharacters: 1_000,
  longSentenceCharacters: 80,
  minimumDialogueSampleCharacters: 500,
  lowDialogueRatio: 0.05,
  highDialogueRatio: 0.8,
} as const;

export type ValidationServiceErrorCode =
  'VALIDATION_NOT_FOUND' | 'VALIDATION_INVALID' | 'VALIDATION_CONFLICT';

export class ValidationServiceError extends Error {
  readonly code: ValidationServiceErrorCode;

  constructor(code: ValidationServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ValidationServiceError';
    this.code = code;
  }
}

export interface ValidationServiceOptions {
  readonly clock?: DatabaseClock;
  readonly idFactory?: () => string;
}

interface VersionRow {
  readonly versionId: string;
  readonly projectId: string;
  readonly chapterId: string;
  readonly finalVersionId: string | null;
  readonly contentHash: string;
}

interface VersionBlockRow {
  readonly logicalBlockId: string;
  readonly blockType: string;
  readonly text: string;
  readonly contentHash: string;
  readonly locked: number | bigint;
  readonly orderKey: number | bigint;
}

interface BatchRow {
  readonly batchId: string;
  readonly projectId: string;
  readonly chapterId: string;
  readonly sourceVersionId: string;
  readonly generationRunId: string | null;
  readonly source: string;
  readonly ruleVersion: string | null;
  readonly configVersion: string | null;
  readonly inputFingerprint: string | null;
  readonly issueCount: number | bigint;
  readonly createdAt: string;
}

interface IssueRow {
  readonly issueId: string;
  readonly batchId: string;
  readonly projectId: string;
  readonly chapterId: string | null;
  readonly sourceVersionId: string | null;
  readonly logicalBlockId: string | null;
  readonly expectedBlockHash: string | null;
  readonly textQuote: string | null;
  readonly rangeHintJson: string | null;
  readonly issueType: string;
  readonly source: string;
  readonly severity: string;
  readonly rationale: string;
  readonly evidenceIdsJson: string;
  readonly suggestion: string | null;
  readonly confidence: number | null;
  readonly ruleId: string | null;
  readonly ruleVersion: string | null;
  readonly configVersion: string | null;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly finalVersionId: string | null;
  readonly persistedBlockHash: string | null;
}

interface TodoRow {
  readonly todoId: string;
  readonly projectId: string;
  readonly chapterId: string | null;
  readonly sceneBeatId: string | null;
  readonly logicalBlockId: string | null;
  readonly validationIssueId: string | null;
  readonly title: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
}

interface CommentRow {
  readonly commentId: string;
  readonly projectId: string;
  readonly chapterId: string | null;
  readonly sourceVersionId: string | null;
  readonly logicalBlockId: string | null;
  readonly validationIssueId: string | null;
  readonly body: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly resolvedAt: string | null;
}

interface RuleIssue {
  readonly issueType: string;
  readonly severity: 'high' | 'medium' | 'low' | 'info';
  readonly rationale: string;
  readonly suggestion: string;
  readonly logicalBlockId: string | null;
  readonly expectedBlockHash: string | null;
  readonly textQuote: string | null;
  readonly rangeHint: { readonly start: number; readonly end: number } | null;
  readonly evidenceIds: readonly string[];
  readonly ruleId: string;
}

function json(value: string | null): unknown | null {
  return value === null ? null : (JSON.parse(value) as unknown);
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stableUuid(value: string): string {
  const valueHash = hash(value);
  return `${valueHash.slice(0, 8)}-${valueHash.slice(8, 12)}-5${valueHash.slice(
    13,
    16,
  )}-8${valueHash.slice(17, 20)}-${valueHash.slice(20, 32)}`;
}

function finalVersion(
  database: DatabaseSync,
  projectId: string,
  sourceVersionId: string,
): { readonly version: VersionRow; readonly blocks: readonly VersionBlockRow[] } {
  const version = database
    .prepare(
      `SELECT version.id AS versionId, volume.project_id AS projectId,
              chapter.id AS chapterId, chapter.final_version_id AS finalVersionId,
              version.content_hash AS contentHash
         FROM versions version
         JOIN chapters chapter ON chapter.id = version.chapter_id
         JOIN volumes volume ON volume.id = chapter.volume_id
        WHERE version.id = ? AND volume.project_id = ?
          AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL`,
    )
    .get(sourceVersionId, projectId) as VersionRow | undefined;
  if (!version) {
    throw new ValidationServiceError(
      'VALIDATION_NOT_FOUND',
      'The validation Version was not found in this project.',
    );
  }
  if (version.finalVersionId !== version.versionId) {
    throw new ValidationServiceError(
      'VALIDATION_CONFLICT',
      'Validation requires the chapter current Final Version.',
    );
  }
  const blocks = database
    .prepare(
      `SELECT logical_block_id AS logicalBlockId, block_type AS blockType, text,
              content_hash AS contentHash, locked, order_key AS orderKey
         FROM version_blocks
        WHERE version_id = ?
        ORDER BY order_key, logical_block_id`,
    )
    .all(version.versionId) as unknown as VersionBlockRow[];
  if (blocks.length === 0) {
    throw new ValidationServiceError(
      'VALIDATION_INVALID',
      'The Final Version has no body blocks to validate.',
    );
  }
  return { version, blocks };
}

function batchRows(database: DatabaseSync, projectId: string): BatchRow[] {
  return database
    .prepare(
      `SELECT id AS batchId, project_id AS projectId, chapter_id AS chapterId,
              source_version_id AS sourceVersionId, generation_run_id AS generationRunId,
              source, rule_version AS ruleVersion, config_version AS configVersion,
              input_fingerprint AS inputFingerprint, issue_count AS issueCount,
              created_at AS createdAt
         FROM validation_batches
        WHERE project_id = ?
        ORDER BY created_at DESC, id DESC`,
    )
    .all(projectId) as unknown as BatchRow[];
}

function issueRows(database: DatabaseSync, projectId: string): IssueRow[] {
  return database
    .prepare(
      `SELECT issue.id AS issueId, issue.batch_id AS batchId,
              issue.project_id AS projectId, issue.chapter_id AS chapterId,
              issue.source_version_id AS sourceVersionId,
              issue.logical_block_id AS logicalBlockId,
              issue.expected_block_hash AS expectedBlockHash,
              issue.text_quote AS textQuote, issue.range_hint_json AS rangeHintJson,
              issue.issue_type AS issueType, issue.source, issue.severity,
              issue.rationale, issue.evidence_ids_json AS evidenceIdsJson,
              issue.suggestion, issue.confidence, issue.rule_id AS ruleId,
              issue.rule_version AS ruleVersion, issue.config_version AS configVersion,
              issue.status, issue.created_at AS createdAt, issue.updated_at AS updatedAt,
              chapter.final_version_id AS finalVersionId,
              block.content_hash AS persistedBlockHash
         FROM validation_issues issue
         LEFT JOIN chapters chapter ON chapter.id = issue.chapter_id
         LEFT JOIN version_blocks block
           ON block.version_id = issue.source_version_id
          AND block.logical_block_id = issue.logical_block_id
        WHERE issue.project_id = ?
        ORDER BY issue.status = 'open' DESC, issue.created_at DESC, issue.id`,
    )
    .all(projectId) as unknown as IssueRow[];
}

function catalog(database: DatabaseSync, projectId: string): ValidationCatalog {
  const batches = batchRows(database, projectId);
  const issues = issueRows(database, projectId);
  const todos = database
    .prepare(
      `SELECT id AS todoId, project_id AS projectId, chapter_id AS chapterId,
              scene_beat_id AS sceneBeatId, logical_block_id AS logicalBlockId,
              validation_issue_id AS validationIssueId, title, status,
              created_at AS createdAt, updated_at AS updatedAt,
              completed_at AS completedAt
         FROM story_todos WHERE project_id = ?
        ORDER BY status = 'open' DESC, updated_at DESC, id`,
    )
    .all(projectId) as unknown as TodoRow[];
  const comments = database
    .prepare(
      `SELECT id AS commentId, project_id AS projectId, chapter_id AS chapterId,
              source_version_id AS sourceVersionId, logical_block_id AS logicalBlockId,
              validation_issue_id AS validationIssueId, body, status,
              created_at AS createdAt, updated_at AS updatedAt,
              resolved_at AS resolvedAt
         FROM story_comments WHERE project_id = ?
        ORDER BY status = 'open' DESC, updated_at DESC, id`,
    )
    .all(projectId) as unknown as CommentRow[];
  return ValidationCatalogSchema.parse({
    projectId,
    batches: batches.map((row) => ({ ...row, issueCount: Number(row.issueCount) })),
    issues: issues.map((row) => ({
      issueId: row.issueId,
      batchId: row.batchId,
      projectId: row.projectId,
      issueType: row.issueType,
      source: row.source,
      severity: row.severity,
      rationale: row.rationale,
      evidenceIds: json(row.evidenceIdsJson),
      suggestion: row.suggestion,
      confidence: row.confidence,
      ruleId: row.ruleId,
      ruleVersion: row.ruleVersion,
      configVersion: row.configVersion,
      status: row.status,
      anchor: {
        projectId: row.projectId,
        chapterId: row.chapterId,
        versionId: row.sourceVersionId,
        logicalBlockId: row.logicalBlockId,
        expectedBlockHash: row.expectedBlockHash,
        textQuote: row.textQuote,
        rangeHint: json(row.rangeHintJson),
        state:
          row.sourceVersionId &&
          row.sourceVersionId === row.finalVersionId &&
          (!row.logicalBlockId || row.expectedBlockHash === row.persistedBlockHash)
            ? 'current'
            : 'stale',
      },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
    todos,
    comments,
  });
}

function rules(
  database: DatabaseSync,
  version: VersionRow,
  blocks: readonly VersionBlockRow[],
): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const bodyBlocks = blocks.filter((block) => block.blockType !== 'separator');
  for (const block of bodyBlocks) {
    if (!block.text.trim()) {
      issues.push({
        issueType: 'format.empty_block',
        severity: 'medium',
        rationale: '正文中存在空内容块，可能影响导出和阅读连续性。',
        suggestion: '建议删除空块或补充正文。',
        logicalBlockId: block.logicalBlockId,
        expectedBlockHash: block.contentHash,
        textQuote: null,
        rangeHint: null,
        evidenceIds: [block.logicalBlockId],
        ruleId: 'format.empty_block',
      });
    }
    const repeated = /([!?！？。，,.])\1{2,}/u.exec(block.text);
    if (repeated?.index !== undefined) {
      issues.push({
        issueType: 'format.repeated_punctuation',
        severity: 'low',
        rationale: '检测到连续重复标点，可能是输入错误。',
        suggestion: '建议核对标点是否符合作者意图。',
        logicalBlockId: block.logicalBlockId,
        expectedBlockHash: block.contentHash,
        textQuote: repeated[0],
        rangeHint: { start: repeated.index, end: repeated.index + repeated[0].length },
        evidenceIds: [block.logicalBlockId],
        ruleId: 'format.repeated_punctuation',
      });
    }
    if (block.text.length > RULE_CONFIG.longParagraphCharacters) {
      issues.push({
        issueType: 'stats.long_paragraph',
        severity: 'info',
        rationale: `段落为 ${block.text.length} 字符，超过通用参考值 ${RULE_CONFIG.longParagraphCharacters}。`,
        suggestion: '可按叙事节奏决定是否拆分；这不是强制文风规则。',
        logicalBlockId: block.logicalBlockId,
        expectedBlockHash: block.contentHash,
        textQuote: block.text.slice(0, 120),
        rangeHint: null,
        evidenceIds: [block.logicalBlockId],
        ruleId: 'stats.long_paragraph',
      });
    }
  }
  const fullText = bodyBlocks.map((block) => block.text).join('\n');
  const sentences = fullText
    .split(/[。！？!?]+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const averageSentence =
    sentences.length === 0
      ? 0
      : sentences.reduce((total, sentence) => total + sentence.length, 0) / sentences.length;
  if (averageSentence > RULE_CONFIG.longSentenceCharacters) {
    issues.push({
      issueType: 'stats.long_sentences',
      severity: 'info',
      rationale: `平均句长约 ${averageSentence.toFixed(1)} 字符，高于通用参考值 ${RULE_CONFIG.longSentenceCharacters}。`,
      suggestion: '建议结合目标文风核对阅读节奏。',
      logicalBlockId: null,
      expectedBlockHash: null,
      textQuote: null,
      rangeHint: null,
      evidenceIds: [version.versionId],
      ruleId: 'stats.long_sentences',
    });
  }
  if (fullText.length >= RULE_CONFIG.minimumDialogueSampleCharacters) {
    const dialogueCharacters = bodyBlocks
      .filter((block) => block.blockType === 'dialogue')
      .reduce((total, block) => total + block.text.length, 0);
    const ratio = fullText.length === 0 ? 0 : dialogueCharacters / fullText.length;
    if (ratio < RULE_CONFIG.lowDialogueRatio || ratio > RULE_CONFIG.highDialogueRatio) {
      issues.push({
        issueType: 'stats.dialogue_ratio',
        severity: 'info',
        rationale: `对话字符占比约 ${(ratio * 100).toFixed(1)}%，超出通用参考区间。`,
        suggestion: '建议按章节功能和目标文风人工判断，无需机械调整。',
        logicalBlockId: null,
        expectedBlockHash: null,
        textQuote: null,
        rangeHint: null,
        evidenceIds: [version.versionId],
        ruleId: 'stats.dialogue_ratio',
      });
    }
  }
  const missingRequired = database
    .prepare(
      `SELECT beat.id, beat.title
         FROM scene_beats beat
        WHERE beat.project_id = ? AND beat.chapter_id = ?
          AND beat.is_required = 1 AND beat.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1
              FROM scene_beat_block_links link
              JOIN draft_blocks draft_block ON draft_block.id = link.draft_block_id
              JOIN version_blocks version_block
                ON version_block.logical_block_id = draft_block.logical_block_id
               AND version_block.version_id = ?
             WHERE link.scene_beat_id = beat.id
          )
        ORDER BY beat.order_key, beat.id`,
    )
    .all(version.projectId, version.chapterId, version.versionId) as unknown as Array<{
    readonly id: string;
    readonly title: string;
  }>;
  for (const beat of missingRequired) {
    issues.push({
      issueType: 'structure.required_scene_beat',
      severity: 'high',
      rationale: `必选 SceneBeat“${beat.title}”没有对应的定稿正文块。`,
      suggestion: '建议核对章节结构或正文块与 SceneBeat 的关联。',
      logicalBlockId: null,
      expectedBlockHash: null,
      textQuote: null,
      rangeHint: null,
      evidenceIds: [beat.id, version.versionId],
      ruleId: 'structure.required_scene_beat',
    });
  }
  return issues;
}

function validateScopedIds(
  database: DatabaseSync,
  input: {
    readonly projectId: string;
    readonly chapterId: string | null;
    readonly sceneBeatId: string | null;
    readonly logicalBlockId: string | null;
  },
): void {
  if (input.chapterId) {
    const chapter = database
      .prepare(
        `SELECT 1 FROM chapters chapter
         JOIN volumes volume ON volume.id = chapter.volume_id
        WHERE chapter.id = ? AND volume.project_id = ?`,
      )
      .get(input.chapterId, input.projectId);
    if (!chapter) throw new ValidationServiceError('VALIDATION_NOT_FOUND', 'Chapter not found.');
  }
  if (input.sceneBeatId) {
    const beat = database
      .prepare('SELECT 1 FROM scene_beats WHERE id = ? AND project_id = ?')
      .get(input.sceneBeatId, input.projectId);
    if (!beat) throw new ValidationServiceError('VALIDATION_NOT_FOUND', 'SceneBeat not found.');
  }
  if (input.logicalBlockId) {
    const block = database
      .prepare(
        `SELECT 1
           FROM draft_blocks block
           JOIN drafts draft ON draft.id = block.draft_id
           JOIN chapters chapter ON chapter.id = draft.chapter_id
           JOIN volumes volume ON volume.id = chapter.volume_id
          WHERE block.logical_block_id = ? AND volume.project_id = ?
            AND chapter.active_draft_id = draft.id`,
      )
      .get(input.logicalBlockId, input.projectId);
    if (!block) {
      throw new ValidationServiceError('VALIDATION_NOT_FOUND', 'Active Draft block not found.');
    }
  }
}

export interface ValidationAiCompletionInput {
  readonly projectId: string;
  readonly chapterId: string;
  readonly sourceVersionId: string;
  readonly runId: string;
  readonly output: SemanticValidationOutput;
  readonly usage?: GenerationUsage;
}

export class ValidationService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;

  constructor(workspace: ProjectWorkspaceService, options: ValidationServiceOptions = {}) {
    this.#workspace = workspace;
    this.#clock = options.clock ?? systemClock;
    this.#idFactory = options.idFactory ?? randomUUID;
  }

  list(raw: unknown): ValidationCatalog {
    const input = ValidationListInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (database) => {
      const value = catalog(database, input.projectId);
      return ValidationCatalogSchema.parse({
        ...value,
        issues: value.issues.filter(
          (issue) =>
            (!input.chapterId || issue.anchor.chapterId === input.chapterId) &&
            (input.includeClosed || issue.status === 'open'),
        ),
        todos: value.todos.filter(
          (todo) =>
            (!input.chapterId || todo.chapterId === input.chapterId) &&
            (input.includeClosed || todo.status === 'open'),
        ),
        comments: value.comments.filter(
          (comment) =>
            (!input.chapterId || comment.chapterId === input.chapterId) &&
            (input.includeClosed || comment.status === 'open'),
        ),
      });
    });
  }

  runRules(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    const input = ValidationRunRulesInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const resolved = finalVersion(database, input.projectId, input.sourceVersionId);
      const fingerprint = hash(
        JSON.stringify({
          version: resolved.version.contentHash,
          blocks: resolved.blocks.map((block) => [block.logicalBlockId, block.contentHash]),
          ruleVersion: RULE_VERSION,
          configVersion: CONFIG_VERSION,
          config: RULE_CONFIG,
        }),
      );
      const existing = database
        .prepare(
          `SELECT id FROM validation_batches
            WHERE project_id = ? AND source_version_id = ?
              AND source = 'rule' AND input_fingerprint = ?`,
        )
        .get(input.projectId, input.sourceVersionId, fingerprint);
      if (existing) return catalog(database, input.projectId);
      const found = rules(database, resolved.version, resolved.blocks);
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
           suggestion, confidence, rule_id, rule_version, config_version,
           status, created_at, updated_at
         ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rule', ?, ?, ?, ?, NULL, ?, ?, ?,
                  'open', ?, ?)`,
      );
      for (const issue of found) {
        const issueId = stableUuid(
          `${fingerprint}:${issue.ruleId}:${issue.logicalBlockId ?? resolved.version.chapterId}:${
            issue.rangeHint?.start ?? 0
          }`,
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
          `SELECT status, run_type AS runType, chapter_id AS chapterId
             FROM generation_runs WHERE id = ? AND project_id = ?`,
        )
        .get(raw.runId, raw.projectId) as
        | { readonly status: string; readonly runType: string; readonly chapterId: string }
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
          `SELECT sources_json AS sourcesJson
             FROM generation_constraint_packages WHERE run_id = ?`,
        )
        .get(raw.runId) as { readonly sourcesJson: string } | undefined;
      const allowedEvidence = new Set(resolved.blocks.map((block) => block.logicalBlockId));
      for (const item of (json(constraint?.sourcesJson ?? null) ?? []) as Array<{
        readonly sourceId?: unknown;
        readonly id?: unknown;
      }>) {
        if (typeof item.sourceId === 'string') allowedEvidence.add(item.sourceId);
        if (typeof item.id === 'string') allowedEvidence.add(item.id);
      }
      const blockById = new Map(resolved.blocks.map((block) => [block.logicalBlockId, block]));
      for (const issue of output.issues) {
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
      const now = this.#clock.now().toISOString();
      const batchId = this.#idFactory();
      database
        .prepare(
          `INSERT INTO validation_batches(
             id, project_id, chapter_id, source_version_id, generation_run_id,
             source, rule_version, config_version, input_fingerprint,
             issue_count, created_at
           ) VALUES(?, ?, ?, ?, ?, 'ai', NULL, NULL, NULL, ?, ?)`,
        )
        .run(
          batchId,
          raw.projectId,
          raw.chapterId,
          raw.sourceVersionId,
          raw.runId,
          output.issues.length,
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
      for (const issue of output.issues) {
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

  updateIssue(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    const input = ValidationUpdateIssueInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const row = database
        .prepare('SELECT severity FROM validation_issues WHERE id = ? AND project_id = ?')
        .get(input.issueId, input.projectId) as { readonly severity: string } | undefined;
      if (!row) throw new ValidationServiceError('VALIDATION_NOT_FOUND', 'Issue not found.');
      const now = this.#clock.now().toISOString();
      if (input.action === 'downgrade') {
        const next = { high: 'medium', medium: 'low', low: 'info', info: 'info' }[row.severity];
        if (!next) {
          throw new ValidationServiceError(
            'VALIDATION_INVALID',
            'The persisted issue severity is invalid.',
          );
        }
        database
          .prepare(
            `UPDATE validation_issues SET severity = ?, status = 'open', updated_at = ?
              WHERE id = ? AND project_id = ?`,
          )
          .run(next, now, input.issueId, input.projectId);
      } else {
        const status = {
          resolve: 'resolved',
          ignore: 'ignored',
          mute: 'muted',
          false_positive: 'false_positive',
          reopen: 'open',
        }[input.action];
        database
          .prepare(
            'UPDATE validation_issues SET status = ?, updated_at = ? WHERE id = ? AND project_id = ?',
          )
          .run(status, now, input.issueId, input.projectId);
      }
      return catalog(database, input.projectId);
    });
  }

  createTodoFromIssue(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    const input = ValidationCreateTodoInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const issue = issueRows(database, input.projectId).find(
        (candidate) => candidate.issueId === input.issueId,
      );
      if (!issue) throw new ValidationServiceError('VALIDATION_NOT_FOUND', 'Issue not found.');
      const now = this.#clock.now().toISOString();
      database
        .prepare(
          `INSERT INTO story_todos(
             id, project_id, chapter_id, scene_beat_id, logical_block_id,
             validation_issue_id, title, status, created_at, updated_at, completed_at
           ) VALUES(?, ?, ?, NULL, ?, ?, ?, 'open', ?, ?, NULL)`,
        )
        .run(
          this.#idFactory(),
          input.projectId,
          issue.chapterId,
          issue.logicalBlockId,
          issue.issueId,
          input.title ?? issue.suggestion ?? issue.rationale.slice(0, 240),
          now,
          now,
        );
      return catalog(database, input.projectId);
    });
  }

  saveTodo(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    const input = StoryTodoSaveInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      validateScopedIds(database, input);
      const now = this.#clock.now().toISOString();
      const todoId = input.todoId ?? this.#idFactory();
      if (input.todoId) {
        const updated = database
          .prepare(
            `UPDATE story_todos
                SET chapter_id = ?, scene_beat_id = ?, logical_block_id = ?,
                    title = ?, status = ?, updated_at = ?, completed_at = ?
              WHERE id = ? AND project_id = ?`,
          )
          .run(
            input.chapterId,
            input.sceneBeatId,
            input.logicalBlockId,
            input.title,
            input.status,
            now,
            input.status === 'done' ? now : null,
            todoId,
            input.projectId,
          );
        if (Number(updated.changes) !== 1) {
          throw new ValidationServiceError('VALIDATION_NOT_FOUND', 'Todo not found.');
        }
      } else {
        database
          .prepare(
            `INSERT INTO story_todos(
               id, project_id, chapter_id, scene_beat_id, logical_block_id,
               validation_issue_id, title, status, created_at, updated_at, completed_at
             ) VALUES(?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
          )
          .run(
            todoId,
            input.projectId,
            input.chapterId,
            input.sceneBeatId,
            input.logicalBlockId,
            input.title,
            input.status,
            now,
            now,
            input.status === 'done' ? now : null,
          );
      }
      return catalog(database, input.projectId);
    });
  }

  addComment(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    const input = StoryCommentAddInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      validateScopedIds(database, {
        projectId: input.projectId,
        chapterId: input.chapterId,
        sceneBeatId: null,
        logicalBlockId: input.logicalBlockId,
      });
      if (input.sourceVersionId) {
        const version = database
          .prepare(
            `SELECT 1 FROM versions version
             JOIN chapters chapter ON chapter.id = version.chapter_id
             JOIN volumes volume ON volume.id = chapter.volume_id
            WHERE version.id = ? AND volume.project_id = ?`,
          )
          .get(input.sourceVersionId, input.projectId);
        if (!version) {
          throw new ValidationServiceError('VALIDATION_NOT_FOUND', 'Version not found.');
        }
      }
      if (
        input.issueId &&
        !database
          .prepare('SELECT 1 FROM validation_issues WHERE id = ? AND project_id = ?')
          .get(input.issueId, input.projectId)
      ) {
        throw new ValidationServiceError('VALIDATION_NOT_FOUND', 'Issue not found.');
      }
      const now = this.#clock.now().toISOString();
      database
        .prepare(
          `INSERT INTO story_comments(
             id, project_id, chapter_id, source_version_id, logical_block_id,
             validation_issue_id, body, status, created_at, updated_at, resolved_at
           ) VALUES(?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, NULL)`,
        )
        .run(
          this.#idFactory(),
          input.projectId,
          input.chapterId,
          input.sourceVersionId,
          input.logicalBlockId,
          input.issueId,
          input.body,
          now,
          now,
        );
      return catalog(database, input.projectId);
    });
  }

  resolveComment(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    const input = StoryCommentResolveInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const now = this.#clock.now().toISOString();
      const updated = database
        .prepare(
          `UPDATE story_comments
              SET status = 'resolved', resolved_at = ?, updated_at = ?
            WHERE id = ? AND project_id = ? AND status = 'open'`,
        )
        .run(now, now, input.commentId, input.projectId);
      if (Number(updated.changes) !== 1) {
        throw new ValidationServiceError('VALIDATION_NOT_FOUND', 'Open comment not found.');
      }
      return catalog(database, input.projectId);
    });
  }
}
