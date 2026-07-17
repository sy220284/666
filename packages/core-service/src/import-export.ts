import { createHash, randomUUID } from 'node:crypto';
import {
  access,
  constants,
  lstat,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import * as iconv from 'iconv-lite';

import {
  ExportVersionCatalogSchema,
  ExportVersionsInputSchema,
  ExportVersionsResultSchema,
  ImportCommitInputSchema,
  ImportCommitResultSchema,
  ImportPlanChapterSchema,
  ImportPlanSchema,
  ImportPreviewInputSchema,
  type DetectedTextEncoding,
  type ExportVersionCatalog,
  type ExportVersionsInput,
  type ExportVersionsResult,
  type ImportCommitInput,
  type ImportCommitResult,
  type ImportPlan,
  type ImportPlanBlock,
  type ImportPlanChapter,
  type ImportPreviewInput,
  type TextDocumentFormat,
} from '@worldforge/contracts';

import type { DatabaseClock } from './database/index.js';
import type { ProjectWorkspaceService } from './project-workspace.js';
import type { RecoveryService } from './recovery.js';

const systemClock: DatabaseClock = { now: () => new Date() };
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const PLAN_TTL_MS = 30 * 60 * 1000;
const ORDER_STEP = 1024n;

export type ImportExportServiceErrorCode =
  | 'IMPORT_FORMAT_UNSUPPORTED'
  | 'IMPORT_ENCODING_UNCERTAIN'
  | 'IMPORT_ARCHIVE_LIMIT'
  | 'IMPORT_CONTENT_EMPTY'
  | 'IMPORT_PLAN_STALE'
  | 'IMPORT_COMMIT_FAILED'
  | 'EXPORT_VERSION_REQUIRED'
  | 'EXPORT_TARGET_EXISTS'
  | 'EXPORT_WRITE_FAILED';

export class ImportExportServiceError extends Error {
  readonly code: ImportExportServiceErrorCode;
  constructor(code: ImportExportServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ImportExportServiceError';
    this.code = code;
  }
}

export interface ImportExportServiceOptions {
  readonly clock?: DatabaseClock;
  readonly idFactory?: () => string;
  readonly readSource?: (filePath: string) => Promise<Buffer>;
  readonly writeTarget?: (filePath: string, content: Buffer) => Promise<void>;
  readonly faultInjector?: (
    stage: 'after-checkpoint' | 'during-import' | 'after-export-write',
  ) => void;
}

interface StoredPlan {
  readonly plan: ImportPlan;
  readonly sourcePath: string;
  readonly createdAtMs: number;
}

interface ExportVersionRow {
  readonly versionId: string;
  readonly volumeId: string;
  readonly volumeTitle: string;
  readonly chapterId: string;
  readonly chapterTitle: string;
  readonly versionTitle: string;
  readonly wordCount: number | bigint;
  readonly createdAt: string;
  readonly finalized: number | bigint;
  readonly volumeOrder: number | bigint;
  readonly chapterOrder: number | bigint;
}

interface ExportBlockRow {
  readonly blockType: ImportPlanBlock['blockType'];
  readonly text: string;
  readonly orderKey: number | bigint;
}

interface ImportedVersionBlock {
  readonly logicalBlockId: string;
  readonly orderKey: string;
  readonly blockType: ImportPlanBlock['blockType'];
  readonly text: string;
  readonly attributes: Record<string, never>;
  readonly source: 'imported';
  readonly locked: false;
  readonly contentHash: string;
}

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function blockHash(block: ImportPlanBlock): string {
  return sha256(
    stable({
      blockType: block.blockType,
      text: block.text.replaceAll('\r\n', '\n').replaceAll('\r', '\n'),
      attributes: {},
      source: 'imported',
      locked: false,
    }),
  );
}

function versionHash(blocks: readonly ImportedVersionBlock[]): string {
  return sha256(stable(blocks));
}

function wordCount(blocks: readonly ImportPlanBlock[]): number {
  return blocks.reduce(
    (total, block) =>
      total + Array.from(block.text.replace(/\s/gu, '').matchAll(/[\p{L}\p{N}]/gu)).length,
    0,
  );
}

function decode(buffer: Buffer, encoding: DetectedTextEncoding): string {
  try {
    const decoded =
      encoding === 'gb18030'
        ? iconv.decode(buffer, 'gb18030')
        : new TextDecoder(encoding, { fatal: true }).decode(buffer);
    if (decoded.includes('\uFFFD')) {
      throw new Error(`Invalid byte sequence for ${encoding}.`);
    }
    return decoded
      .replace(/^\uFEFF/u, '')
      .replaceAll('\r\n', '\n')
      .replaceAll('\r', '\n');
  } catch (error) {
    throw new ImportExportServiceError(
      'IMPORT_ENCODING_UNCERTAIN',
      `The file could not be decoded as ${encoding}.`,
      { cause: error },
    );
  }
}

function detectEncoding(buffer: Buffer): {
  readonly encoding: DetectedTextEncoding;
  readonly confidence: ImportPlan['confidence'];
  readonly candidates: DetectedTextEncoding[];
} {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
    return { encoding: 'utf-8', confidence: 'high', candidates: ['utf-8'] };
  }
  if (buffer.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))) {
    return { encoding: 'utf-16le', confidence: 'high', candidates: ['utf-16le'] };
  }
  if (buffer.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))) {
    return { encoding: 'utf-16be', confidence: 'high', candidates: ['utf-16be'] };
  }
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  let evenZero = 0;
  let oddZero = 0;
  for (let index = 0; index < sample.length; index += 1) {
    if (sample[index] !== 0) continue;
    if (index % 2 === 0) evenZero += 1;
    else oddZero += 1;
  }
  if (oddZero > sample.length / 8 && oddZero > evenZero * 4) {
    return {
      encoding: 'utf-16le',
      confidence: 'medium',
      candidates: ['utf-16le', 'utf-8', 'gb18030'],
    };
  }
  if (evenZero > sample.length / 8 && evenZero > oddZero * 4) {
    return {
      encoding: 'utf-16be',
      confidence: 'medium',
      candidates: ['utf-16be', 'utf-8', 'gb18030'],
    };
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return { encoding: 'utf-8', confidence: 'high', candidates: ['utf-8', 'gb18030'] };
  } catch {
    const decoded = iconv.decode(buffer, 'gb18030');
    if (!decoded.includes('\uFFFD')) {
      return {
        encoding: 'gb18030',
        confidence: 'low',
        candidates: ['gb18030', 'utf-8'],
      };
    }
    throw new ImportExportServiceError(
      'IMPORT_ENCODING_UNCERTAIN',
      'The file encoding could not be identified safely.',
    );
  }
}

function flushParagraph(lines: string[], blocks: ImportPlanBlock[]): void {
  const text = lines.join('\n').trim();
  lines.length = 0;
  if (text) blocks.push({ blockType: 'paragraph', text });
}

function nonEmptyBlocks(blocks: ImportPlanBlock[]): ImportPlanBlock[] {
  const filtered = blocks.filter(
    (block) => block.blockType === 'separator' || block.text.trim().length > 0,
  );
  return filtered.length > 0 ? filtered : [{ blockType: 'paragraph', text: '' }];
}

function parseMarkdown(
  text: string,
  fallbackTitle: string,
  idFactory: () => string,
): ImportPlanChapter[] {
  const chapters: ImportPlanChapter[] = [];
  let title = fallbackTitle;
  let blocks: ImportPlanBlock[] = [];
  const paragraph: string[] = [];
  let sawChapter = false;
  const commit = (): void => {
    flushParagraph(paragraph, blocks);
    const normalized = nonEmptyBlocks(blocks);
    if (normalized.some((block) => block.blockType === 'separator' || block.text.trim())) {
      chapters.push({ planChapterId: idFactory(), title, blocks: normalized });
    }
    blocks = [];
  };
  for (const rawLine of text.split('\n')) {
    const chapter = rawLine.match(/^#\s+(.+)$/u);
    if (chapter) {
      if (sawChapter || blocks.length > 0 || paragraph.length > 0) commit();
      title = chapter[1]!.trim().slice(0, 240) || fallbackTitle;
      sawChapter = true;
      continue;
    }
    const heading = rawLine.match(/^#{2,6}\s+(.+)$/u);
    if (heading) {
      flushParagraph(paragraph, blocks);
      blocks.push({ blockType: 'heading', text: heading[1]!.trim() });
      continue;
    }
    if (/^\s*(?:---|\*\*\*)\s*$/u.test(rawLine)) {
      flushParagraph(paragraph, blocks);
      blocks.push({ blockType: 'separator', text: '' });
      continue;
    }
    if (rawLine.trim() === '') flushParagraph(paragraph, blocks);
    else paragraph.push(rawLine);
  }
  commit();
  return chapters;
}

function parseTxt(
  text: string,
  fallbackTitle: string,
  idFactory: () => string,
): ImportPlanChapter[] {
  const lines = text.split('\n');
  const markers = lines.some((line) => /^===\s*.+?\s*===$/u.test(line));
  if (!markers) {
    const blocks: ImportPlanBlock[] = [];
    const paragraph: string[] = [];
    for (const line of lines) {
      if (line.trim() === '') flushParagraph(paragraph, blocks);
      else paragraph.push(line);
    }
    flushParagraph(paragraph, blocks);
    return [{ planChapterId: idFactory(), title: fallbackTitle, blocks: nonEmptyBlocks(blocks) }];
  }
  const chapters: ImportPlanChapter[] = [];
  let title = fallbackTitle;
  let blocks: ImportPlanBlock[] = [];
  const paragraph: string[] = [];
  const commit = (): void => {
    flushParagraph(paragraph, blocks);
    const normalized = nonEmptyBlocks(blocks);
    if (normalized.some((block) => block.blockType === 'separator' || block.text.trim())) {
      chapters.push({ planChapterId: idFactory(), title, blocks: normalized });
    }
    blocks = [];
  };
  for (const line of lines) {
    const marker = line.match(/^===\s*(.+?)\s*===$/u);
    if (marker) {
      if (blocks.length > 0 || paragraph.length > 0) commit();
      title = marker[1]!.trim().slice(0, 240) || fallbackTitle;
    } else if (line.trim() === '') flushParagraph(paragraph, blocks);
    else paragraph.push(line);
  }
  commit();
  return chapters;
}

function safeFileName(value: string, format: TextDocumentFormat): string {
  const extension = format === 'markdown' ? '.md' : '.txt';
  const base = value.trim().replace(/\.(?:txt|md|markdown)$/iu, '');
  if (
    !base ||
    base !== path.basename(base) ||
    path.win32.basename(base) !== base ||
    base.includes('..') ||
    /[<>:"/\\|?*]/u.test(base) ||
    Array.from(base).some((character) => (character.codePointAt(0) ?? 0) < 32)
  ) {
    throw new ImportExportServiceError('EXPORT_WRITE_FAILED', 'The export file name is unsafe.');
  }
  return `${base}${extension}`;
}

async function existingFile(filePath: string): Promise<string> {
  if (!path.isAbsolute(filePath) && !path.win32.isAbsolute(filePath)) {
    throw new ImportExportServiceError(
      'IMPORT_FORMAT_UNSUPPORTED',
      'Import paths must be absolute paths selected by the desktop process.',
    );
  }
  const details = await lstat(filePath);
  if (details.isSymbolicLink() || !details.isFile()) {
    throw new ImportExportServiceError(
      'IMPORT_FORMAT_UNSUPPORTED',
      'The selected import source must be a regular file.',
    );
  }
  if (details.size > MAX_IMPORT_BYTES) {
    throw new ImportExportServiceError(
      'IMPORT_ARCHIVE_LIMIT',
      'The selected text file exceeds the 20 MiB M1 import limit.',
    );
  }
  return realpath(filePath);
}

async function existingWritableDirectory(directory: string): Promise<string> {
  if (!path.isAbsolute(directory) && !path.win32.isAbsolute(directory)) {
    throw new ImportExportServiceError(
      'EXPORT_WRITE_FAILED',
      'Export directories must be absolute paths selected by the desktop process.',
    );
  }
  const details = await lstat(directory);
  if (details.isSymbolicLink() || !details.isDirectory()) {
    throw new ImportExportServiceError(
      'EXPORT_WRITE_FAILED',
      'The export target is not a directory.',
    );
  }
  const canonical = await realpath(directory);
  await access(canonical, constants.W_OK);
  return canonical;
}

function renderText(
  versions: readonly { readonly chapterTitle: string; readonly blocks: ExportBlockRow[] }[],
): string {
  return `${versions
    .map(
      (version) =>
        `=== ${version.chapterTitle} ===\n${version.blocks
          .map((block) => (block.blockType === 'separator' ? '***' : block.text))
          .join('\n\n')
          .trim()}`,
    )
    .join('\n\n')}\n`;
}

function renderMarkdown(
  versions: readonly { readonly chapterTitle: string; readonly blocks: ExportBlockRow[] }[],
): string {
  return `${versions
    .map(
      (version) =>
        `# ${version.chapterTitle}\n\n${version.blocks
          .map((block) => {
            if (block.blockType === 'heading') return `## ${block.text}`;
            if (block.blockType === 'separator') return '---';
            return block.text;
          })
          .join('\n\n')
          .trim()}`,
    )
    .join('\n\n')}\n`;
}

export class ImportExportService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #recovery: RecoveryService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;
  readonly #readSource: (filePath: string) => Promise<Buffer>;
  readonly #writeTarget: (filePath: string, content: Buffer) => Promise<void>;
  readonly #faultInjector:
    ((stage: 'after-checkpoint' | 'during-import' | 'after-export-write') => void) | undefined;
  readonly #plans = new Map<string, StoredPlan>();

  constructor(
    workspace: ProjectWorkspaceService,
    recovery: RecoveryService,
    options: ImportExportServiceOptions = {},
  ) {
    this.#workspace = workspace;
    this.#recovery = recovery;
    this.#clock = options.clock ?? systemClock;
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#readSource = options.readSource ?? readFile;
    this.#writeTarget =
      options.writeTarget ?? ((filePath, content) => writeFile(filePath, content));
    this.#faultInjector = options.faultInjector;
  }

  async previewImport(raw: ImportPreviewInput, selectedPath: string): Promise<ImportPlan> {
    const input = ImportPreviewInputSchema.parse(raw);
    this.#workspace.assertActiveProject(input.projectId);
    const sourcePath = await existingFile(selectedPath);
    const extension = path.extname(sourcePath).toLowerCase();
    const format: TextDocumentFormat =
      extension === '.txt'
        ? 'txt'
        : ['.md', '.markdown'].includes(extension)
          ? 'markdown'
          : (() => {
              throw new ImportExportServiceError(
                'IMPORT_FORMAT_UNSUPPORTED',
                'Only TXT, MD and MARKDOWN files are supported in M1.',
              );
            })();
    const buffer = await this.#readSource(sourcePath);
    if (buffer.byteLength === 0) {
      throw new ImportExportServiceError('IMPORT_CONTENT_EMPTY', 'The selected document is empty.');
    }
    const detected = detectEncoding(buffer);
    const encoding =
      input.encoding && input.encoding !== 'auto' ? input.encoding : detected.encoding;
    const text = decode(buffer, encoding);
    if (!text.replace(/[\s\uFEFF]/gu, '')) {
      throw new ImportExportServiceError(
        'IMPORT_CONTENT_EMPTY',
        'The selected document has no text.',
      );
    }
    if (text.includes('\u0000')) {
      throw new ImportExportServiceError(
        'IMPORT_FORMAT_UNSUPPORTED',
        'The selected document contains binary null bytes.',
      );
    }
    const fallbackTitle = path.parse(sourcePath).name.slice(0, 240) || '导入章节';
    const chapters =
      format === 'markdown'
        ? parseMarkdown(text, fallbackTitle, this.#idFactory)
        : parseTxt(text, fallbackTitle, this.#idFactory);
    if (chapters.length === 0) {
      throw new ImportExportServiceError(
        'IMPORT_CONTENT_EMPTY',
        'No importable chapter was found.',
      );
    }
    const plan = ImportPlanSchema.parse({
      planId: this.#idFactory(),
      projectId: input.projectId,
      fileName: path.basename(sourcePath),
      format,
      detectedEncoding: encoding,
      confidence: input.encoding && input.encoding !== 'auto' ? 'high' : detected.confidence,
      encodingCandidates: detected.candidates.includes(encoding)
        ? detected.candidates
        : [encoding, ...detected.candidates].slice(0, 4),
      sourceSha256: sha256(buffer),
      chapters,
      warnings:
        !input.encoding && detected.confidence === 'low'
          ? ['编码置信度较低，请手动选择编码后重新预览。']
          : [],
    });
    this.#plans.set(plan.planId, {
      plan,
      sourcePath,
      createdAtMs: this.#clock.now().getTime(),
    });
    return plan;
  }

  async commitImport(requestId: string, raw: ImportCommitInput): Promise<ImportCommitResult> {
    const input = ImportCommitInputSchema.parse(raw);
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
    const chapters = input.chapters.map((chapter) => ImportPlanChapterSchema.parse(chapter));
    if (new Set(chapters.map((chapter) => chapter.title)).size !== chapters.length) {
      throw new ImportExportServiceError(
        'IMPORT_COMMIT_FAILED',
        'Imported chapter titles must be unique inside the new volume.',
      );
    }
    const checkpoint = await this.#recovery.createOperationCheckpoint(this.#idFactory(), {
      projectId: input.projectId,
      operation: 'import',
    });
    this.#faultInjector?.('after-checkpoint');
    const now = this.#clock.now().toISOString();
    const volumeId = this.#idFactory();
    const chapterIds: string[] = [];
    const draftIds: string[] = [];
    const versionIds: string[] = [];
    try {
      await this.#workspace.writeProject(requestId, input.projectId, (database) => {
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
           VALUES(?, ?, 'active', 0, ?, ?)`,
        );
        const activateDraft = database.prepare(
          'UPDATE chapters SET active_draft_id = ? WHERE id = ?',
        );
        const insertDraftBlock = database.prepare(
          `INSERT INTO draft_blocks(
             id, draft_id, logical_block_id, order_key, block_type, text,
             attributes_json, source, locked, content_hash, revision
           ) VALUES(?, ?, ?, ?, ?, ?, '{}', 'imported', 0, ?, 0)`,
        );
        const insertVersion = database.prepare(
          `INSERT INTO versions(
             id, chapter_id, source_draft_id, source_revision, title, description,
             label, word_count, content_hash, created_at
           ) VALUES(?, ?, ?, 0, '导入基线', '由M1文本导入创建', 'import', ?, ?, ?)`,
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
          const versionBlocks: ImportedVersionBlock[] = chapter.blocks.map((block, blockIndex) => {
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
          });
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
          this.#faultInjector?.('during-import');
        });
        database
          .prepare('UPDATE projects SET updated_at = ? WHERE id = ?')
          .run(now, input.projectId);
      });
    } catch (error) {
      throw new ImportExportServiceError(
        'IMPORT_COMMIT_FAILED',
        'The import transaction failed and was rolled back.',
        { cause: error },
      );
    }
    this.#plans.delete(input.planId);
    return ImportCommitResultSchema.parse({
      projectId: input.projectId,
      checkpointId: checkpoint.backupId,
      volumeId,
      chapterIds,
      draftIds,
      versionIds,
      importedChapterCount: chapterIds.length,
    });
  }

  listExportVersions(projectId: string): ExportVersionCatalog {
    this.#workspace.assertActiveProject(projectId);
    return this.#workspace.readProject(projectId, (database) => {
      const rows = database
        .prepare(
          `SELECT v.id AS versionId, vo.id AS volumeId, vo.title AS volumeTitle,
                  c.id AS chapterId, c.title AS chapterTitle, v.title AS versionTitle,
                  v.word_count AS wordCount, v.created_at AS createdAt,
                  CASE WHEN c.final_version_id = v.id THEN 1 ELSE 0 END AS finalized,
                  vo.order_key AS volumeOrder, c.order_key AS chapterOrder
             FROM versions v
             JOIN chapters c ON c.id = v.chapter_id
             JOIN volumes vo ON vo.id = c.volume_id
            WHERE vo.project_id = ? AND vo.deleted_at IS NULL AND c.deleted_at IS NULL
            ORDER BY vo.order_key, c.order_key, v.created_at DESC, v.id DESC`,
        )
        .all(projectId) as unknown as ExportVersionRow[];
      return ExportVersionCatalogSchema.parse({
        projectId,
        versions: rows.map((row) => ({
          versionId: row.versionId,
          volumeId: row.volumeId,
          volumeTitle: row.volumeTitle,
          chapterId: row.chapterId,
          chapterTitle: row.chapterTitle,
          versionTitle: row.versionTitle,
          wordCount: Number(row.wordCount),
          finalized: Number(row.finalized) === 1,
          createdAt: row.createdAt,
        })),
      });
    });
  }

  async exportVersions(
    raw: ExportVersionsInput,
    selectedDirectory: string,
  ): Promise<ExportVersionsResult> {
    const input = ExportVersionsInputSchema.parse(raw);
    if (new Set(input.versionIds).size !== input.versionIds.length) {
      throw new ImportExportServiceError(
        'EXPORT_VERSION_REQUIRED',
        'Each selected Version may appear only once.',
      );
    }
    const directory = await existingWritableDirectory(selectedDirectory);
    const fileName = safeFileName(input.fileName, input.format);
    const finalPath = path.join(directory, fileName);
    try {
      await stat(finalPath);
      throw new ImportExportServiceError(
        'EXPORT_TARGET_EXISTS',
        'The export target already exists and will not be overwritten.',
      );
    } catch (error) {
      if (error instanceof ImportExportServiceError) throw error;
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    const versions = this.#workspace.readProject(input.projectId, (database) => {
      const rows = database
        .prepare(
          `SELECT v.id AS versionId, vo.id AS volumeId, vo.title AS volumeTitle,
                  c.id AS chapterId, c.title AS chapterTitle, v.title AS versionTitle,
                  v.word_count AS wordCount, v.created_at AS createdAt,
                  CASE WHEN c.final_version_id = v.id THEN 1 ELSE 0 END AS finalized,
                  vo.order_key AS volumeOrder, c.order_key AS chapterOrder
             FROM versions v
             JOIN chapters c ON c.id = v.chapter_id
             JOIN volumes vo ON vo.id = c.volume_id
            WHERE vo.project_id = ? AND v.id IN (${input.versionIds.map(() => '?').join(',')})
            ORDER BY vo.order_key, c.order_key, v.created_at, v.id`,
        )
        .all(input.projectId, ...input.versionIds) as unknown as ExportVersionRow[];
      if (rows.length !== input.versionIds.length) {
        throw new ImportExportServiceError(
          'EXPORT_VERSION_REQUIRED',
          'One or more selected Versions do not belong to the active project.',
        );
      }
      return rows.map((row) => ({
        chapterTitle: row.chapterTitle,
        blocks: database
          .prepare(
            `SELECT block_type AS blockType, text, order_key AS orderKey
               FROM version_blocks WHERE version_id = ? ORDER BY order_key`,
          )
          .all(row.versionId) as unknown as ExportBlockRow[],
      }));
    });
    const content = Buffer.from(
      input.format === 'markdown' ? renderMarkdown(versions) : renderText(versions),
      'utf8',
    );
    const temporaryPath = path.join(directory, `.${fileName}.tmp-${this.#idFactory()}`);
    try {
      await this.#writeTarget(temporaryPath, content);
      this.#faultInjector?.('after-export-write');
      const written = await readFile(temporaryPath);
      if (sha256(written) !== sha256(content)) {
        throw new ImportExportServiceError(
          'EXPORT_WRITE_FAILED',
          'The temporary export failed content verification.',
        );
      }
      await rename(temporaryPath, finalPath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      if (error instanceof ImportExportServiceError) throw error;
      throw new ImportExportServiceError(
        'EXPORT_WRITE_FAILED',
        'The export could not be written atomically.',
        { cause: error },
      );
    }
    return ExportVersionsResultSchema.parse({
      projectId: input.projectId,
      versionIds: input.versionIds,
      format: input.format,
      fileName,
      filePath: finalPath,
      sizeBytes: content.byteLength,
      sha256: sha256(content),
    });
  }
}
