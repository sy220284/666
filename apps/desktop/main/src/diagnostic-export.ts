import { createHash, randomUUID } from 'node:crypto';
import { open, realpath, rename, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type {
  AppInfo,
  CoreStatus,
  DiagnosticExport,
  DiagnosticPreview,
  WindowPreferences,
} from '@worldforge/contracts';

export function createDiagnosticPreview(input: {
  readonly app: AppInfo;
  readonly core: CoreStatus;
  readonly window: WindowPreferences;
  readonly now?: Date;
}): DiagnosticPreview {
  return {
    manifest: {
      generatedAt: (input.now ?? new Date()).toISOString(),
      included: ['app-info', 'core-status', 'display-summary', 'log-metadata'],
      excluded: [
        'project-content',
        'project-database',
        'prompts',
        'provider-credentials',
        'absolute-paths',
      ],
      contentIncluded: false,
      credentialIncluded: false,
    },
    app: input.app,
    core: input.core,
    display: {
      platform: input.app.platform,
      scaleFactor: input.window.scaleFactor,
    },
    logs: {
      includedFiles: 0,
      includedEntries: 0,
      redacted: true,
    },
  };
}

export async function exportDiagnosticPreview(
  targetDirectory: string,
  preview: DiagnosticPreview,
): Promise<DiagnosticExport> {
  const canonicalDirectory = await realpath(targetDirectory);
  const directoryDetails = await stat(canonicalDirectory);
  if (!directoryDetails.isDirectory()) {
    throw new Error('DIAGNOSTIC_EXPORT_TARGET_NOT_DIRECTORY');
  }

  const timestamp = preview.manifest.generatedAt.replaceAll(/[:.]/gu, '-');
  const fileName = `worldforge-diagnostics-${timestamp}-${randomUUID().slice(0, 8)}.json`;
  if (basename(fileName) !== fileName) throw new Error('DIAGNOSTIC_EXPORT_FILE_NAME_INVALID');
  const finalPath = join(canonicalDirectory, fileName);
  const temporaryPath = `${finalPath}.tmp`;
  const bytes = Buffer.from(`${JSON.stringify(preview, null, 2)}\n`, 'utf8');
  const handle = await open(temporaryPath, 'wx', 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (error) {
    await handle.close();
    await rm(temporaryPath, { force: true });
    throw error;
  }
  await handle.close();
  try {
    await rename(temporaryPath, finalPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  return {
    fileName,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}
