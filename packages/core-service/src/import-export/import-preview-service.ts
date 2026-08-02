import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  ImportPlanSchema,
  ImportPreviewInputSchema,
  type DetectedTextEncoding,
  type ImportPlan,
  type ImportPlanChapter,
  type ImportPreviewInput,
  type TextDocumentFormat,
} from '@worldforge/contracts';

import type { DatabaseClock } from '../database/index.js';
import { DocxTransferError, parseDocx } from '../docx-transfer.js';
import type { ProjectWorkspaceService } from '../project-workspace.js';
import { existingFile } from './import-file-policy.js';
import {
  ImportExportServiceError,
  sha256,
  systemClock,
  type ImportExportServiceOptions,
  type ImportPlanStore,
} from './import-export-model.js';
import { decode, detectEncoding, parseMarkdown, parseTxt } from './import-source-parser.js';

export class ImportPreviewService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;
  readonly #readSource: (filePath: string) => Promise<Buffer>;
  readonly #plans: ImportPlanStore;

  constructor(
    workspace: ProjectWorkspaceService,
    plans: ImportPlanStore,
    options: ImportExportServiceOptions = {},
  ) {
    this.#workspace = workspace;
    this.#plans = plans;
    this.#clock = options.clock ?? systemClock;
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#readSource = options.readSource ?? readFile;
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
          : extension === '.docx'
            ? 'docx'
            : (() => {
                throw new ImportExportServiceError(
                  'IMPORT_FORMAT_UNSUPPORTED',
                  'Only TXT, Markdown and DOCX files are supported.',
                );
              })();
    const buffer = await this.#readSource(sourcePath);
    if (buffer.byteLength === 0) {
      throw new ImportExportServiceError('IMPORT_CONTENT_EMPTY', 'The selected document is empty.');
    }
    const fallbackTitle = path.parse(sourcePath).name.slice(0, 240) || '导入章节';
    let detected: ReturnType<typeof detectEncoding> = {
      encoding: 'utf-8',
      confidence: 'high',
      candidates: ['utf-8'],
    };
    let encoding: DetectedTextEncoding = 'utf-8';
    let warnings: string[] = [];
    let chapters: ImportPlanChapter[];
    if (format === 'docx') {
      try {
        const parsed = parseDocx(buffer, fallbackTitle, this.#idFactory);
        chapters = parsed.chapters;
        warnings = [...parsed.warnings];
      } catch (error) {
        if (error instanceof DocxTransferError) {
          const code =
            error.code === 'archive-limit'
              ? 'IMPORT_ARCHIVE_LIMIT'
              : error.code === 'empty'
                ? 'IMPORT_CONTENT_EMPTY'
                : 'IMPORT_FORMAT_UNSUPPORTED';
          throw new ImportExportServiceError(code, error.message, { cause: error });
        }
        throw error;
      }
    } else {
      detected = detectEncoding(buffer);
      encoding = input.encoding && input.encoding !== 'auto' ? input.encoding : detected.encoding;
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
      chapters =
        format === 'markdown'
          ? parseMarkdown(text, fallbackTitle, this.#idFactory)
          : parseTxt(text, fallbackTitle, this.#idFactory);
      if (!input.encoding && detected.confidence === 'low') {
        warnings.push('编码置信度较低，请手动选择编码后重新预览。');
      }
    }
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
      warnings,
    });
    this.#plans.set(plan.planId, {
      plan,
      sourcePath,
      createdAtMs: this.#clock.now().getTime(),
    });
    return plan;
  }
}
