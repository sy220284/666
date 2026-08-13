import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import {
  ExportVersionCatalogSchema,
  ExportVersionsInputSchema,
  ExportVersionsResultSchema,
  type ExportVersionCatalog,
  type ExportVersionsInput,
  type ExportVersionsResult,
} from '@worldforge/contracts';

import { parseDocx } from '../docx-transfer.js';
import type { ProjectWorkspaceService } from '../project-workspace.js';
import {
  durableWrite,
  existingWritableDirectory,
  safeFileName,
  syncDirectory,
} from './export-file-policy.js';
import { renderExportContent } from './export-renderer.js';
import {
  ImportExportServiceError,
  sha256,
  type ExportBlockRow,
  type ExportVersionRow,
  type ImportExportServiceOptions,
} from './import-export-model.js';
import { sqliteResult } from '../database/sqlite-result.js';

export class ExportVersionService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #idFactory: () => string;
  readonly #writeTarget: (filePath: string, content: Buffer) => Promise<void>;
  readonly #faultInjector: ImportExportServiceOptions['faultInjector'];

  constructor(workspace: ProjectWorkspaceService, options: ImportExportServiceOptions = {}) {
    this.#workspace = workspace;
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#writeTarget = options.writeTarget ?? durableWrite;
    this.#faultInjector = options.faultInjector;
  }

  listExportVersions(projectId: string): ExportVersionCatalog {
    this.#workspace.assertActiveProject(projectId);
    return this.#workspace.readProject(projectId, (database) => {
      const rows = sqliteResult<ExportVersionRow[]>(
        database
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
          .all(projectId),
      );
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
      const rows = sqliteResult<ExportVersionRow[]>(
        database
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
          .all(input.projectId, ...input.versionIds),
      );
      if (rows.length !== input.versionIds.length) {
        throw new ImportExportServiceError(
          'EXPORT_VERSION_REQUIRED',
          'One or more selected Versions do not belong to the active project.',
        );
      }
      return rows.map((row) => ({
        chapterTitle: row.chapterTitle,
        blocks: sqliteResult<ExportBlockRow[]>(
          database
            .prepare(
              `SELECT block_type AS blockType, text, order_key AS orderKey
               FROM version_blocks WHERE version_id = ? ORDER BY order_key`,
            )
            .all(row.versionId),
        ),
      }));
    });
    const content = renderExportContent(input.format, versions);
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
      if (input.format === 'docx') {
        try {
          parseDocx(written, '导出验证', this.#idFactory);
        } catch (error) {
          throw new ImportExportServiceError(
            'EXPORT_WRITE_FAILED',
            'The temporary DOCX export failed package validation.',
            { cause: error },
          );
        }
      }
      await rename(temporaryPath, finalPath);
      await syncDirectory(directory);
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
