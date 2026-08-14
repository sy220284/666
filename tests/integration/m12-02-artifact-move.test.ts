import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { ResearchService } from '../../packages/core-service/src/research-service.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-08-14T13:45:00.000Z') };

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M12-02 project artifact move', () => {
  it('moves a registered research attachment with the complete workspace and preserves its hash', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-m12-02-artifact-move-'));
    temporaryDirectories.push(root);
    const sourceParent = path.join(root, 'source-projects');
    const targetParent = path.join(root, 'moved-projects');
    await Promise.all([
      mkdir(sourceParent, { recursive: true }),
      mkdir(targetParent, { recursive: true }),
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
      projectMigrationRecoveryDirectory: path.join(root, 'project-migration-recovery'),
      appVersion: '0.1.0',
      recentProjects: appRuntime.recentProjects,
      clock,
    });
    const research = new ResearchService(workspace, { clock });
    try {
      const project = await workspace.create(
        randomUUID(),
        { name: '完整资产移动', channel: '长篇' },
        sourceParent,
      );
      const noteCatalog = await research.createNote(randomUUID(), {
        projectId: project.projectId,
        title: '移动资料',
        body: '验证受管附件随完整工作区移动。',
        sourceType: null,
        sourceLabel: null,
        sourceUri: null,
        tags: ['move'],
      });
      const sourceFile = path.join(root, 'move-source.txt');
      const content = 'M12-02 managed research attachment move integrity';
      await writeFile(sourceFile, content, 'utf8');
      const imported = await research.importAttachment(
        randomUUID(),
        { projectId: project.projectId, noteId: noteCatalog.notes[0]!.id },
        sourceFile,
      );
      const attachment = imported.attachments[0]!;
      const oldWorkspacePath = project.workspacePath;
      const oldManagedPath = path.join(
        oldWorkspacePath,
        ...attachment.managedRelativePath.split('/'),
      );
      await expect(access(oldManagedPath)).resolves.toBeUndefined();

      const moved = await workspace.move(randomUUID(), project.projectId, targetParent);

      expect(moved.projectId).toBe(project.projectId);
      expect(moved.workspacePath).not.toBe(oldWorkspacePath);
      expect(moved.sourceRetained).toBe(false);
      await expect(access(oldWorkspacePath)).rejects.toThrow();
      const movedManagedPath = path.join(
        moved.workspacePath,
        ...attachment.managedRelativePath.split('/'),
      );
      const movedContent = await readFile(movedManagedPath);
      expect(createHash('sha256').update(movedContent).digest('hex')).toBe(attachment.contentHash);
      expect(movedContent.toString('utf8')).toBe(content);

      const movedCatalog = research.list({ projectId: project.projectId, includeArchived: true });
      expect(movedCatalog.attachments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: attachment.id,
            projectId: project.projectId,
            noteId: noteCatalog.notes[0]!.id,
            managedRelativePath: attachment.managedRelativePath,
            contentHash: attachment.contentHash,
          }),
        ]),
      );
      expect(attachment.managedRelativePath).not.toContain(oldWorkspacePath);
      expect(attachment.managedRelativePath).not.toContain(sourceFile);
    } finally {
      await workspace.shutdown();
      await appRuntime.close();
    }
  });
});
