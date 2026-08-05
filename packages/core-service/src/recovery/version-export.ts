import { lstat, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  RecoveryExportInputSchema,
  RecoveryVersionExportSchema,
  type RecoveryExportInput,
  type RecoveryVersionExport,
} from '@worldforge/contracts';

import {
  RecoveryServiceError,
  existingWritableDirectory,
  hashFile,
  isMissing,
  type RecoveryRuntime,
} from './backup-manifest.js';
import { safeFileName, safeTemporaryName } from './path-name.js';

export class VersionExportOperations {
  readonly #runtime: RecoveryRuntime;

  constructor(runtime: RecoveryRuntime) {
    this.#runtime = runtime;
  }

  async exportVersion(
    raw: RecoveryExportInput,
    targetDirectory: string,
  ): Promise<RecoveryVersionExport> {
    const input = RecoveryExportInputSchema.parse(raw);
    this.#runtime.workspace.assertActiveProject(input.projectId);
    const data = this.#runtime.workspace.readProject(input.projectId, (database) => {
      const version = database
        .prepare(
          `SELECT v.id AS versionId, c.title AS chapterTitle, v.title AS versionTitle
               FROM versions v
               JOIN chapters c ON c.id = v.chapter_id
               JOIN volumes vo ON vo.id = c.volume_id
              WHERE v.id = ? AND vo.project_id = ?`,
        )
        .get(input.versionId, input.projectId) as
        { versionId: string; chapterTitle: string; versionTitle: string } | undefined;
      if (!version) {
        throw new RecoveryServiceError('EXPORT_VERSION_REQUIRED', 'The Version was not found.');
      }
      const blocks = database
        .prepare(
          `SELECT block_type AS blockType, text
               FROM version_blocks
              WHERE version_id = ?
              ORDER BY order_key`,
        )
        .all(input.versionId)
        .map((row) => ({ blockType: String(row.blockType), text: String(row.text) }));
      return { version, blocks };
    });
    const directory = await existingWritableDirectory(targetDirectory);
    const fileName = safeFileName(
      `${data.version.chapterTitle}-${data.version.versionTitle}`,
      '.txt',
    );
    const filePath = path.join(directory, fileName);
    try {
      await lstat(filePath);
      throw new RecoveryServiceError('EXPORT_TARGET_EXISTS', 'The export target already exists.');
    } catch (error) {
      if (error instanceof RecoveryServiceError) throw error;
      if (!isMissing(error)) throw error;
    }
    const content = data.blocks
      .map((block) => (block.blockType === 'separator' ? '---' : block.text))
      .join('\n\n');
    const temporaryName = safeTemporaryName(
      fileName,
      `.partial-${this.#runtime.idFactory()}`,
    );
    const temporaryPath = path.join(directory, temporaryName);
    try {
      await writeFile(temporaryPath, `${content}\n`, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
      });
      await rename(temporaryPath, filePath);
      const sha256 = await hashFile(filePath);
      const sizeBytes = (await stat(filePath)).size;
      return RecoveryVersionExportSchema.parse({
        projectId: input.projectId,
        versionId: input.versionId,
        fileName,
        filePath,
        sizeBytes,
        sha256,
      });
    } catch (error) {
      await rm(temporaryPath, { force: true });
      if (error instanceof RecoveryServiceError) throw error;
      throw new RecoveryServiceError('EXPORT_WRITE_FAILED', 'The Version could not be exported.', {
        cause: error,
      });
    }
  }
}
