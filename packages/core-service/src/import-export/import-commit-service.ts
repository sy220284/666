import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  ImportCommitInputSchema,
  ImportCommitResultSchema,
  ImportPlanChapterSchema,
  type ImportCommitInput,
  type ImportCommitResult,
} from '@worldforge/contracts';

import {
  BoundedIdempotentPromiseCache,
  IdempotentRequestConflictError,
} from '../bounded-idempotent-promise-cache.js';
import type { DatabaseClock } from '../database/index.js';
import type { ProjectWorkspaceService } from '../project-workspace.js';
import type { RecoveryService } from '../recovery.js';
import {
  ImportExportServiceError,
  ORDER_STEP,
  PLAN_TTL_MS,
  blockHash,
  sha256,
  stable,
  systemClock,
  versionHash,
  wordCount,
  type ImportedVersionBlock,
  type ImportExportServiceOptions,
  type ImportPlanStore,
} from './import-export-model.js';

const IMPORT_COMMIT_RECEIPT_COMMAND = 'import.commit';

function commandFingerprint(input: ImportCommitInput): string {
  return createHash('sha256')
    .update(stable({ operation: IMPORT_COMMIT_RECEIPT_COMMAND, input }), 'utf8')
    .digest('hex');
}

function derivedRequestId(requestId: string, purpose: string): string {
  const bytes = Buffer.from(
    createHash('sha256')
      .update(`${requestId}:${purpose}`, 'utf8')
      .digest()
      .subarray(0, 16),
  );
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const value = bytes.toString('hex');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function receiptResult(
  row: { readonly fingerprint: string; readonly resultJson: string } | undefined,
  requestId: string,
  fingerprint: string,
): ImportCommitResult | undefined {
  if (!row) return undefined;
  if (row.fingerprint !== fingerprint) {
    throw new ImportExportServiceError(
      'IMPORT_COMMIT_FAILED',
      'The import requestId was already used with a different commit payload.',
    );
  }
  try {
    return ImportCommitResultSchema.parse(JSON.parse(row.resultJson) as unknown);
  } catch (error) {
    throw new ImportExportServiceError(
      'IMPORT_COMMIT_FAILED',
      'The durable import command receipt is invalid.',
      { cause: error },
    );
  }
}

export class ImportCommitService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #recovery: RecoveryService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;
  readonly #readSource: (filePath: string) => Promise<Buffer>;
  readonly #faultInjector: ImportExportServiceOptions['faultInjector'];
  readonly #plans: ImportPlanStore;
  readonly #commits = new BoundedIdempotentPromiseCache();

  constructor(
    workspace: ProjectWorkspaceService,
    recovery: RecoveryService,
    plans: ImportPlanStore,
    options: ImportExportServiceOptions = {},
  ) {
    this.#workspace = workspace;
    this.#recovery = recovery;
    this.#plans = plans;
    this.#clock = options.clock ?? systemClock;
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#readSource = options.readSource ?? readFile;
    this.#faultInjector = options.faultInjector;
  }

  async commitImport(
    requestId: string,
    raw: ImportCommitInput,
  ): Promise<ImportCommitResult> {
    const input = ImportCommitInputSchema.parse(raw);
    const fingerprint = commandFingerprint(input);
    try {
      const existing = this.#commits.get<ImportCommitResult>(requestId, fingerprint);
      if (existing) return existing;
    } catch (error) {
      if (error instanceof IdempotentRequestConflictError) {
        throw new ImportExportServiceError(
          'IMPORT_COMMIT_FAILED',
          'The import requestId was already used with a different commit payload.',
          { cause: error },
        );
      }
      throw error;
    }

    const durable = this.#readReceipt(requestId, input.projectId, fingerprint);
    if (durable) return durable;
    return this.#commits.remember(
      requestId,
      fingerprint,
      this.#commitImportOnce(requestId, input, fingerprint),
    );
  }

  #readReceipt(
    requestId: string,
    projectId: string,
    fingerprint: string,
  ): ImportCommitResult | undefined {
    return this.#workspace.readProject(projectId, (database) =>
      receiptResult(
        database
          .prepare(
            `SELECT fingerprint, result_json AS resultJson
               FROM command_receipts
              WHERE request_id = ? AND command_name = ?`,
          )
          .get(requestId, IMPORT_COMMIT_RECEIPT_COMMAND) as
          | { readonly fingerprint: string; readonly resultJson: string }
          | undefined,
        requestId,
        fingerprint,
      ),
    );
  }

  async #commitImportOnce(
    requestId: string,
    input: ImportCommitInput,
    fingerprint: string,
  ): Promise<ImportCommitResult> {
    const stored = this.#plans.get(input.planId);
    if (
      !stored ||
      stored.plan.projectId !== input.projectId ||
      this.#clock.now().getTime() - stored.createdAtMs > PLAN_TTL_MS
    ) {
      throw new ImportExportServiceError(
        'IMPORT_PLAN_STALE',
        'The import plan is missing or has expired.',
      );
    }
    const currentBuffer = await this.#readSource(stored.sourcePath);
    if (sha256(currentBuffer) !== stored.plan.sourceSha256) {
      throw new ImportExportServiceError(
        'IMPORT_PLAN_STALE',
        'The import source changed after preview.',
      );
    }
    const chapters = input.chapters.map((chapter) =>
      ImportPlanChapterSchema.parse(chapter),
    );
    if (new Set(chapters.map((chapter) => chapter.title)).size !== chapters.length) {
      throw new ImportExportServiceError(
        'IMPORT_COMMIT_FAILED',
        'Imported chapter titles must be unique inside the new volume.',
      );
    }
    const checkpoint = await this.#recovery.createOperationCheckpoint(
      derivedRequestId(requestId, 'import-checkpoint'),
      {
        projectId: input.projectId,
        operation: 'import',
      },
    );
    this.#faultInjector?.('after-checkpoint');
    const now = this.#clock.now().toISOString();
    const volumeId = this.#idFactory();
    const chapterIds: string[] = [];
    const draftIds: string[] = [];
    const versionIds: string[] = [];
    let result: ImportCommitResult;
    try {
      result = await this.#workspace.writeProject(
        requestId,
        input.projectId,
        (database) => {
          const replay = receiptResult(
            database
              .prepare(
                `SELECT fingerprint, result_json AS resultJson
                   FROM command_receipts
                  WHERE request_id = ? AND command_name = ?`,
              )
              .get(requestId, IMPORT_COMMIT_RECEIPT_COMMAND) as
              | { readonly fingerprint: string; readonly resultJson: string }
              | undefined,
            requestId,
            fingerprint,
          );
          if (replay) return replay;

          const currentOrder = database
            .prepare(
              'SELECT COALESCE(MAX(order_key), 0) AS orderKey FROM volumes WHERE project_id = ? AND deleted_at IS NULL',
            )
            .get(input.projectId) as { orderKey: number | bigint };
          database
            .prepare(
              `INSERT INTO volumes(id, project_id, title, order_key, status, deleted_at)
               VALUES(?, ?, ?, ?, 'writing', NULL)`,
            )
            .run(
              volumeId,
              input.projectId,
              input.volumeTitle,
              BigInt(currentOrder.orderKey) + ORDER_STEP,
            );
          const insertChapter = database.prepare(
            `INSERT INTO chapters(
               id, volume_id, title, order_key, status, target_word_min, target_word_max,
               active_draft_id, final_version_id, deleted_at
             ) VALUES(?, ?, ?, ?, 'writing', NULL, NULL, NULL, NULL, NULL)`,
          );
          const insertDraft = database.prepare(
            `INSERT INTO drafts(id, chapter_id, status, revision, created_at, updated_at)
             VALUES(?, ?, 'active', 1, ?, ?)`,
          );
          const activateDraft = database.prepare(
            'UPDATE chapters SET active_draft_id = ? WHERE id = ?',
          );
          const insertDraftBlock = database.prepare(
            `INSERT INTO draft_blocks(
               id, draft_id, logical_block_id, order_key, block_type, text,
               attributes_json, source, locked, content_hash, revision
             ) VALUES(?, ?, ?, ?, ?, ?, '{}', 'imported', 0, ?, 1)`,
          );
          const insertVersion = database.prepare(
            `INSERT INTO versions(
               id, chapter_id, source_draft_id, source_revision, title, description,
               label, word_count, content_hash, created_at
             ) VALUES(?, ?, ?, 1, '导入基线', '由安全导入创建', 'import', ?, ?, ?)`,
          );
          const insertVersionBlock = database.prepare(
            `INSERT INTO version_blocks(
               version_id, logical_block_id, order_key, block_type, text,
               attributes_json, source, locked, content_hash
             ) VALUES(?, ?, ?, ?, ?, '{}', 'imported', 0, ?)`,
          );
          chapters.forEach((chapter, chapterIndex) => {
            const chapterId = this.#idFactory();
            const draftId = this.#idFactory();
            const versionId = this.#idFactory();
            chapterIds.push(chapterId);
            draftIds.push(draftId);
            versionIds.push(versionId);
            insertChapter.run(
              chapterId,
              volumeId,
              chapter.title,
              BigInt(chapterIndex + 1) * ORDER_STEP,
            );
            insertDraft.run(draftId, chapterId, now, now);
            activateDraft.run(draftId, chapterId);
            const versionBlocks: ImportedVersionBlock[] = chapter.blocks.map(
              (block, blockIndex) => {
                const logicalBlockId = this.#idFactory();
                const contentHash = blockHash(block);
                const orderKey = BigInt(blockIndex + 1) * ORDER_STEP;
                insertDraftBlock.run(
                  this.#idFactory(),
                  draftId,
                  logicalBlockId,
                  orderKey,
                  block.blockType,
                  block.text,
                  contentHash,
                );
                return {
                  logicalBlockId,
                  orderKey: String(orderKey),
                  blockType: block.blockType,
                  text: block.text,
                  attributes: {},
                  source: 'imported',
                  locked: false,
                  contentHash,
                };
              },
            );
            insertVersion.run(
              versionId,
              chapterId,
              draftId,
              wordCount(chapter.blocks),
              versionHash(versionBlocks),
              now,
            );
            for (const block of versionBlocks) {
              insertVersionBlock.run(
                versionId,
                block.logicalBlockId,
                BigInt(block.orderKey),
                block.blockType,
                block.text,
                block.contentHash,
              );
            }
            const operations = versionBlocks.map((block, blockIndex) => ({
              type: 'insert',
              afterLogicalBlockId:
                blockIndex === 0 ? null : versionBlocks[blockIndex - 1]!.logicalBlockId,
              block: {
                blockType: block.blockType,
                content: block.text,
                attributes: {},
              },
            }));
            database
              .prepare(
                `INSERT INTO draft_patch_log(
                   id, draft_id, request_id, base_revision, committed_revision,
                   operations_json, before_blocks_json, after_blocks_json, created_at,
                   mutation_origin
                 ) VALUES(?, ?, ?, 0, 1, ?, '[]', ?, ?, 'import')`,
              )
              .run(
                this.#idFactory(),
                draftId,
                `${requestId}:import:${draftId}`,
                JSON.stringify(operations),
                JSON.stringify(
                  versionBlocks.map((block) => ({ ...block, revision: 1 })),
                ),
                now,
              );
            this.#faultInjector?.('during-import');
          });
          database
            .prepare('UPDATE projects SET updated_at = ? WHERE id = ?')
            .run(now, input.projectId);
          const committed = ImportCommitResultSchema.parse({
            projectId: input.projectId,
            checkpointId: checkpoint.backupId,
            volumeId,
            chapterIds,
            draftIds,
            versionIds,
            importedChapterCount: chapterIds.length,
          });
          database
            .prepare(
              `INSERT INTO command_receipts(
                 request_id, command_name, fingerprint, result_json, created_at
               ) VALUES(?, ?, ?, ?, ?)`,
            )
            .run(
              requestId,
              IMPORT_COMMIT_RECEIPT_COMMAND,
              fingerprint,
              JSON.stringify(committed),
              now,
            );
          return committed;
        },
        { operation: 'import.commit', input },
      );
    } catch (error) {
      throw new ImportExportServiceError(
        'IMPORT_COMMIT_FAILED',
        'The import transaction failed and was rolled back.',
        { cause: error },
      );
    }
    this.#plans.delete(input.planId);
    return result;
  }
}
