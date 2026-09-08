import { randomUUID } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { runWithCommandIdentity } from '../../packages/core-service/src/command-identity-context.js';
import { publishFileNoReplace } from '../../packages/core-service/src/file-publish.js';
import { defaultHashWorkspace } from '../../packages/core-service/src/project-workspace/project-move.js';
import {
  ProjectWorkspaceService,
  type ProjectWorkspaceServiceOptions,
} from '../../packages/core-service/src/project-workspace.js';

const temporaryDirectories: string[] = [];

async function temporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  temporaryDirectories.push(root);
  return root;
}

async function exists(filePath: string): Promise<boolean> {
  return access(filePath).then(
    () => true,
    () => false,
  );
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('post-audit filesystem race hardening', () => {
  it('publishes exports without overwriting a competing target', async () => {
    const root = await temporaryRoot('worldforge-publish-race-');
    const temporaryPath = path.join(root, '.result.tmp');
    const finalPath = path.join(root, 'result.txt');
    await writeFile(temporaryPath, 'generated\n', 'utf8');
    await writeFile(finalPath, 'competitor\n', 'utf8');

    await expect(publishFileNoReplace(temporaryPath, finalPath)).rejects.toMatchObject({
      code: 'EEXIST',
    });
    await expect(readFile(finalPath, 'utf8')).resolves.toBe('competitor\n');
    await expect(readFile(temporaryPath, 'utf8')).resolves.toBe('generated\n');
  });

  it('retains the source workspace if it changes after copy verification', async () => {
    const root = await temporaryRoot('worldforge-move-race-');
    const sourceParent = path.join(root, 'source');
    const targetParent = path.join(root, 'target');
    await Promise.all([mkdir(sourceParent), mkdir(targetParent)]);

    const app: AppRuntime = await openAppRuntime({
      databasePath: path.join(root, 'app.sqlite'),
      migrationsDirectory: 'migrations/app',
      recoveryDirectory: path.join(root, 'app-recovery'),
      appVersion: '1.1.0',
    });
    let sourcePath = '';
    let injected = false;
    const workspaceOptions: ProjectWorkspaceServiceOptions = {
      projectMigrationsDirectory: 'migrations/project',
      projectMigrationRecoveryDirectory: path.join(root, 'project-migration-recovery'),
      appVersion: '1.1.0',
      recentProjects: app.recentProjects,
      hashWorkspace: async (directory) => {
        const hash = await defaultHashWorkspace(directory);
        if (sourcePath && directory === sourcePath && !injected) {
          injected = true;
          await writeFile(path.join(sourcePath, 'external-after-hash.txt'), 'preserve me', 'utf8');
        }
        return hash;
      },
    };
    const workspace = new ProjectWorkspaceService(workspaceOptions);

    try {
      const createRequestId = randomUUID();
      const createInput = { name: '移动竞态验证', channel: '长篇' };
      const project = await runWithCommandIdentity(
        'test.project.create',
        { requestId: createRequestId, input: createInput, sourceParent },
        () => workspace.create(createRequestId, createInput, sourceParent),
      );
      sourcePath = project.workspacePath;

      const moveRequestId = randomUUID();
      const moved = await runWithCommandIdentity(
        'test.project.move',
        { requestId: moveRequestId, projectId: project.projectId, targetParent },
        () => workspace.move(moveRequestId, project.projectId, targetParent),
      );

      expect(injected).toBe(true);
      expect(moved.sourceRetained).toBe(true);
      expect(await exists(sourcePath)).toBe(true);
      expect(await exists(moved.workspacePath)).toBe(true);
      await expect(readFile(path.join(sourcePath, 'external-after-hash.txt'), 'utf8')).resolves.toBe(
        'preserve me',
      );
      expect(await exists(path.join(moved.workspacePath, 'external-after-hash.txt'))).toBe(false);
    } finally {
      await workspace.shutdown();
      await app.close();
    }
  });
});
