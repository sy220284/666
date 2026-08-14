import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ConstraintPackageSchema, GenerationRequestSchema } from '@worldforge/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { GenerationRunService } from '../../packages/core-service/src/generation-run.js';
import {
  GenerationRuntime,
  type GenerationRuntimeProvider,
} from '../../packages/core-service/src/generation-runtime.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { ResearchService } from '../../packages/core-service/src/research-service.js';
import { TaskProtocol } from '../../packages/core-service/src/task-protocol.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-08-14T13:30:00.000Z') };

interface Harness {
  readonly root: string;
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly drafts: DraftService;
  readonly research: ResearchService;
  readonly runs: GenerationRunService;
  readonly tasks: TaskProtocol;
  readonly runtime: GenerationRuntime;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-m12-02-generation-research-'));
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
  const runs = new GenerationRunService(workspace, { clock });
  const tasks = new TaskProtocol();
  return {
    root,
    parent,
    appRuntime,
    workspace,
    structure: new ProjectStructureService(workspace, { clock }),
    drafts: new DraftService(workspace, { clock }),
    research: new ResearchService(workspace, { clock }),
    runs,
    tasks,
    runtime: new GenerationRuntime(runs, tasks),
  };
}

async function closeHarness(harness: Harness): Promise<void> {
  harness.tasks.close();
  await harness.workspace.shutdown();
  await harness.appRuntime.close();
}

function constraints(projectId: string, chapterId: string) {
  return ConstraintPackageSchema.parse({
    projectId,
    chapterId,
    taskType: 'chapter',
    snapshotSource: 'fallback_live_query',
    sections: { P0: [], P1: [], P2: [], P3: [], P4: [] },
    sourceVersionIds: [],
    estimatedTokens: 0,
    budget: { maxInputTokens: 32_768, safetyMarginTokens: 2_048, usableTokens: 30_720 },
    contentHash: 'a'.repeat(64),
    constraintHash: 'b'.repeat(64),
    trimLog: [],
    conflicts: [],
  });
}

function request(runId: string) {
  return GenerationRequestSchema.parse({
    runId,
    model: 'deterministic-v1',
    systemPrompt: '只输出正文。',
    messages: [{ role: 'user', content: '写一段正文。' }],
    maxOutputTokens: 1_000,
    metadata: {
      promptId: 'worldforge.chapter',
      promptVersion: 1,
      taskType: 'chapter',
      constraintHash: 'b'.repeat(64),
    },
  });
}

function capturingProvider(capture: (messages: readonly string[]) => void): GenerationRuntimeProvider {
  return {
    async *generate(providerRequest) {
      capture(providerRequest.messages.map((message) => message.content));
      yield { type: 'connected' };
      yield { type: 'delta', text: '生成正文。' };
      yield { type: 'completed' };
    },
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M12-02 explicit research references in generation', () => {
  it('injects only explicitly selected research into one Provider request', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '研究资料显式引用', channel: '长篇' },
        harness.parent,
      );
      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      const draft = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      const selectedCatalog = await harness.research.createNote(randomUUID(), {
        projectId: project.projectId,
        title: '选中的地方志',
        body: '只允许这段资料进入本次 Provider 输入。',
        sourceType: 'archive',
        sourceLabel: '县志',
        sourceUri: 'archive:county',
        tags: ['地理'],
      });
      const selectedNote = selectedCatalog.notes[0]!;
      const unselectedCatalog = await harness.research.createNote(randomUUID(), {
        projectId: project.projectId,
        title: '未选择的秘密资料',
        body: '这段内容绝不能自动进入 Provider 输入。',
        sourceType: null,
        sourceLabel: null,
        sourceUri: null,
        tags: [],
      });
      const unselectedNote = unselectedCatalog.notes.find((note) => note.id !== selectedNote.id)!;
      const attachmentSource = path.join(harness.root, 'reference.txt');
      await writeFile(attachmentSource, '附件原文不得被自动解析进 Provider。', 'utf8');
      const attachmentCatalog = await harness.research.importAttachment(
        randomUUID(),
        { projectId: project.projectId, noteId: selectedNote.id },
        attachmentSource,
      );
      const attachment = attachmentCatalog.attachments[0]!;

      let messagesWithoutSelection: readonly string[] = [];
      const withoutSelection = await harness.runtime.startProse({
        requestId: randomUUID(),
        run: {
          projectId: project.projectId,
          chapterId: chapter.id,
          baseDraftId: draft.draftId,
          baseDraftRevision: draft.revision,
          runType: 'chapter',
          promptId: 'worldforge.chapter',
          promptVersion: 1,
          outputMode: 'text',
          providerId: 'stub',
          actualModel: 'deterministic-v1',
          supportStatus: 'unverified',
          constraintPackage: constraints(project.projectId, chapter.id),
        },
        provider: capturingProvider((messages) => {
          messagesWithoutSelection = messages;
        }),
        requestFor: request,
        candidate: { title: '无资料候选', candidateType: 'full' },
        parse: (text) => [{ blockType: 'paragraph', text, attributes: {} }],
      });
      await harness.runtime.waitFor(withoutSelection.run.runId);
      expect(messagesWithoutSelection).toEqual(['写一段正文。']);

      let messagesWithSelection: readonly string[] = [];
      const withSelection = await harness.runtime.startProse({
        requestId: randomUUID(),
        run: {
          projectId: project.projectId,
          chapterId: chapter.id,
          baseDraftId: draft.draftId,
          baseDraftRevision: draft.revision,
          runType: 'chapter',
          promptId: 'worldforge.chapter',
          promptVersion: 1,
          outputMode: 'text',
          providerId: 'stub',
          actualModel: 'deterministic-v1',
          supportStatus: 'unverified',
          constraintPackage: constraints(project.projectId, chapter.id),
          researchReferences: [
            { sourceType: 'note', sourceId: selectedNote.id },
            { sourceType: 'attachment', sourceId: attachment.id },
          ],
        },
        provider: capturingProvider((messages) => {
          messagesWithSelection = messages;
        }),
        requestFor: request,
        candidate: { title: '资料候选', candidateType: 'full' },
        parse: (text) => [{ blockType: 'paragraph', text, attributes: {} }],
      });
      await harness.runtime.waitFor(withSelection.run.runId);

      expect(messagesWithSelection).toHaveLength(2);
      const researchMessage = messagesWithSelection[1]!;
      expect(researchMessage).toContain('【作者显式研究资料】');
      expect(researchMessage).toContain(selectedNote.title);
      expect(researchMessage).toContain(selectedNote.body);
      expect(researchMessage).toContain(`研究附件：${attachment.displayName}`);
      expect(researchMessage).toContain(`SHA-256：${attachment.contentHash}`);
      expect(researchMessage).toContain('附件正文未自动解析');
      expect(researchMessage).not.toContain(unselectedNote.title);
      expect(researchMessage).not.toContain(unselectedNote.body);
      expect(researchMessage).not.toContain('附件原文不得被自动解析进 Provider。');
    } finally {
      await closeHarness(harness);
    }
  });
});
