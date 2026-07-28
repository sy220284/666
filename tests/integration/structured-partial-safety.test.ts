import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ConstraintPackageSchema, GenerationRequestSchema } from '@worldforge/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { GenerationRunService } from '../../packages/core-service/src/generation-run.js';
import { GenerationRuntime } from '../../packages/core-service/src/generation-runtime.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { TaskProtocol } from '../../packages/core-service/src/task-protocol.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-27T03:00:00.000Z') };

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M4-04 structured partial safety', () => {
  it('does not expose incomplete structured JSON as a saveable prose partial', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-structured-partial-'));
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
    const tasks = new TaskProtocol();
    try {
      const project = await workspace.create(
        randomUUID(),
        { name: '结构化部分结果', channel: '长篇' },
        parent,
      );
      const structure = new ProjectStructureService(workspace, { clock });
      const chapter = structure.list(project.projectId).volumes[0]!.chapters[0]!;
      const drafts = new DraftService(workspace, { clock });
      const draft = await drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      const runs = new GenerationRunService(workspace, { clock });
      const runtime = new GenerationRuntime(runs, tasks);
      const interrupted = Object.assign(new Error('结构化断流'), {
        code: 'AI_STREAM_INTERRUPTED_009',
        retryable: true,
      });
      const started = await runtime.startStructured({
        requestId: randomUUID(),
        run: {
          projectId: project.projectId,
          chapterId: chapter.id,
          baseDraftId: draft.draftId,
          baseDraftRevision: draft.revision,
          runType: 'chapter',
          promptId: 'worldforge.chapter',
          promptVersion: 1,
          outputMode: 'structured',
          providerId: 'stub',
          actualModel: 'deterministic-v1',
          supportStatus: 'unverified',
          constraintPackage: ConstraintPackageSchema.parse({
            projectId: project.projectId,
            chapterId: chapter.id,
            taskType: 'chapter',
            snapshotSource: 'fallback_live_query',
            sections: { P0: [], P1: [], P2: [], P3: [], P4: [] },
            sourceVersionIds: [],
            estimatedTokens: 0,
            budget: {
              maxInputTokens: 32_768,
              safetyMarginTokens: 2_048,
              usableTokens: 30_720,
            },
            contentHash: 'a'.repeat(64),
            constraintHash: 'b'.repeat(64),
            trimLog: [],
            conflicts: [],
          }),
        },
        provider: {
          async *generate() {
            yield { type: 'connected' as const };
            yield { type: 'delta' as const, text: '{"blocks":[{"text":"未闭合' };
            throw interrupted;
          },
        },
        requestFor: (runId) =>
          GenerationRequestSchema.parse({
            runId,
            model: 'deterministic-v1',
            systemPrompt: '只输出结构化章节。',
            messages: [{ role: 'user', content: '生成章节。' }],
            maxOutputTokens: 1_000,
            structuredOutput: { name: 'chapter_candidate_v1', schema: {} },
            metadata: {
              promptId: 'worldforge.chapter',
              promptVersion: 1,
              taskType: 'chapter',
              constraintHash: 'b'.repeat(64),
            },
          }),
        partialOnFailure: true,
        complete: async () => {
          throw new Error('不应完成');
        },
      });
      await runtime.waitFor(started.run.runId);

      expect(runs.get({ projectId: project.projectId, runId: started.run.runId })).toMatchObject({
        status: 'failed',
        errorCode: 'AI_STREAM_INTERRUPTED_009',
        partialStatus: 'unavailable',
        resultRefs: [],
      });
      await expect(
        runs.savePartial(randomUUID(), {
          projectId: project.projectId,
          runId: started.run.runId,
        }),
      ).rejects.toMatchObject({ code: 'GENERATION_PARTIAL_UNAVAILABLE' });
    } finally {
      tasks.close();
      await workspace.shutdown();
      await appRuntime.close();
    }
  });
});
