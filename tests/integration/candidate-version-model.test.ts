import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import {
  CandidateService,
  type CandidateServiceError,
} from '../../packages/core-service/src/candidate.js';
import { DraftService, draftContentHash } from '../../packages/core-service/src/draft.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import {
  VersionService,
  type VersionServiceError,
} from '../../packages/core-service/src/version.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-17T10:30:00.000Z') };

interface Harness {
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly drafts: DraftService;
  readonly candidates: CandidateService;
  readonly versions: VersionService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-candidate-version-'));
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
  return {
    parent,
    appRuntime,
    workspace,
    structure: new ProjectStructureService(workspace, { clock }),
    drafts: new DraftService(workspace, { clock }),
    candidates: new CandidateService(workspace, { clock }),
    versions: new VersionService(workspace, { clock }),
  };
}

async function closeHarness(harness: Harness): Promise<void> {
  await harness.workspace.shutdown();
  await harness.appRuntime.close();
}

async function createProjectDraft(harness: Harness, name: string) {
  const project = await harness.workspace.create(
    randomUUID(),
    { name, channel: '长篇' },
    harness.parent,
  );
  const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
  const draft = await harness.drafts.open(randomUUID(), {
    projectId: project.projectId,
    chapterId: chapter.id,
  });
  return { project, chapter, draft };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M2-02 Candidate and Version model', () => {
  it('persists fixture Candidates without changing the active Draft', async () => {
    const harness = await createHarness();
    try {
      const { project, chapter, draft } = await createProjectDraft(harness, '候选隔离');
      const source = draft.blocks[0]!;
      const candidate = await harness.candidates.createFixture(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseDraftRevision: draft.revision,
        candidateType: 'rewrite',
        completeness: 'partial',
        title: 'Fixture 改写候选',
        blocks: [
          {
            logicalBlockId: source.logicalBlockId,
            blockType: source.blockType,
            text: '候选文本只进入 Candidate，Cafe\u0301。\r\n下一行。',
            attributes: source.attributes,
            sourceBlockHash: source.contentHash,
          },
        ],
      });

      expect(candidate).toMatchObject({
        generationRunId: null,
        candidateType: 'rewrite',
        completeness: 'partial',
        status: 'pending',
        baseDraftId: draft.draftId,
        baseDraftRevision: draft.revision,
        blockCount: 1,
      });
      expect(
        harness.candidates.list({ projectId: project.projectId, chapterId: chapter.id }),
      ).toMatchObject({ candidates: [{ candidateId: candidate.candidateId, status: 'pending' }] });
      const persistedBlock = harness.candidates.get({
        projectId: project.projectId,
        chapterId: chapter.id,
        candidateId: candidate.candidateId,
      }).blocks[0]!;
      expect(persistedBlock.text).toBe('候选文本只进入 Candidate，Café。\n下一行。');
      expect(persistedBlock.contentHash).toBe(
        draftContentHash({
          blockType: persistedBlock.blockType,
          content: persistedBlock.text,
          attributes: persistedBlock.attributes,
        }),
      );

      const unchanged = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      expect(unchanged).toEqual(draft);

      const discarded = await harness.candidates.discard(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        candidateId: candidate.candidateId,
      });
      expect(discarded).toMatchObject({
        status: 'discarded',
        resolvedAt: clock.now().toISOString(),
      });
      await expect(
        harness.candidates.discard(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          candidateId: candidate.candidateId,
        }),
      ).rejects.toMatchObject<CandidateServiceError>({ code: 'CANDIDATE_STATUS_CONFLICT' });

      await harness.workspace.close(randomUUID(), project.projectId);
      await harness.workspace.open(randomUUID(), { workspacePath: project.workspacePath });
      const reopenedCandidates = new CandidateService(harness.workspace, { clock });
      const reopenedDrafts = new DraftService(harness.workspace, { clock });
      expect(
        reopenedCandidates.get({
          projectId: project.projectId,
          chapterId: chapter.id,
          candidateId: candidate.candidateId,
        }),
      ).toMatchObject({
        candidateId: candidate.candidateId,
        status: 'discarded',
        resolvedAt: clock.now().toISOString(),
        blocks: candidate.blocks,
      });
      await expect(
        reopenedDrafts.open(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
        }),
      ).resolves.toEqual(draft);
    } finally {
      await closeHarness(harness);
    }
  });

  it('stores parent and Candidate provenance while keeping Versions immutable', async () => {
    const harness = await createHarness();
    try {
      const { project, chapter, draft } = await createProjectDraft(harness, '版本来源');
      const parent = await harness.versions.create(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseRevision: draft.revision,
        title: '父版本',
      });
      const candidate = await harness.candidates.createFixture(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseDraftRevision: draft.revision,
        candidateType: 'full',
        completeness: 'complete',
        title: '完整候选',
        sourceVersionId: parent.versionId,
        blocks: draft.blocks.map((block) => ({
          logicalBlockId: block.logicalBlockId,
          blockType: block.blockType,
          text: block.text,
          attributes: block.attributes,
          sourceBlockHash: block.contentHash,
        })),
      });
      const candidateVersion = await harness.versions.create(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseRevision: draft.revision,
        versionType: 'candidate',
        parentVersionId: parent.versionId,
        sourceCandidateId: candidate.candidateId,
        title: '候选来源版本',
      });
      expect(candidateVersion).toMatchObject({
        versionType: 'candidate',
        parentVersionId: parent.versionId,
        sourceCandidateId: candidate.candidateId,
        sourceRevision: draft.revision,
      });
      expect(Object.getOwnPropertyNames(VersionService.prototype)).not.toEqual(
        expect.arrayContaining(['update', 'delete']),
      );

      const source = draft.blocks[0]!;
      await harness.drafts.applyPatch(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseRevision: draft.revision,
        operations: [
          {
            type: 'update',
            logicalBlockId: source.logicalBlockId,
            expectedHash: source.contentHash!,
            content: 'Draft 后续修改不应影响历史 Version。',
          },
        ],
      });
      const immutable = harness.versions.get({
        projectId: project.projectId,
        chapterId: chapter.id,
        versionId: candidateVersion.versionId,
      });
      expect(immutable.contentHash).toBe(candidateVersion.contentHash);
      expect(immutable.blocks).toEqual(candidateVersion.blocks);

      await harness.workspace.close(randomUUID(), project.projectId);
      await harness.workspace.open(randomUUID(), { workspacePath: project.workspacePath });
      const reopenedVersions = new VersionService(harness.workspace, { clock });
      expect(
        reopenedVersions.get({
          projectId: project.projectId,
          chapterId: chapter.id,
          versionId: candidateVersion.versionId,
        }),
      ).toEqual(candidateVersion);
    } finally {
      await closeHarness(harness);
    }
  });

  it('rejects persisted Candidate block or aggregate hash drift', async () => {
    const harness = await createHarness();
    try {
      const { project, chapter, draft } = await createProjectDraft(harness, '候选完整性');
      const source = draft.blocks[0]!;
      const candidate = await harness.candidates.createFixture(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseDraftRevision: draft.revision,
        candidateType: 'rewrite',
        completeness: 'complete',
        title: '哈希漂移候选',
        blocks: [
          {
            logicalBlockId: source.logicalBlockId,
            sourceLogicalBlockIds: [source.logicalBlockId],
            blockType: source.blockType,
            text: '原始候选内容',
            attributes: source.attributes,
            sourceBlockHash: source.contentHash,
          },
        ],
      });

      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database
          .prepare('UPDATE candidate_blocks SET text = ? WHERE candidate_id = ?')
          .run('被篡改但未重算哈希', candidate.candidateId);
      });

      expect(() =>
        harness.candidates.get({
          projectId: project.projectId,
          chapterId: chapter.id,
          candidateId: candidate.candidateId,
        }),
      ).toThrow('content hash does not match');
    } finally {
      await closeHarness(harness);
    }
  });

  it('rejects Version and Candidate provenance from another project', async () => {
    const harness = await createHarness();
    try {
      const first = await createProjectDraft(harness, '来源项目');
      const foreignVersion = await harness.versions.create(randomUUID(), {
        projectId: first.project.projectId,
        chapterId: first.chapter.id,
        draftId: first.draft.draftId,
        baseRevision: first.draft.revision,
        title: '外部版本',
      });
      await harness.workspace.close(randomUUID(), first.project.projectId);

      const second = await createProjectDraft(harness, '目标项目');
      await expect(
        harness.candidates.createFixture(randomUUID(), {
          projectId: second.project.projectId,
          chapterId: second.chapter.id,
          draftId: second.draft.draftId,
          baseDraftRevision: second.draft.revision,
          candidateType: 'merge',
          completeness: 'complete',
          title: '非法跨项目候选',
          sourceVersionId: foreignVersion.versionId,
          blocks: second.draft.blocks.map((block) => ({
            logicalBlockId: block.logicalBlockId,
            blockType: block.blockType,
            text: block.text,
            attributes: block.attributes,
            sourceBlockHash: block.contentHash,
          })),
        }),
      ).rejects.toMatchObject<CandidateServiceError>({ code: 'CANDIDATE_SOURCE_CONFLICT' });
      await expect(
        harness.versions.create(randomUUID(), {
          projectId: second.project.projectId,
          chapterId: second.chapter.id,
          draftId: second.draft.draftId,
          baseRevision: second.draft.revision,
          parentVersionId: foreignVersion.versionId,
          title: '非法跨项目版本',
        }),
      ).rejects.toMatchObject<VersionServiceError>({ code: 'VERSION_PARENT_CONFLICT' });
    } finally {
      await closeHarness(harness);
    }
  });
});
