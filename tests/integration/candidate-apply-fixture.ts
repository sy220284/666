import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import {
  CandidateApplyService,
  type CandidateApplyServiceOptions,
} from '../../packages/core-service/src/candidate-apply.js';
import { CandidateService } from '../../packages/core-service/src/candidate.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

export const candidateApplyTemporaryDirectories: string[] = [];
export const candidateApplyClock = { now: () => new Date('2026-07-18T03:30:00.000Z') };

export interface CandidateApplyHarness {
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly drafts: DraftService;
  readonly candidates: CandidateService;
  readonly candidateApply: CandidateApplyService;
}

export async function createCandidateApplyHarness(
  options: CandidateApplyServiceOptions = {},
): Promise<CandidateApplyHarness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-candidate-apply-'));
  candidateApplyTemporaryDirectories.push(root);
  const parent = path.join(root, 'projects');
  await mkdir(parent, { recursive: true });
  const appRuntime = await openAppRuntime({
    databasePath: path.join(root, 'app.sqlite'),
    migrationsDirectory: 'migrations/app',
    recoveryDirectory: path.join(root, 'app-recovery'),
    appVersion: '0.1.0',
    clock: candidateApplyClock,
  });
  const workspace = new ProjectWorkspaceService({
    projectMigrationsDirectory: 'migrations/project',
    projectMigrationRecoveryDirectory: path.join(root, 'project-migration-recovery'),
    appVersion: '0.1.0',
    recentProjects: appRuntime.recentProjects,
    clock: candidateApplyClock,
  });
  return {
    parent,
    appRuntime,
    workspace,
    structure: new ProjectStructureService(workspace, { clock: candidateApplyClock }),
    drafts: new DraftService(workspace, { clock: candidateApplyClock }),
    candidates: new CandidateService(workspace, { clock: candidateApplyClock }),
    candidateApply: new CandidateApplyService(workspace, {
      clock: candidateApplyClock,
      ...options,
    }),
  };
}

export async function closeCandidateApplyHarness(harness: CandidateApplyHarness): Promise<void> {
  await harness.workspace.shutdown();
  await harness.appRuntime.close();
}

export async function cleanupCandidateApplyDirectories(): Promise<void> {
  await Promise.all(
    candidateApplyTemporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
}

export async function createTwoBlockDraft(harness: CandidateApplyHarness) {
  const project = await harness.workspace.create(
    randomUUID(),
    { name: 'Candidate采用事务', channel: '长篇' },
    harness.parent,
  );
  const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
  const opened = await harness.drafts.open(randomUUID(), {
    projectId: project.projectId,
    chapterId: chapter.id,
  });
  const first = opened.blocks[0]!;
  const draft = await harness.drafts.applyPatch(randomUUID(), {
    projectId: project.projectId,
    chapterId: chapter.id,
    draftId: opened.draftId,
    baseRevision: opened.revision,
    operations: [
      {
        type: 'update',
        logicalBlockId: first.logicalBlockId,
        expectedHash: first.contentHash!,
        content: '当前第一段',
      },
      {
        type: 'insert',
        afterLogicalBlockId: first.logicalBlockId,
        block: { blockType: 'paragraph', content: '当前第二段', attributes: {} },
      },
    ],
  });
  return { project, chapter, draft };
}

export function applyTableCounts(harness: CandidateApplyHarness, projectId: string) {
  return harness.workspace.readProject(projectId, (database) => ({
    patchLog: Number(
      database.prepare('SELECT COUNT(*) AS count FROM draft_patch_log').get()!.count,
    ),
    checkpoints: Number(
      database.prepare('SELECT COUNT(*) AS count FROM candidate_apply_checkpoints').get()!.count,
    ),
    records: Number(
      database.prepare('SELECT COUNT(*) AS count FROM candidate_apply_records').get()!.count,
    ),
    conflicts: Number(
      database.prepare('SELECT COUNT(*) AS count FROM candidate_conflict_sets').get()!.count,
    ),
  }));
}
