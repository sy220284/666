import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  readBackupMetadata,
  type RecoveryRuntime,
} from '../../packages/core-service/src/recovery/backup-manifest.js';

const temporaryDirectories: string[] = [];
const projectId = '00000000-0000-4000-8000-000000000001';
const backupId = '00000000-0000-4000-8000-000000000002';

function legacyMetadata() {
  return {
    backupId,
    projectId,
    operation: 'manual-protection',
    backupFileName: 'legacy.sqlite',
    sizeBytes: 42,
    sha256: 'a'.repeat(64),
    createdAt: '2026-07-01T00:00:00.000Z',
    verifiedAt: '2026-07-01T00:00:01.000Z',
  };
}

async function fixture(idFactory: () => string) {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-backup-metadata-'));
  temporaryDirectories.push(root);
  const directory = path.join(root, projectId);
  await mkdir(directory, { recursive: true });
  const metadataPath = path.join(directory, `${backupId}.json`);
  await writeFile(metadataPath, `${JSON.stringify(legacyMetadata(), null, 2)}\n`, 'utf8');
  const runtime = {
    backupRootDirectory: root,
    idFactory,
  } as unknown as RecoveryRuntime;
  return { runtime, metadataPath };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('legacy backup metadata compatibility', () => {
  it('returns the legacy record and atomically rewrites the current metadata shape', async () => {
    const { runtime, metadataPath } = await fixture(() => 'normalize-success');

    await expect(readBackupMetadata(runtime, projectId)).resolves.toEqual([
      expect.objectContaining({
        backupId,
        projectId,
        track: 'named',
        displayName: '历史手动恢复点',
        authorProtected: true,
        migrationProtected: false,
        schemaVersion: 0,
        protectionReasons: [],
      }),
    ]);

    const normalized = JSON.parse(await readFile(metadataPath, 'utf8')) as Record<string, unknown>;
    expect(normalized).toMatchObject({
      backupId,
      projectId,
      track: 'named',
      displayName: '历史手动恢复点',
      note: null,
      authorProtected: true,
      migrationProtected: false,
      schemaVersion: 0,
      protectionReasons: [],
      sourceWorkspaceName: 'WorldForge',
    });
  });

  it('keeps the original metadata usable when normalization cannot create its temporary file', async () => {
    const { runtime, metadataPath } = await fixture(() => 'collision');
    const original = await readFile(metadataPath, 'utf8');
    await writeFile(`${metadataPath}.normalize-collision`, 'occupied', 'utf8');

    await expect(readBackupMetadata(runtime, projectId)).resolves.toHaveLength(1);
    expect(await readFile(metadataPath, 'utf8')).toBe(original);
  });
});
