import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

import { ImportExportServiceError, MAX_IMPORT_BYTES } from './import-export-model.js';

export async function existingFile(filePath: string): Promise<string> {
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
