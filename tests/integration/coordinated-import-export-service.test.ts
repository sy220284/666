import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import {
  CoordinatedImportExportService,
  type CoordinatedImportExportServiceOptions,
} from '../../packages/core-service/src/coordinated-import-export.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { RecoveryService } from '../../packages/core-service/src/recovery.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-23T10:00:00.000Z') };

async function harness(options: CoordinatedImportExportServiceOptions = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-coordinated-import-'));
  temporaryDirectories.push(root);
  const projectParent = path.join(root, 'projects');
  const importDirectory = path.join(root, 'imports');
  await Promise.all([
    mkdir(projectParent, { recursive: true }),
    mkdir(importDirectory, { recursive: true }),
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
  const service = new CoordinatedImportExportService(workspace, recovery, {
    clock,
    ...options,
  });
  const project = await workspace.create(
    randomUUID(),
    { name: '导入协调审计', channel: '长篇', initialStructure: 'blank' },
    projectParent,
  );
  return { importDirectory, appRuntime, workspace, service, project };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('CoordinatedImportExportService', () => {
  it('bounds retained preview plans and makes evicted plans explicitly stale', async () => {
    const value = await harness({ maximumRetainedPlans: 2 });
    try {
      const paths = await Promise.all(
        ['甲', '乙', '丙'].map(async (name) => {
          const filePath = path.join(value.importDirectory, `${name}.txt`);
          await writeFile(filePath, `=== 第一章 ===\n${name}正文`, 'utf8');
          return filePath;
        }),
      );
      const plans = [];
      for (const sourcePath of paths) {
        plans.push(
          await value.service.previewImport(
            { projectId: value.project.projectId },
            sourcePath,
          ),
        );
      }

      const oldest = plans[0]!;
      await expect(
        value.service.commitImport(randomUUID(), {
          projectId: value.project.projectId,
          planId: oldest.planId,
          volumeTitle: '已淘汰计划',
          chapters: oldest.chapters,
        }),
      ).rejects.toMatchObject({ code: 'IMPORT_PLAN_STALE' });

      const newest = plans[2]!;
      const committed = await value.service.commitImport(randomUUID(), {
        projectId: value.project.projectId,
        planId: newest.planId,
        volumeTitle: '保留计划',
        chapters: newest.chapters,
      });
      expect(committed.importedChapterCount).toBe(1);
    } finally {
      await value.workspace.shutdown();
      await value.appRuntime.close();
    }
  });

  it('revalidates the source size before reading it during commit', async () => {
    let reads = 0;
    const value = await harness({
      readSource: async (filePath) => {
        reads += 1;
        return readFile(filePath);
      },
    });
    try {
      const sourcePath = path.join(value.importDirectory, '待替换.txt');
      await writeFile(sourcePath, '=== 第一章 ===\n预览正文', 'utf8');
      const plan = await value.service.previewImport(
        { projectId: value.project.projectId },
        sourcePath,
      );
      expect(reads).toBe(1);

      await writeFile(sourcePath, Buffer.alloc(20 * 1024 * 1024 + 1, 0x61));
      await expect(
        value.service.commitImport(randomUUID(), {
          projectId: value.project.projectId,
          planId: plan.planId,
          volumeTitle: '超限替换',
          chapters: plan.chapters,
        }),
      ).rejects.toMatchObject({ code: 'IMPORT_ARCHIVE_LIMIT' });
      expect(reads).toBe(1);
    } finally {
      await value.workspace.shutdown();
      await value.appRuntime.close();
    }
  });
});
