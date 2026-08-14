import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { BackupRecordSchema, type BackupRecord } from '@worldforge/contracts';

import { RecoveryServiceError, rewriteBackupMetadata, type RecoveryRuntime } from './backup-manifest.js';

interface ArtifactManifestEntry {
  readonly artifactId: string;
  readonly artifactType: 'research_attachment';
  readonly relativePath: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

interface ArtifactBackupManifest {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly backupId: string;
  readonly files: readonly ArtifactManifestEntry[];
}

function bundleDirectory(root: string, projectId: string, backupId: string): string {
  return path.join(root, projectId, `${backupId}.artifacts`);
}

function manifestPath(root: string, projectId: string, backupId: string): string {
  return path.join(root, projectId, `${backupId}.artifacts.json`);
}

function safeRelativePath(value: string): string {
  const normalized = value.replaceAll('\\', '/');
  if (
    normalized.length === 0 ||
    normalized.startsWith('/') ||
    normalized.includes('\0') ||
    normalized.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    throw new RecoveryServiceError('BACKUP_VERIFY_FAILED', 'Managed artifact path is unsafe.');
  }
  return normalized;
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

function parseManifest(raw: unknown): ArtifactBackupManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new RecoveryServiceError('RESTORE_SOURCE_INVALID', 'Artifact manifest is invalid.');
  }
  const value = raw as Record<string, unknown>;
  if (
    value.schemaVersion !== 1 ||
    typeof value.projectId !== 'string' ||
    typeof value.backupId !== 'string' ||
    !Array.isArray(value.files)
  ) {
    throw new RecoveryServiceError('RESTORE_SOURCE_INVALID', 'Artifact manifest is invalid.');
  }
  const files = value.files.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new RecoveryServiceError('RESTORE_SOURCE_INVALID', 'Artifact manifest entry is invalid.');
    }
    const item = entry as Record<string, unknown>;
    if (
      typeof item.artifactId !== 'string' ||
      item.artifactId.length === 0 ||
      item.artifactType !== 'research_attachment' ||
      typeof item.relativePath !== 'string' ||
      typeof item.mediaType !== 'string' ||
      item.mediaType.length === 0 ||
      item.mediaType.length > 255 ||
      typeof item.sizeBytes !== 'number' ||
      !Number.isSafeInteger(item.sizeBytes) ||
      item.sizeBytes < 0 ||
      typeof item.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(item.sha256)
    ) {
      throw new RecoveryServiceError('RESTORE_SOURCE_INVALID', 'Artifact manifest entry is invalid.');
    }
    return {
      artifactId: item.artifactId,
      artifactType: 'research_attachment' as const,
      relativePath: safeRelativePath(item.relativePath),
      mediaType: item.mediaType,
      sizeBytes: item.sizeBytes,
      sha256: item.sha256,
    };
  });
  if (
    new Set(files.map((entry) => entry.relativePath)).size !== files.length ||
    new Set(files.map((entry) => entry.artifactId)).size !== files.length
  ) {
    throw new RecoveryServiceError('RESTORE_SOURCE_INVALID', 'Artifact manifest contains duplicates.');
  }
  return { schemaVersion: 1, projectId: value.projectId, backupId: value.backupId, files };
}

function readSnapshotArtifacts(databasePath: string, projectId: string): ArtifactManifestEntry[] {
  const database = new DatabaseSync(databasePath, {
    readOnly: true,
    timeout: 5_000,
    enableForeignKeyConstraints: true,
    allowExtension: false,
    readBigInts: true,
  });
  try {
    const rows = database
      .prepare(
        `SELECT id AS artifactId, managed_relative_path AS relativePath,
                media_type AS mediaType, size_bytes AS sizeBytes, content_hash AS sha256
           FROM research_attachments WHERE project_id = ?
          ORDER BY managed_relative_path, id`,
      )
      .all(projectId);
    return rows.map((row) => {
      const artifactId = String(row.artifactId);
      const relativePath = safeRelativePath(String(row.relativePath));
      const mediaType = String(row.mediaType);
      const sizeBytes = Number(row.sizeBytes);
      const sha256 = String(row.sha256);
      if (
        artifactId.length === 0 ||
        mediaType.length === 0 ||
        mediaType.length > 255 ||
        !Number.isSafeInteger(sizeBytes) ||
        sizeBytes < 0 ||
        !/^[0-9a-f]{64}$/u.test(sha256)
      ) {
        throw new RecoveryServiceError('BACKUP_VERIFY_FAILED', 'Snapshot artifact metadata is invalid.');
      }
      return {
        artifactId,
        artifactType: 'research_attachment' as const,
        relativePath,
        mediaType,
        sizeBytes,
        sha256,
      };
    });
  } finally {
    database.close();
  }
}

async function verifyLiveArtifact(
  runtime: RecoveryRuntime,
  projectId: string,
  entry: ArtifactManifestEntry,
): Promise<string> {
  const filePath = await runtime.workspace.resolveProjectPath(projectId, entry.relativePath);
  const details = await lstat(filePath).catch((error: unknown) => {
    throw new RecoveryServiceError('BACKUP_VERIFY_FAILED', 'Managed artifact is missing.', { cause: error });
  });
  if (!details.isFile() || details.isSymbolicLink() || details.size !== entry.sizeBytes) {
    throw new RecoveryServiceError('BACKUP_VERIFY_FAILED', 'Managed artifact no longer matches the database snapshot.');
  }
  if ((await hashFile(filePath)) !== entry.sha256) {
    throw new RecoveryServiceError('BACKUP_VERIFY_FAILED', 'Managed artifact changed during backup creation.');
  }
  return filePath;
}

export async function finalizeArtifactBackup(
  runtime: RecoveryRuntime,
  record: BackupRecord,
): Promise<BackupRecord> {
  const projectDirectory = path.join(runtime.backupRootDirectory, record.projectId);
  const databaseBackupPath = path.join(projectDirectory, record.backupFileName);
  const files = readSnapshotArtifacts(databaseBackupPath, record.projectId);
  const finalBundle = bundleDirectory(runtime.backupRootDirectory, record.projectId, record.backupId);
  const finalManifest = manifestPath(runtime.backupRootDirectory, record.projectId, record.backupId);
  const partialBundle = `${finalBundle}.partial-${runtime.idFactory()}`;
  const partialManifest = `${finalManifest}.partial-${runtime.idFactory()}`;
  let bundleCreated = false;
  let manifestCreated = false;
  try {
    await rm(partialBundle, { recursive: true, force: true });
    await mkdir(partialBundle, { recursive: true, mode: 0o700 });
    for (const entry of files) {
      const source = await verifyLiveArtifact(runtime, record.projectId, entry);
      const destination = path.join(partialBundle, ...entry.relativePath.split('/'));
      await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      await copyFile(source, destination);
      const copied = await stat(destination);
      if (copied.size !== entry.sizeBytes || (await hashFile(destination)) !== entry.sha256) {
        throw new RecoveryServiceError('BACKUP_VERIFY_FAILED', 'Copied managed artifact failed verification.');
      }
    }

    const manifest: ArtifactBackupManifest = {
      schemaVersion: 1,
      projectId: record.projectId,
      backupId: record.backupId,
      files,
    };
    await writeFile(partialManifest, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    await rm(finalBundle, { recursive: true, force: true });
    await rm(finalManifest, { force: true });
    await rename(partialBundle, finalBundle);
    bundleCreated = true;
    await rename(partialManifest, finalManifest);
    manifestCreated = true;

    const totalArtifactBytes = files.reduce((total, file) => total + file.sizeBytes, 0);
    const updated = BackupRecordSchema.parse({ ...record, sizeBytes: record.sizeBytes + totalArtifactBytes });
    await runtime.workspace.writeProject(runtime.idFactory(), record.projectId, (database) => {
      const changed = database
        .prepare('UPDATE backup_records SET size_bytes = ? WHERE id = ? AND project_id = ?')
        .run(updated.sizeBytes, record.backupId, record.projectId);
      if (Number(changed.changes) !== 1) {
        throw new RecoveryServiceError('BACKUP_VERIFY_FAILED', 'Backup record disappeared during artifact finalization.');
      }
    });
    await rewriteBackupMetadata(runtime, updated);
    return updated;
  } catch (error) {
    if (bundleCreated) await rm(finalBundle, { recursive: true, force: true });
    if (manifestCreated) await rm(finalManifest, { force: true });
    throw error;
  } finally {
    await rm(partialBundle, { recursive: true, force: true });
    await rm(partialManifest, { force: true });
  }
}

export async function restoreArtifactBackup(
  runtime: RecoveryRuntime,
  record: BackupRecord,
  targetWorkspacePath: string,
): Promise<void> {
  if (record.schemaVersion < 35) return;
  const sourceManifest = manifestPath(runtime.backupRootDirectory, record.projectId, record.backupId);
  const sourceBundle = bundleDirectory(runtime.backupRootDirectory, record.projectId, record.backupId);
  let manifest: ArtifactBackupManifest;
  try {
    manifest = parseManifest(JSON.parse(await readFile(sourceManifest, 'utf8')) as unknown);
  } catch (error) {
    if (error instanceof RecoveryServiceError) throw error;
    throw new RecoveryServiceError('RESTORE_SOURCE_INVALID', 'Artifact manifest is missing or unreadable.', {
      cause: error,
    });
  }
  if (manifest.projectId !== record.projectId || manifest.backupId !== record.backupId) {
    throw new RecoveryServiceError('RESTORE_SOURCE_INVALID', 'Artifact manifest identity does not match backup.');
  }

  for (const entry of manifest.files) {
    const source = path.join(sourceBundle, ...entry.relativePath.split('/'));
    const sourceDetails = await lstat(source).catch((error: unknown) => {
      throw new RecoveryServiceError('RESTORE_SOURCE_INVALID', 'Backed-up artifact is missing.', { cause: error });
    });
    if (!sourceDetails.isFile() || sourceDetails.isSymbolicLink() || sourceDetails.size !== entry.sizeBytes) {
      throw new RecoveryServiceError('RESTORE_SOURCE_INVALID', 'Backed-up artifact metadata does not match.');
    }
    if ((await hashFile(source)) !== entry.sha256) {
      throw new RecoveryServiceError('RESTORE_SOURCE_INVALID', 'Backed-up artifact hash does not match.');
    }
  }

  for (const entry of manifest.files) {
    const source = path.join(sourceBundle, ...entry.relativePath.split('/'));
    const destination = path.resolve(targetWorkspacePath, ...entry.relativePath.split('/'));
    const relative = path.relative(path.resolve(targetWorkspacePath), destination);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new RecoveryServiceError('RESTORE_VERIFY_FAILED', 'Artifact restore path escaped the project workspace.');
    }
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    const partial = `${destination}.restore-partial-${runtime.idFactory()}`;
    try {
      await copyFile(source, partial);
      if ((await hashFile(partial)) !== entry.sha256 || (await stat(partial)).size !== entry.sizeBytes) {
        throw new RecoveryServiceError('RESTORE_VERIFY_FAILED', 'Restored artifact failed verification.');
      }
      await rename(partial, destination);
    } finally {
      await rm(partial, { force: true });
    }
  }
}

export async function removeArtifactBackup(
  backupRootDirectory: string,
  projectId: string,
  backupId: string,
): Promise<void> {
  await Promise.all([
    rm(bundleDirectory(backupRootDirectory, projectId, backupId), { recursive: true, force: true }),
    rm(manifestPath(backupRootDirectory, projectId, backupId), { force: true }),
  ]);
}
