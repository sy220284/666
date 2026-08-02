import { access, constants, lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';

import type { TextDocumentFormat } from '@worldforge/contracts';

import { ImportExportServiceError } from './import-export-model.js';

export function safeFileName(value: string, format: TextDocumentFormat): string {
  const extension = format === 'markdown' ? '.md' : format === 'docx' ? '.docx' : '.txt';
  const base = value.trim().replace(/\.(?:txt|md|markdown|docx)$/iu, '');
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

export async function durableWrite(filePath: string, content: Buffer): Promise<void> {
  const handle = await open(filePath, 'wx', 0o600);
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function syncDirectory(directory: string): Promise<void> {
  let handle;
  try {
    handle = await open(directory, 'r');
    await handle.sync();
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      !['EINVAL', 'ENOTSUP', 'EPERM'].includes(String(error.code))
    ) {
      throw error;
    }
  } finally {
    await handle?.close();
  }
}

export async function existingWritableDirectory(directory: string): Promise<string> {
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
