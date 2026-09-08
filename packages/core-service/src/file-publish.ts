import { constants as fsConstants } from 'node:fs';
import { copyFile, link, open, rm } from 'node:fs/promises';

function hardLinkUnavailable(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    ['EPERM', 'EOPNOTSUPP', 'ENOTSUP', 'EXDEV', 'EINVAL', 'EMLINK'].includes(String(error.code))
  );
}

async function syncFile(filePath: string): Promise<void> {
  const handle = await open(filePath, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function publishFileNoReplace(
  temporaryPath: string,
  finalPath: string,
): Promise<void> {
  try {
    await link(temporaryPath, finalPath);
  } catch (error) {
    if (!hardLinkUnavailable(error)) throw error;
    await copyFile(temporaryPath, finalPath, fsConstants.COPYFILE_EXCL);
    await syncFile(finalPath);
  }
  await rm(temporaryPath, { force: true });
}
