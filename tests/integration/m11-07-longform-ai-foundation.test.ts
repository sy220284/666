import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { chapterPrompt } from '../../packages/prompts/src/registry.js';
import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ConstraintPackageService } from '../../packages/core-service/src/constraint-package.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import {
  LongformAiService,
  LongformAiServiceError,
} from '../../packages/core-service/src/longform-ai-service.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { VersionService } from '../../packages/core-service/src/version.js';

const temporaryDirectories: string[] = [];
const now = '2026-08-13T09:30:00.000Z';
const clock = { now: () => new Date(now) };

interface Harness {
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly drafts: DraftService;
  readonly longform: LongformAiService;
  readonly versions: VersionService;
  readonly constraints: ConstraintPackageService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-m11-07-longform-'));
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
  const longform = new LongformAiService(workspace, { clock });
  return {
    parent,
    appRuntime,
    workspace,
    structure: new ProjectStructureService(workspace, { clock }),
    drafts: new DraftService(workspace, { clock }),
    longform,
    versions: new VersionService(workspace, { clock, digests: longform }),
    constraints: new ConstraintPackageService(workspace),
  };
}

async function closeHarness(harness: Harness): Promise<void> {
  await harness.workspace.shutdown();
  await harness.appRuntime.close();
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createVersion(
  harness: Harness,
  projectId: string,
  chapterId: string,
  title: string,
  text: string,
) {
  const draft = await harness.drafts.open(randomUUID(), { projectId, chapterId });
  const first = draft.blocks[0]!;
  const edited = await harness.drafts.applyPatch(randomUUID(), {
    projectId,
    chapterId,
    draftId: draft.draftId,
    baseRevision: draft.revision,
    operations: [
      {
        type: 'update',
        logicalBlockId: first.logicalBlockId,
        expectedHash: first.contentHash!,
        content: text,
      },
    ],
  });
  return harness.versions.create(randomUUID(), {
    projectId,
    chapterId,
    draftId: edited.draftId,
    baseRevision: edited.revision,
    title,
  });
}

describe('M11-07 long-form digest, style and routing foundation', () => {
  it('rebuilds three digest levels, tracks provenance, recalls cross-volume context and routes by exact Prompt version', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '长篇智能底座', channel: '悬疑长篇' },
        harness.parent,
      );
      const firstVolume = harness.structure.list(project.projectId).volumes[0]!;
      const firstChapter = firstVolume.chapters[0]!;
      const withSecondVolume = await harness.structure.createVolume(randomUUID(), {
        projectId: project.projectId,
        title: '第二卷',
        placement: { kind: 'end' },
      });
      const secondVolume = withSecondVolume.volumes.find((volume) => volume.title === '第二卷')!;
      const withSecondChapter = await harness.structure.createChapter(randomUUID(), {
        projectId: project.projectId,
        volumeId: secondVolume.id,
        title: '跨卷回响',
        placement: { kind: 'end' },
      });
      const secondChapter = withSecondChapter.volumes
        .find((volume) => volume.id === secondVolume.id)!
        .chapters.at(-1)!;

      const firstVersion = await createVersion(
        harness,
        project.projectId,
        firstChapter.id,
        '第一卷定稿',
        '雨夜里，守灯人留下铜铃。她没有解释，只说钟楼会在下一场雨中醒来。',
      );
      await harness.versions.setFinal(randomUUID(), {
        projectId: project.projectId,
        chapterId: firstChapter.id,
        versionId: firstVersion.versionId,
      });
      const secondVersion = await createVersion(
        harness,
        project.projectId,
        secondChapter.id,
        '第二卷定稿',
        '三年后铜铃再次作响。“你终于来了。”守灯人站在钟楼阴影里。',
      );
      await harness.versions.setFinal(randomUUID(), {
        projectId: project.projectId,
        chapterId: secondChapter.id,
        versionId: secondVersion.versionId,
      });

      const digestList = harness.longform.listDigests({ projectId: project.projectId });
      expect(digestList.digests).toHaveLength(5);
      expect(digestList.digests.filter((digest) => digest.scopeType === 'chapter')).toHaveLength(2);
      expect(digestList.digests.filter((digest) => digest.scopeType === 'volume')).toHaveLength(2);
      expect(digestList.digests.filter((digest) => digest.scopeType === 'project')).toHaveLength(1);
      expect(digestList.digests.every((digest) => digest.freshness === 'fresh')).toBe(true);
      expect(
        digestList.digests.find(
          (digest) => digest.scopeType === 'project' && digest.scopeId === project.projectId,
        )?.sourceVersionIds,
      ).toEqual(expect.arrayContaining([firstVersion.versionId, secondVersion.versionId]));
      expect(
        harness.longform.listDigests({
          projectId: project.projectId,
          scopeType: 'chapter',
          scopeId: firstChapter.id,
          freshness: 'fresh',
        }).digests,
      ).toHaveLength(1);

      const digestHash = (scopeType: 'chapter' | 'volume' | 'project', scopeId: string): string =>
        harness.longform
          .listDigests({ projectId: project.projectId, scopeType, scopeId })
          .digests.at(0)!.sourceHash;
      const initialChapterHash = digestHash('chapter', firstChapter.id);
      const initialVolumeHash = digestHash('volume', firstVolume.id);
      const initialProjectHash = digestHash('project', project.projectId);
      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database
          .prepare('UPDATE chapters SET title = ? WHERE id = ?')
          .run('雨夜铜铃', firstChapter.id);
      });
      expect(
        harness.longform
          .listDigests({ projectId: project.projectId, freshness: 'stale' })
          .digests.map((digest) => `${digest.scopeType}:${digest.scopeId}`),
      ).toEqual(
        expect.arrayContaining([
          `chapter:${firstChapter.id}`,
          `volume:${firstVolume.id}`,
          `project:${project.projectId}`,
        ]),
      );
      await harness.longform.rebuild(randomUUID(), {
        projectId: project.projectId,
        scopeType: 'project',
        scopeId: project.projectId,
      });
      expect(digestHash('chapter', firstChapter.id)).not.toBe(initialChapterHash);
      expect(digestHash('volume', firstVolume.id)).not.toBe(initialVolumeHash);
      expect(digestHash('project', project.projectId)).not.toBe(initialProjectHash);

      const renamedChapterHash = digestHash('chapter', firstChapter.id);
      const renamedVolumeHash = digestHash('volume', firstVolume.id);
      const renamedProjectHash = digestHash('project', project.projectId);
      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database.prepare('UPDATE volumes SET title = ? WHERE id = ?').run('铜铃卷', firstVolume.id);
      });
      expect(
        harness.longform
          .listDigests({ projectId: project.projectId, freshness: 'stale' })
          .digests.map((digest) => `${digest.scopeType}:${digest.scopeId}`),
      ).toEqual(
        expect.arrayContaining([
          `chapter:${firstChapter.id}`,
          `volume:${firstVolume.id}`,
          `project:${project.projectId}`,
        ]),
      );
      await harness.longform.rebuild(randomUUID(), {
        projectId: project.projectId,
        scopeType: 'project',
        scopeId: project.projectId,
      });
      expect(digestHash('chapter', firstChapter.id)).not.toBe(renamedChapterHash);
      expect(digestHash('volume', firstVolume.id)).not.toBe(renamedVolumeHash);
      expect(digestHash('project', project.projectId)).not.toBe(renamedProjectHash);

      const titledChapterHash = digestHash('chapter', firstChapter.id);
      const titledVolumeHash = digestHash('volume', firstVolume.id);
      const titledProjectHash = digestHash('project', project.projectId);
      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database
          .prepare('UPDATE projects SET name = ? WHERE id = ?')
          .run('铜铃长夜', project.projectId);
      });
      expect(
        harness.longform
          .listDigests({ projectId: project.projectId, freshness: 'stale' })
          .digests.map((digest) => `${digest.scopeType}:${digest.scopeId}`),
      ).toEqual([`project:${project.projectId}`]);
      await harness.longform.rebuild(randomUUID(), {
        projectId: project.projectId,
        scopeType: 'project',
        scopeId: project.projectId,
      });
      expect(digestHash('chapter', firstChapter.id)).toBe(titledChapterHash);
      expect(digestHash('volume', firstVolume.id)).toBe(titledVolumeHash);
      expect(digestHash('project', project.projectId)).not.toBe(titledProjectHash);

      expect(harness.longform.getSettings(project.projectId)).toMatchObject({
        activeStyleProfileId: null,
        styleProfiles: [],
        taskRoutes: [],
      });

      const styleProfileId = randomUUID();
      const manualStyleProfileId = randomUUID();
      const primaryProviderId = randomUUID();
      const fallbackProviderId = randomUUID();
      const settings = await harness.longform.updateSettings(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        expectedUpdatedAt: null,
        settings: {
          schemaVersion: 1,
          activeStyleProfileId: styleProfileId,
          styleProfiles: [
            {
              id: styleProfileId,
              name: '克制悬疑',
              origin: 'learned',
              instructions: ['短句推进', '对话保持克制'],
              sampleVersionIds: [firstVersion.versionId, secondVersion.versionId],
              targetMetrics: null,
              sceneMappings: [],
            },
            {
              id: manualStyleProfileId,
              name: '手动提醒',
              origin: 'manual',
              instructions: ['保持动作清楚'],
              sampleVersionIds: [],
              targetMetrics: null,
              sceneMappings: [],
            },
          ],
          taskRoutes: [
            {
              taskType: 'chapter',
              primaryProviderId,
              fallbackProviderIds: [fallbackProviderId],
              minimumSupport: 'verified',
            },
          ],
        },
      });
      expect(settings.styleProfiles[0]?.targetMetrics).not.toBeNull();
      await expect(
        harness.longform.updateSettings(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          expectedUpdatedAt: null,
          settings: {
            schemaVersion: 1,
            activeStyleProfileId: null,
            styleProfiles: [],
            taskRoutes: [],
          },
        }),
      ).rejects.toMatchObject({ code: 'LONGFORM_SETTINGS_CONFLICT' });

      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        const insert = database.prepare(
          `INSERT INTO model_support_profiles(
             provider_id, model, task_type, prompt_id, prompt_version, status,
             evaluated_at, fixture_set_version, metrics_json, limitations_json,
             created_at, updated_at
           ) VALUES(?, ?, 'chapter', ?, ?, ?, ?, 'm11-07', NULL, '[]', ?, ?)`,
        );
        insert.run(
          primaryProviderId,
          'primary-model',
          chapterPrompt.promptId,
          chapterPrompt.version,
          'limited',
          now,
          now,
          now,
        );
        insert.run(
          fallbackProviderId,
          'fallback-model',
          chapterPrompt.promptId,
          chapterPrompt.version,
          'verified',
          now,
          now,
          now,
        );
      });
      expect(
        harness.longform.resolveTaskRoute({
          projectId: project.projectId,
          taskType: 'chapter',
          candidates: [
            {
              providerId: primaryProviderId,
              model: 'primary-model',
              credentialConfigured: true,
            },
            {
              providerId: fallbackProviderId,
              model: 'fallback-model',
              credentialConfigured: true,
            },
          ],
        }),
      ).toMatchObject({
        providerId: fallbackProviderId,
        selection: 'fallback',
        support: 'verified',
        rejectedProviderIds: [primaryProviderId],
      });
      expect(() =>
        harness.longform.resolveTaskRoute({
          projectId: project.projectId,
          taskType: 'chapter',
          candidates: [
            {
              providerId: fallbackProviderId,
              model: 'fallback-model',
              credentialConfigured: false,
            },
          ],
        }),
      ).toThrowError(LongformAiServiceError);
      expect(
        harness.longform.resolveTaskRoute({
          projectId: project.projectId,
          taskType: 'skeleton',
          candidates: [
            {
              providerId: fallbackProviderId,
              model: 'fallback-model',
              credentialConfigured: true,
            },
          ],
        }),
      ).toMatchObject({
        providerId: fallbackProviderId,
        selection: 'default',
        support: 'unverified',
      });

      const style = harness.longform.evaluateStyle({
        projectId: project.projectId,
        profileId: styleProfileId,
        versionId: secondVersion.versionId,
      });
      expect(['within_profile', 'deviated']).toContain(style.status);
      expect(
        harness.longform.evaluateStyle({
          projectId: project.projectId,
          profileId: manualStyleProfileId,
          versionId: secondVersion.versionId,
        }).status,
      ).toBe('insufficient_samples');

      const constraints = harness.constraints.build({
        projectId: project.projectId,
        chapterId: secondChapter.id,
        taskType: 'chapter',
        maxInputTokens: 32_768,
        safetyMarginTokens: 1_024,
        maxSupplementalResults: 0,
      });
      const sources = Object.values(constraints.sections).flat();
      expect(sources.some((source) => source.sourceType === 'chapter_digest')).toBe(true);
      expect(sources.some((source) => source.sourceType === 'volume_digest')).toBe(true);
      expect(sources.some((source) => source.sourceType === 'project_digest')).toBe(true);
      expect(sources.some((source) => source.sourceType === 'style_profile')).toBe(true);

      const replacementVersion = await createVersion(
        harness,
        project.projectId,
        firstChapter.id,
        '第一卷修订定稿',
        '雨夜里，守灯人把裂开的铜铃交给她，约定钟楼醒来时再见。',
      );
      const beforeRevision = digestList.digests.find(
        (digest) => digest.scopeType === 'chapter' && digest.scopeId === firstChapter.id,
      )!.semanticRevision;
      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database
          .prepare('UPDATE chapters SET final_version_id = ? WHERE id = ?')
          .run(replacementVersion.versionId, firstChapter.id);
      });
      expect(
        harness.longform
          .listDigests({ projectId: project.projectId, freshness: 'stale' })
          .digests.map((digest) => digest.scopeType),
      ).toEqual(expect.arrayContaining(['chapter', 'volume', 'project']));
      await harness.longform.rebuild(randomUUID(), {
        projectId: project.projectId,
        scopeType: 'chapter',
        scopeId: firstChapter.id,
      });
      const rebuilt = harness.longform.listDigests({ projectId: project.projectId });
      expect(rebuilt.digests.every((digest) => digest.freshness === 'fresh')).toBe(true);
      expect(
        rebuilt.digests.find(
          (digest) => digest.scopeType === 'chapter' && digest.scopeId === firstChapter.id,
        )!.semanticRevision,
      ).toBeGreaterThan(beforeRevision);
    } finally {
      await closeHarness(harness);
    }
  });

  it('commits finalization even when the best-effort digest rebuild fails', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '摘要失败不回滚定稿', channel: '长篇' },
        harness.parent,
      );
      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      const version = await createVersion(
        harness,
        project.projectId,
        chapter.id,
        '仍应成功的定稿',
        '定稿先提交，摘要失败只进入诊断。',
      );
      const errors: unknown[] = [];
      const failingVersions = new VersionService(harness.workspace, {
        clock,
        digests: {
          rebuildForChapter: async () => {
            throw new Error('digest fixture failure');
          },
        },
        onDigestError: (error) => errors.push(error),
      });
      const finalized = await failingVersions.setFinal(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        versionId: version.versionId,
      });
      expect(finalized.finalized).toBe(true);
      expect(errors).toHaveLength(1);
      expect(
        harness.structure.list(project.projectId).volumes[0]!.chapters[0]!.finalVersionId,
      ).toBe(version.versionId);
    } finally {
      await closeHarness(harness);
    }
  });
});
