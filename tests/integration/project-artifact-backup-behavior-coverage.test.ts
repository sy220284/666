import { randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { RecoveryService } from '../../packages/core-service/src/recovery.js';
import { ResearchService } from '../../packages/core-service/src/research-service.js';
import { createRecoveryRuntime } from '../../packages/core-service/src/recovery/backup-manifest.js';
import {
  finalizeArtifactBackup,
  removeArtifactBackup,
  restoreArtifactBackup,
} from '../../packages/core-service/src/recovery/project-artifact-backup.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-08-16T08:00:00.000Z') };

interface MutableArtifactManifest {
  schemaVersion: number;
  projectId: string;
  backupId: string;
  files: unknown[];
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

async function harness() {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-artifact-backup-coverage-'));
  temporaryDirectories.push(root);
  const projectParent = path.join(root, 'projects');
  const backupRoot = path.join(root, 'backups');
  await mkdir(projectParent, { recursive: true });

  const appRuntime = await openAppRuntime({
    databasePath: path.join(root, 'app.sqlite'),
    migrationsDirectory: 'migrations/app',
    recoveryDirectory: path.join(root, 'app-recovery'),
    appVersion: '0.1.0',
    clock,
  });
  const workspace = new ProjectWorkspaceService({
    projectMigrationsDirectory: 'migrations/project',
    projectMigrationRecoveryDirectory: path.join(root, 'project-migration-recovery'),
    appVersion: '0.1.0',
    recentProjects: appRuntime.recentProjects,
    clock,
  });
  const research = new ResearchService(workspace, { clock });
  const recovery = new RecoveryService(workspace, { backupRootDirectory: backupRoot, clock });
  const project = await workspace.create(
    randomUUID(),
    { name: '恢复附件边界测试', channel: '长篇' },
    projectParent,
  );
  const notes = await research.createNote(randomUUID(), {
    projectId: project.projectId,
    title: '附件恢复资料',
    body: '',
    sourceUri: null,
    tags: [],
  });
  const note = notes.notes.find((candidate) => candidate.title === '附件恢复资料');
  if (!note) throw new Error('Research note was not created.');
  const sourcePath = path.join(root, 'artifact.txt');
  await writeFile(sourcePath, 'artifact-integrity-0001', 'utf8');
  const catalog = await research.importAttachment(
    randomUUID(),
    { projectId: project.projectId, noteId: note.id },
    sourcePath,
  );
  const attachment = catalog.attachments.find((candidate) => candidate.displayName === 'artifact.txt');
  if (!attachment) throw new Error('Research attachment was not imported.');
  const workspacePath = workspace.assertActiveProject(project.projectId).workspacePath;
  const runtime = createRecoveryRuntime(workspace, { backupRootDirectory: backupRoot, clock });

  return {
    root,
    backupRoot,
    appRuntime,
    workspace,
    recovery,
    project,
    attachment,
    workspacePath,
    runtime,
  };
}

type Harness = Awaited<ReturnType<typeof harness>>;

async function withHarness(run: (value: Harness) => Promise<void>): Promise<void> {
  const value = await harness();
  try {
    await run(value);
  } finally {
    await value.workspace.shutdown();
    await value.appRuntime.close();
  }
}

function bundlePath(value: Harness, backupId: string): string {
  return path.join(value.backupRoot, value.project.projectId, `${backupId}.artifacts`);
}

function manifestPath(value: Harness, backupId: string): string {
  return path.join(value.backupRoot, value.project.projectId, `${backupId}.artifacts.json`);
}

function artifactPath(root: string, relativePath: string): string {
  return path.join(root, ...relativePath.split('/'));
}

async function readManifest(filePath: string): Promise<MutableArtifactManifest> {
  return JSON.parse(await readFile(filePath, 'utf8')) as MutableArtifactManifest;
}

async function writeManifest(filePath: string, manifest: MutableArtifactManifest): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function assertNoArtifactPartials(value: Harness, backupId: string): Promise<void> {
  const entries = await readdir(path.join(value.backupRoot, value.project.projectId));
  expect(entries.some((entry) => entry.includes(`${backupId}.artifacts.partial-`))).toBe(false);
  expect(entries.some((entry) => entry.includes(`${backupId}.artifacts.json.partial-`))).toBe(false);
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('project artifact backup failure boundaries', () => {
  it('restores verified bytes atomically and leaves no restore partial behind', async () => {
    await withHarness(async (value) => {
      const checkpoint = await value.recovery.createOperationCheckpoint(randomUUID(), {
        projectId: value.project.projectId,
        operation: 'replace',
      });
      const target = path.join(value.root, 'direct-restore');

      await restoreArtifactBackup(value.runtime, checkpoint, target);

      const restored = artifactPath(target, value.attachment.managedRelativePath);
      expect(await readFile(restored, 'utf8')).toBe('artifact-integrity-0001');
      expect(
        (await readdir(path.dirname(restored))).some((entry) => entry.includes('.restore-partial-')),
      ).toBe(false);
    });
  });

  it('rejects malformed, duplicate, unsafe and identity-mismatched manifests before writing files', async () => {
    await withHarness(async (value) => {
      const checkpoint = await value.recovery.createOperationCheckpoint(randomUUID(), {
        projectId: value.project.projectId,
        operation: 'replace',
      });
      const manifestFile = manifestPath(value, checkpoint.backupId);
      const original = await readManifest(manifestFile);
      const first = original.files[0] as Record<string, unknown> | undefined;
      if (!first) throw new Error('Expected an artifact manifest entry.');

      const cases: readonly {
        readonly name: string;
        readonly code: string;
        readonly mutate: (manifest: MutableArtifactManifest) => void;
      }[] = [
        {
          name: 'malformed-entry',
          code: 'RESTORE_SOURCE_INVALID',
          mutate: (manifest) => {
            manifest.files = [null];
          },
        },
        {
          name: 'duplicate-artifact-id',
          code: 'RESTORE_SOURCE_INVALID',
          mutate: (manifest) => {
            manifest.files.push({
              ...first,
              relativePath: `${String(first.relativePath)}.duplicate`,
            });
          },
        },
        {
          name: 'duplicate-relative-path',
          code: 'RESTORE_SOURCE_INVALID',
          mutate: (manifest) => {
            manifest.files.push({ ...first, artifactId: randomUUID() });
          },
        },
        {
          name: 'unsafe-relative-path',
          code: 'BACKUP_VERIFY_FAILED',
          mutate: (manifest) => {
            (manifest.files[0] as Record<string, unknown>).relativePath = '../escape.txt';
          },
        },
        {
          name: 'identity-mismatch',
          code: 'RESTORE_SOURCE_INVALID',
          mutate: (manifest) => {
            manifest.projectId = randomUUID();
          },
        },
      ];

      for (const item of cases) {
        const manifest = structuredClone(original);
        item.mutate(manifest);
        await writeManifest(manifestFile, manifest);
        const target = path.join(value.root, `restore-${item.name}`);
        await expect(restoreArtifactBackup(value.runtime, checkpoint, target)).rejects.toMatchObject({
          code: item.code,
        });
        expect(await exists(target)).toBe(false);
      }
    });
  });

  it('rejects same-size tampering before any destination artifact is published', async () => {
    await withHarness(async (value) => {
      const checkpoint = await value.recovery.createOperationCheckpoint(randomUUID(), {
        projectId: value.project.projectId,
        operation: 'replace',
      });
      const backedUp = artifactPath(
        bundlePath(value, checkpoint.backupId),
        value.attachment.managedRelativePath,
      );
      const original = await readFile(backedUp);
      const tampered = Buffer.from(original);
      tampered[0] = tampered[0] === 65 ? 66 : 65;
      await writeFile(backedUp, tampered);
      const target = path.join(value.root, 'tampered-restore');

      await expect(restoreArtifactBackup(value.runtime, checkpoint, target)).rejects.toMatchObject({
        code: 'RESTORE_SOURCE_INVALID',
      });
      expect(await exists(target)).toBe(false);
    });
  });

  it.skipIf(process.platform === 'win32')(
    'rejects a symbolic-link backup artifact even when its target contains the expected bytes',
    async () => {
      await withHarness(async (value) => {
        const checkpoint = await value.recovery.createOperationCheckpoint(randomUUID(), {
          projectId: value.project.projectId,
          operation: 'replace',
        });
        const backedUp = artifactPath(
          bundlePath(value, checkpoint.backupId),
          value.attachment.managedRelativePath,
        );
        const expectedBytes = await readFile(backedUp);
        const linkTarget = path.join(value.root, 'symlink-target.txt');
        await writeFile(linkTarget, expectedBytes);
        await rm(backedUp, { force: true });
        await symlink(linkTarget, backedUp);

        await expect(
          restoreArtifactBackup(value.runtime, checkpoint, path.join(value.root, 'symlink-restore')),
        ).rejects.toMatchObject({ code: 'RESTORE_SOURCE_INVALID' });
      });
    },
  );

  it('skips artifact restoration for backups created before artifact bundles existed', async () => {
    await withHarness(async (value) => {
      const checkpoint = await value.recovery.createOperationCheckpoint(randomUUID(), {
        projectId: value.project.projectId,
        operation: 'replace',
      });
      await removeArtifactBackup(value.backupRoot, value.project.projectId, checkpoint.backupId);
      const target = path.join(value.root, 'legacy-restore');

      await expect(
        restoreArtifactBackup(value.runtime, { ...checkpoint, schemaVersion: 34 }, target),
      ).resolves.toBeUndefined();
      expect(await exists(target)).toBe(false);
    });
  });

  it('fails finalization when a live attachment drifts and removes every partial artifact bundle', async () => {
    await withHarness(async (value) => {
      const checkpoint = await value.recovery.createOperationCheckpoint(randomUUID(), {
        projectId: value.project.projectId,
        operation: 'replace',
      });
      await removeArtifactBackup(value.backupRoot, value.project.projectId, checkpoint.backupId);
      const liveArtifact = artifactPath(value.workspacePath, value.attachment.managedRelativePath);
      const original = await readFile(liveArtifact);
      const changed = Buffer.from(original);
      changed[0] = changed[0] === 65 ? 66 : 65;
      await writeFile(liveArtifact, changed);

      await expect(finalizeArtifactBackup(value.runtime, checkpoint)).rejects.toMatchObject({
        code: 'BACKUP_VERIFY_FAILED',
      });
      expect(await exists(bundlePath(value, checkpoint.backupId))).toBe(false);
      expect(await exists(manifestPath(value, checkpoint.backupId))).toBe(false);
      await assertNoArtifactPartials(value, checkpoint.backupId);
    });
  });

  it('rolls back finalized artifact files if the backup database record disappears mid-finalization', async () => {
    await withHarness(async (value) => {
      const checkpoint = await value.recovery.createOperationCheckpoint(randomUUID(), {
        projectId: value.project.projectId,
        operation: 'replace',
      });
      await removeArtifactBackup(value.backupRoot, value.project.projectId, checkpoint.backupId);
      await value.workspace.writeProject(randomUUID(), value.project.projectId, (database) => {
        database
          .prepare('DELETE FROM backup_records WHERE id = ? AND project_id = ?')
          .run(checkpoint.backupId, value.project.projectId);
      });

      await expect(finalizeArtifactBackup(value.runtime, checkpoint)).rejects.toMatchObject({
        code: 'BACKUP_VERIFY_FAILED',
      });
      expect(await exists(bundlePath(value, checkpoint.backupId))).toBe(false);
      expect(await exists(manifestPath(value, checkpoint.backupId))).toBe(false);
      await assertNoArtifactPartials(value, checkpoint.backupId);
    });
  });

  it('removes artifact bundle and manifest idempotently', async () => {
    await withHarness(async (value) => {
      const checkpoint = await value.recovery.createOperationCheckpoint(randomUUID(), {
        projectId: value.project.projectId,
        operation: 'replace',
      });
      const bundle = bundlePath(value, checkpoint.backupId);
      const manifest = manifestPath(value, checkpoint.backupId);
      expect(await exists(bundle)).toBe(true);
      expect(await exists(manifest)).toBe(true);

      await removeArtifactBackup(value.backupRoot, value.project.projectId, checkpoint.backupId);
      await removeArtifactBackup(value.backupRoot, value.project.projectId, checkpoint.backupId);

      expect(await exists(bundle)).toBe(false);
      expect(await exists(manifest)).toBe(false);
    });
  });
});
