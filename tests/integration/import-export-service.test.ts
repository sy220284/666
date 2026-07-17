import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ImportExportService } from '../../packages/core-service/src/import-export.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { RecoveryService } from '../../packages/core-service/src/recovery.js';
import { VersionService } from '../../packages/core-service/src/version.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-17T04:00:00.000Z') };

async function harness(
  options: ConstructorParameters<typeof ImportExportService>[2] = {},
) {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-text-io-'));
  temporaryDirectories.push(root);
  const projectParent = path.join(root, 'projects');
  const importDirectory = path.join(root, 'imports');
  const exportDirectory = path.join(root, 'exports');
  await Promise.all([
    mkdir(projectParent, { recursive: true }),
    mkdir(importDirectory, { recursive: true }),
    mkdir(exportDirectory, { recursive: true }),
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
  const recovery = new RecoveryService(workspace, {
    backupRootDirectory: path.join(root, 'operation-recovery'),
    clock,
  });
  const service = new ImportExportService(workspace, recovery, { clock, ...options });
  const structure = new ProjectStructureService(workspace, { clock });
  const versions = new VersionService(workspace, { clock });
  const project = await workspace.create(
    randomUUID(),
    { name: '导入导出项目', channel: '长篇', initialStructure: 'blank' },
    projectParent,
  );
  return {
    root,
    importDirectory,
    exportDirectory,
    appRuntime,
    workspace,
    recovery,
    service,
    structure,
    versions,
    project,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M1-09 TXT and Markdown import/export', () => {
  it('previews without database writes, commits one atomic volume and exports selected immutable Versions', async () => {
    const value = await harness();
    try {
      const sourcePath = path.join(value.importDirectory, '旧稿.md');
      await writeFile(
        sourcePath,
        '# 第一章\n\n雨落旧站。\n\n## 夜谈\n\n“谁在那里？”\n\n---\n\n# 第二章\n\n天将破晓。\n',
        'utf8',
      );
      const before = value.structure.list(value.project.projectId);
      const plan = await value.service.previewImport(
        { projectId: value.project.projectId },
        sourcePath,
      );
      expect(plan.format).toBe('markdown');
      expect(plan.detectedEncoding).toBe('utf-8');
      expect(plan.chapters.map((chapter) => chapter.title)).toEqual(['第一章', '第二章']);
      expect(value.structure.list(value.project.projectId)).toEqual(before);
      expect(
        value.workspace.readProject(value.project.projectId, (database) =>
          Number(database.prepare('SELECT COUNT(*) AS count FROM backup_records').get()?.count ?? 0),
        ),
      ).toBe(0);

      const committed = await value.service.commitImport(randomUUID(), {
        projectId: value.project.projectId,
        planId: plan.planId,
        volumeTitle: '旧稿导入',
        chapters: plan.chapters,
      });
      expect(committed.importedChapterCount).toBe(2);
      expect(committed.versionIds).toHaveLength(2);
      expect(
        value.workspace.readProject(value.project.projectId, (database) => ({
          volumes: Number(database.prepare('SELECT COUNT(*) AS count FROM volumes').get()?.count ?? 0),
          chapters: Number(
            database.prepare('SELECT COUNT(*) AS count FROM chapters').get()?.count ?? 0,
          ),
          drafts: Number(database.prepare('SELECT COUNT(*) AS count FROM drafts').get()?.count ?? 0),
          versions: Number(
            database.prepare('SELECT COUNT(*) AS count FROM versions').get()?.count ?? 0,
          ),
          checkpoints: Number(
            database.prepare('SELECT COUNT(*) AS count FROM backup_records').get()?.count ?? 0,
          ),
        })),
      ).toEqual({ volumes: 1, chapters: 2, drafts: 2, versions: 2, checkpoints: 1 });

      const catalog = value.service.listExportVersions(value.project.projectId);
      expect(catalog.versions.map((version) => version.chapterTitle)).toEqual(['第一章', '第二章']);
      const exported = await value.service.exportVersions(
        {
          projectId: value.project.projectId,
          versionIds: catalog.versions.map((version) => version.versionId),
          format: 'markdown',
          fileName: '稳定稿',
        },
        value.exportDirectory,
      );
      const text = await readFile(exported.filePath, 'utf8');
      expect(text).toContain('# 第一章');
      expect(text).toContain('## 夜谈');
      expect(text).toContain('# 第二章');
      expect(exported.sha256).toMatch(/^[a-f0-9]{64}$/u);
      await expect(
        value.service.exportVersions(
          {
            projectId: value.project.projectId,
            versionIds: catalog.versions.map((version) => version.versionId),
            format: 'markdown',
            fileName: '稳定稿',
          },
          value.exportDirectory,
        ),
      ).rejects.toMatchObject({ code: 'EXPORT_TARGET_EXISTS' });
      expect((await readdir(value.exportDirectory)).filter((name) => name.includes('.tmp-'))).toEqual(
        [],
      );
    } finally {
      await value.workspace.shutdown();
      await value.appRuntime.close();
    }
  });

  it('supports UTF-16 and GB18030 manual decoding and rejects stale plans or empty documents', async () => {
    const value = await harness();
    try {
      const utf16Path = path.join(value.importDirectory, 'utf16.txt');
      await writeFile(
        utf16Path,
        Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('=== 第一章 ===\n中文正文', 'utf16le')]),
      );
      const utf16Plan = await value.service.previewImport(
        { projectId: value.project.projectId },
        utf16Path,
      );
      expect(utf16Plan.detectedEncoding).toBe('utf-16le');
      expect(utf16Plan.chapters[0]?.blocks[0]?.text).toContain('中文正文');

      const gbPath = path.join(value.importDirectory, 'gb.txt');
      const gbBytes = new TextEncoder().encode('=== 第一章 ===\n旧稿正文');
      await writeFile(gbPath, gbBytes);
      const manual = await value.service.previewImport(
        { projectId: value.project.projectId, encoding: 'utf-8' },
        gbPath,
      );
      expect(manual.confidence).toBe('high');
      await writeFile(gbPath, '=== 第一章 ===\n文件已变化', 'utf8');
      await expect(
        value.service.commitImport(randomUUID(), {
          projectId: value.project.projectId,
          planId: manual.planId,
          volumeTitle: '失效计划',
          chapters: manual.chapters,
        }),
      ).rejects.toMatchObject({ code: 'IMPORT_PLAN_STALE' });

      const emptyPath = path.join(value.importDirectory, 'empty.txt');
      await writeFile(emptyPath, '', 'utf8');
      await expect(
        value.service.previewImport({ projectId: value.project.projectId }, emptyPath),
      ).rejects.toMatchObject({ code: 'IMPORT_CONTENT_EMPTY' });
    } finally {
      await value.workspace.shutdown();
      await value.appRuntime.close();
    }
  });

  it('keeps the checkpoint but rolls back every imported row after a fault inside the import transaction', async () => {
    const value = await harness({
      faultInjector: (stage) => {
        if (stage === 'during-import') throw new Error('injected import failure');
      },
    });
    try {
      const sourcePath = path.join(value.importDirectory, 'rollback.txt');
      await writeFile(sourcePath, '=== 第一章 ===\n事务正文', 'utf8');
      const plan = await value.service.previewImport(
        { projectId: value.project.projectId },
        sourcePath,
      );
      await expect(
        value.service.commitImport(randomUUID(), {
          projectId: value.project.projectId,
          planId: plan.planId,
          volumeTitle: '事务回滚',
          chapters: plan.chapters,
        }),
      ).rejects.toMatchObject({ code: 'IMPORT_COMMIT_FAILED' });
      expect(
        value.workspace.readProject(value.project.projectId, (database) => ({
          volumes: Number(database.prepare('SELECT COUNT(*) AS count FROM volumes').get()?.count ?? 0),
          chapters: Number(
            database.prepare('SELECT COUNT(*) AS count FROM chapters').get()?.count ?? 0,
          ),
          drafts: Number(database.prepare('SELECT COUNT(*) AS count FROM drafts').get()?.count ?? 0),
          versions: Number(
            database.prepare('SELECT COUNT(*) AS count FROM versions').get()?.count ?? 0,
          ),
          checkpoints: Number(
            database.prepare('SELECT COUNT(*) AS count FROM backup_records').get()?.count ?? 0,
          ),
        })),
      ).toEqual({ volumes: 0, chapters: 0, drafts: 0, versions: 0, checkpoints: 1 });
    } finally {
      await value.workspace.shutdown();
      await value.appRuntime.close();
    }
  });
});
