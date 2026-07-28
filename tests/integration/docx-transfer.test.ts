import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { CoordinatedImportExportService } from '../../packages/core-service/src/coordinated-import-export.js';
import { parseDocx, renderDocx } from '../../packages/core-service/src/docx-transfer.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { RecoveryService } from '../../packages/core-service/src/recovery.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-26T10:30:00.000Z') };

async function harness() {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-docx-transfer-'));
  temporaryDirectories.push(root);
  const projectParent = path.join(root, 'projects');
  const sourceDirectory = path.join(root, 'sources');
  const exportDirectory = path.join(root, 'exports');
  await Promise.all([
    mkdir(projectParent, { recursive: true }),
    mkdir(sourceDirectory, { recursive: true }),
    mkdir(exportDirectory, { recursive: true }),
  ]);
  const runtime = await openAppRuntime({
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
    recentProjects: runtime.recentProjects,
    clock,
  });
  const recovery = new RecoveryService(workspace, {
    backupRootDirectory: path.join(root, 'backups'),
    clock,
  });
  const transfer = new CoordinatedImportExportService(workspace, recovery, { clock });
  const structure = new ProjectStructureService(workspace, { clock });
  const project = await workspace.create(
    randomUUID(),
    { name: 'DOCX往返', channel: '长篇', initialStructure: 'blank' },
    projectParent,
  );
  return {
    sourceDirectory,
    exportDirectory,
    runtime,
    workspace,
    transfer,
    structure,
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

describe('M4-04 DOCX transfer', () => {
  it('round-trips selected immutable Versions and records import without manual writing time', async () => {
    const value = await harness();
    try {
      const markdownPath = path.join(value.sourceDirectory, '来源.md');
      await writeFile(
        markdownPath,
        '# 第一章\n\n雨落旧站。\n\n## 夜谈\n\n“谁在那里？”\n\n# 第二章\n\n天将破晓。\n',
        'utf8',
      );
      const sourcePlan = await value.transfer.previewImport(
        { projectId: value.project.projectId },
        markdownPath,
      );
      const committed = await value.transfer.commitImport(randomUUID(), {
        projectId: value.project.projectId,
        planId: sourcePlan.planId,
        volumeTitle: 'DOCX来源',
        chapters: sourcePlan.chapters,
      });
      expect(
        value.workspace.readProject(value.project.projectId, (database) => ({
          importMutations: Number(
            database
              .prepare(
                `SELECT COUNT(*) AS count FROM draft_patch_log
                  WHERE mutation_origin = 'import'`,
              )
              .get()?.count ?? 0,
          ),
          writingSessions: Number(
            database.prepare('SELECT COUNT(*) AS count FROM writing_sessions').get()?.count ?? 0,
          ),
        })),
      ).toEqual({ importMutations: 2, writingSessions: 0 });

      const exported = await value.transfer.exportVersions(
        {
          projectId: value.project.projectId,
          versionIds: committed.versionIds,
          format: 'docx',
          fileName: '不可变版本',
        },
        value.exportDirectory,
      );
      expect(exported.fileName).toBe('不可变版本.docx');
      expect((await readFile(exported.filePath)).subarray(0, 2).toString('ascii')).toBe('PK');

      const roundtrip = await value.transfer.previewImport(
        { projectId: value.project.projectId },
        exported.filePath,
      );
      expect(roundtrip.format).toBe('docx');
      expect(roundtrip.chapters.map((chapter) => chapter.title)).toEqual(['第一章', '第二章']);
      expect(roundtrip.chapters[0]?.blocks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ blockType: 'paragraph', text: '雨落旧站。' }),
          expect.objectContaining({ blockType: 'heading', text: '夜谈' }),
        ]),
      );
    } finally {
      await value.workspace.shutdown();
      await value.runtime.close();
    }
  });

  it('invalidates a retained plan when project structure changes after preview', async () => {
    const value = await harness();
    try {
      const sourcePath = path.join(value.sourceDirectory, '计划.txt');
      await writeFile(sourcePath, '=== 第一章 ===\n待导入正文', 'utf8');
      const plan = await value.transfer.previewImport(
        { projectId: value.project.projectId },
        sourcePath,
      );
      await value.structure.createVolume(randomUUID(), {
        projectId: value.project.projectId,
        title: '计划后新增卷',
      });
      await expect(
        value.transfer.commitImport(randomUUID(), {
          projectId: value.project.projectId,
          planId: plan.planId,
          volumeTitle: '过期计划',
          chapters: plan.chapters,
        }),
      ).rejects.toMatchObject({ code: 'IMPORT_PLAN_STALE' });
    } finally {
      await value.workspace.shutdown();
      await value.runtime.close();
    }
  });

  it('cross-checks central-directory fields against every local header', () => {
    const archive = renderDocx([
      {
        chapterTitle: '第一章',
        blocks: [{ blockType: 'paragraph', text: '本地头与中央目录必须一致。' }],
      },
    ]);
    let eocd = -1;
    for (
      let offset = archive.length - 22;
      offset >= Math.max(0, archive.length - 65_557);
      offset -= 1
    ) {
      if (archive.readUInt32LE(offset) === 0x06054b50) {
        eocd = offset;
        break;
      }
    }
    expect(eocd).toBeGreaterThanOrEqual(0);
    const centralOffset = archive.readUInt32LE(eocd + 16);
    const localOffset = archive.readUInt32LE(centralOffset + 42);
    archive.writeUInt16LE(archive.readUInt16LE(localOffset + 8) === 8 ? 0 : 8, localOffset + 8);
    expect(() => parseDocx(archive, '损坏文档', randomUUID)).toThrowError(
      /local entry header fields do not match/iu,
    );
  });

  it('imports a deterministic seven-million-character DOCX within archive limits', () => {
    const bytes = Buffer.allocUnsafe(7_000_000);
    let state = 0x1357_9bdf;
    for (let index = 0; index < bytes.length; index += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      bytes[index] = 33 + ((state >>> 0) % 90);
    }
    const text = bytes.toString('ascii');
    const chunks = Array.from({ length: 8 }, (_value, index) =>
      text.slice(index * 875_000, (index + 1) * 875_000),
    );
    const archive = renderDocx([
      {
        chapterTitle: '超大章节',
        blocks: chunks.map((chunk) => ({ blockType: 'paragraph', text: chunk })),
      },
    ]);
    const parsed = parseDocx(archive, '超大章节', randomUUID);
    expect(archive.byteLength).toBeLessThan(20 * 1024 * 1024);
    expect(parsed.chapters[0]?.blocks.reduce((total, block) => total + block.text.length, 0)).toBe(
      text.length,
    );
  });
});
