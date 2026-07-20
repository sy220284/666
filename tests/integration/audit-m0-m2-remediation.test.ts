import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { CheckpointAwareRecoveryService } from '../../packages/core-service/src/checkpoint-aware-recovery.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { ReferenceAwareStructureOperationService } from '../../packages/core-service/src/reference-aware-structure-operations.js';
import { VersionService } from '../../packages/core-service/src/version.js';
import { corruptSqliteHeader } from '../../packages/testkit/src/index.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-20T13:30:00.000Z') };

interface Harness {
  readonly root: string;
  readonly projects: string;
  readonly exports: string;
  readonly backups: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly drafts: DraftService;
  readonly versions: VersionService;
  readonly recovery: CheckpointAwareRecoveryService;
  readonly operations: ReferenceAwareStructureOperationService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-audit-remediation-'));
  temporaryDirectories.push(root);
  const projects = path.join(root, 'projects');
  const exports = path.join(root, 'exports');
  const backups = path.join(root, 'operation-recovery');
  await Promise.all([
    mkdir(projects, { recursive: true }),
    mkdir(exports, { recursive: true }),
    mkdir(backups, { recursive: true }),
  ]);
  const appRuntime = await openAppRuntime({
    databasePath: path.join(root, 'app.sqlite'),
    migrationsDirectory: 'migrations/app',
    recoveryDirectory: path.join(root, 'app-recovery'),
    appVersion: '0.1.0',
    clock,
  });
  const workspace = new ProjectWorkspaceService({
    projectMigrationsDirectory: 'migrations/project',
    projectMigrationRecoveryDirectory: path.join(root, 'migration-recovery'),
    appVersion: '0.1.0',
    recentProjects: appRuntime.recentProjects,
    clock,
  });
  const recovery = new CheckpointAwareRecoveryService(workspace, {
    backupRootDirectory: backups,
    clock,
  });
  return {
    root,
    projects,
    exports,
    backups,
    appRuntime,
    workspace,
    structure: new ProjectStructureService(workspace, { clock }),
    drafts: new DraftService(workspace, { clock }),
    versions: new VersionService(workspace, { clock }),
    recovery,
    operations: new ReferenceAwareStructureOperationService(workspace),
  };
}

async function closeHarness(harness: Harness): Promise<void> {
  await harness.workspace.shutdown();
  await harness.appRuntime.close();
}

async function seedVersion(harness: Harness) {
  const project = await harness.workspace.create(
    randomUUID(),
    { name: '审计修复项目', channel: '长篇' },
    harness.projects,
  );
  const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
  const draft = await harness.drafts.open(randomUUID(), {
    projectId: project.projectId,
    chapterId: chapter.id,
  });
  const edited = await harness.drafts.applyPatch(randomUUID(), {
    projectId: project.projectId,
    chapterId: chapter.id,
    draftId: draft.draftId,
    baseRevision: draft.revision,
    operations: [
      {
        type: 'update',
        logicalBlockId: draft.blocks[0]!.logicalBlockId,
        expectedHash: draft.blocks[0]!.contentHash!,
        content: '来自已验证Checkpoint的正文',
      },
    ],
  });
  const version = await harness.versions.create(randomUUID(), {
    projectId: project.projectId,
    chapterId: chapter.id,
    draftId: edited.draftId,
    baseRevision: edited.revision,
    title: 'Checkpoint版本',
  });
  return { project, chapter, version };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M0-M2 audit remediation', () => {
  it('blocks every non-owned chapter foreign key and invalidates a stale delete plan', async () => {
    const harness = await createHarness();
    try {
      const { project, chapter } = await seedVersion(harness);
      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database.exec(`CREATE TABLE audit_chapter_links(
          id TEXT PRIMARY KEY,
          chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE SET NULL
        ) STRICT`);
        database
          .prepare('INSERT INTO audit_chapter_links(id, chapter_id) VALUES(?, ?)')
          .run(randomUUID(), chapter.id);
      });
      await harness.structure.deleteChapter(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      const trashEntry = harness.structure.listTrash(project.projectId).entries[0]!;
      const blocked = harness.operations.previewPermanentDelete({
        projectId: project.projectId,
        trashEntryId: trashEntry.id,
      });
      expect(blocked).toMatchObject({ canDelete: false });
      expect(blocked.blockers).toEqual(
        expect.arrayContaining([
          {
            kind: 'version',
            count: 1,
          },
          {
            kind: 'chapter-reference',
            count: 1,
            source: 'audit_chapter_links.chapter_id',
            deleteAction: 'SET NULL',
          },
        ]),
      );

      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database.prepare('DELETE FROM audit_chapter_links').run();
        database
          .prepare('DELETE FROM version_blocks WHERE version_id IN (SELECT id FROM versions)')
          .run();
        database.prepare('DELETE FROM versions').run();
      });
      const clear = harness.operations.previewPermanentDelete({
        projectId: project.projectId,
        trashEntryId: trashEntry.id,
      });
      expect(clear.canDelete).toBe(true);

      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database
          .prepare('INSERT INTO audit_chapter_links(id, chapter_id) VALUES(?, ?)')
          .run(randomUUID(), chapter.id);
      });
      await expect(
        harness.operations.permanentDelete(
          randomUUID(),
          {
            projectId: project.projectId,
            trashEntryId: trashEntry.id,
            planHash: clear.planHash,
            confirmationTitle: trashEntry.title,
          },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ code: 'STRUCTURE_CONFLICT' });
      expect(
        harness.workspace.readProject(project.projectId, (database) => ({
          chapterCount: Number(
            database.prepare('SELECT COUNT(*) AS count FROM chapters WHERE id = ?').get(chapter.id)
              ?.count ?? 0,
          ),
          trashCount: Number(
            database
              .prepare('SELECT COUNT(*) AS count FROM trash_entries WHERE id = ?')
              .get(trashEntry.id)?.count ?? 0,
          ),
          draftCount: Number(
            database
              .prepare('SELECT COUNT(*) AS count FROM drafts WHERE chapter_id = ?')
              .get(chapter.id)?.count ?? 0,
          ),
        })),
      ).toEqual({ chapterCount: 1, trashCount: 1, draftCount: 1 });
    } finally {
      await closeHarness(harness);
    }
  });

  it('lists and exports Versions from a verified checkpoint when project.sqlite is unreadable', async () => {
    const harness = await createHarness();
    try {
      const { project, version } = await seedVersion(harness);
      const checkpoint = await harness.recovery.createOperationCheckpoint(randomUUID(), {
        projectId: project.projectId,
        operation: 'manual-protection',
      });
      await harness.workspace.close(randomUUID(), project.projectId);
      const databasePath = path.join(project.workspacePath, 'project.sqlite');
      await corruptSqliteHeader(databasePath);
      const damagedSource = await readFile(databasePath);
      const recoveryOnly = await harness.workspace.open(randomUUID(), {
        workspacePath: project.workspacePath,
      });
      expect(recoveryOnly.readOnlyReason).toBe('integrity-failed');

      const overview = await harness.recovery.getOverview(project.projectId);
      expect(overview.exportableVersions).toEqual([
        expect.objectContaining({ versionId: version.versionId, title: 'Checkpoint版本' }),
      ]);
      const exported = await harness.recovery.exportVersion(
        { projectId: project.projectId, versionId: version.versionId },
        harness.exports,
      );
      expect(await readFile(exported.filePath, 'utf8')).toContain('来自已验证Checkpoint的正文');
      expect(await readFile(databasePath)).toEqual(damagedSource);
      expect(overview.checkpoints[0]?.backupId).toBe(checkpoint.backupId);
    } finally {
      await closeHarness(harness);
    }
  });

  it('does not expose Versions from a checkpoint whose bytes no longer match metadata', async () => {
    const harness = await createHarness();
    try {
      const { project } = await seedVersion(harness);
      const checkpoint = await harness.recovery.createOperationCheckpoint(randomUUID(), {
        projectId: project.projectId,
        operation: 'manual-protection',
      });
      await harness.workspace.close(randomUUID(), project.projectId);
      await writeFile(
        path.join(harness.backups, project.projectId, checkpoint.backupFileName),
        'tampered checkpoint',
      );
      await corruptSqliteHeader(path.join(project.workspacePath, 'project.sqlite'));
      await harness.workspace.open(randomUUID(), { workspacePath: project.workspacePath });
      const overview = await harness.recovery.getOverview(project.projectId);
      expect(overview.exportableVersions).toEqual([]);
      await expect(
        harness.recovery.exportVersion(
          { projectId: project.projectId, versionId: randomUUID() },
          harness.exports,
        ),
      ).rejects.toMatchObject({ code: 'EXPORT_VERSION_REQUIRED' });
    } finally {
      await closeHarness(harness);
    }
  });
});
