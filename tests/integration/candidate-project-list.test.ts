import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { CandidateService } from '../../packages/core-service/src/candidate.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-28T08:30:00.000Z') };

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('project-wide Candidate listing', () => {
  it('returns pending Candidates across chapters while preserving chapter filtering', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-candidate-project-list-'));
    temporaryDirectories.push(root);
    const parent = path.join(root, 'projects');
    await mkdir(parent, { recursive: true });
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
    const structure = new ProjectStructureService(workspace, { clock });
    const drafts = new DraftService(workspace, { clock });
    const candidates = new CandidateService(workspace, { clock });

    try {
      const project = await workspace.create(
        randomUUID(),
        { name: '全项目候选', channel: '长篇' },
        parent,
      );
      const initialStructure = structure.list(project.projectId);
      const volume = initialStructure.volumes[0]!;
      const firstChapter = volume.chapters[0]!;
      const secondStructure = await structure.createChapter(randomUUID(), {
        projectId: project.projectId,
        volumeId: volume.id,
        title: '第二章',
        placement: { kind: 'end' },
      });
      const secondChapter = secondStructure.volumes[0]!.chapters[1]!;

      const createCandidate = async (
        chapterId: string,
        title: string,
        completeness: 'complete' | 'partial',
      ) => {
        const draft = await drafts.open(randomUUID(), { projectId: project.projectId, chapterId });
        const source = draft.blocks[0]!;
        return candidates.createFixture(randomUUID(), {
          projectId: project.projectId,
          chapterId,
          draftId: draft.draftId,
          baseDraftRevision: draft.revision,
          candidateType: 'rewrite',
          completeness,
          title,
          blocks: [
            {
              logicalBlockId: source.logicalBlockId,
              blockType: source.blockType,
              text: `${title}正文`,
              attributes: source.attributes,
              sourceBlockHash: source.contentHash,
            },
          ],
        });
      };

      const first = await createCandidate(firstChapter.id, '第一章候选', 'partial');
      const second = await createCandidate(secondChapter.id, '第二章候选', 'complete');

      const projectList = candidates.list({ projectId: project.projectId });
      expect(new Set(projectList.candidates.map((candidate) => candidate.candidateId))).toEqual(
        new Set([first.candidateId, second.candidateId]),
      );
      expect(projectList.candidates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ chapterId: firstChapter.id, completeness: 'partial' }),
          expect.objectContaining({ chapterId: secondChapter.id, completeness: 'complete' }),
        ]),
      );

      expect(
        candidates.list({ projectId: project.projectId, chapterId: firstChapter.id }).candidates,
      ).toEqual([expect.objectContaining({ candidateId: first.candidateId })]);
    } finally {
      await workspace.shutdown();
      await appRuntime.close();
    }
  });
});
