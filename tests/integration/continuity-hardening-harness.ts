import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ContinuityService } from '../../packages/core-service/src/continuity.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { EntityCanonService } from '../../packages/core-service/src/entity-canon.js';
import { NarrativePlanningService } from '../../packages/core-service/src/narrative-planning.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { StateProposalService } from '../../packages/core-service/src/state-proposal.js';
import { VersionService } from '../../packages/core-service/src/version.js';

const temporaryDirectories: string[] = [];
export const hardeningClock = { now: () => new Date('2026-07-20T06:00:00.000Z') };

export async function createContinuityHarness() {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-continuity-hardening-'));
  temporaryDirectories.push(root);
  const parent = path.join(root, 'projects');
  await mkdir(parent, { recursive: true });
  const appRuntime: AppRuntime = await openAppRuntime({
    databasePath: path.join(root, 'app.sqlite'),
    migrationsDirectory: 'migrations/app',
    recoveryDirectory: path.join(root, 'app-recovery'),
    appVersion: '0.1.0',
    clock: hardeningClock,
  });
  const workspace = new ProjectWorkspaceService({
    projectMigrationsDirectory: 'migrations/project',
    projectMigrationRecoveryDirectory: path.join(root, 'project-migration-recovery'),
    appVersion: '0.1.0',
    recentProjects: appRuntime.recentProjects,
    clock: hardeningClock,
  });
  return {
    parent,
    appRuntime,
    workspace,
    structure: new ProjectStructureService(workspace, { clock: hardeningClock }),
    drafts: new DraftService(workspace, { clock: hardeningClock }),
    versions: new VersionService(workspace, { clock: hardeningClock }),
    canon: new EntityCanonService(workspace, { clock: hardeningClock }),
    continuity: new ContinuityService(workspace, { clock: hardeningClock }),
    narrative: new NarrativePlanningService(workspace, { clock: hardeningClock }),
    proposals: new StateProposalService(workspace, { clock: hardeningClock }),
  };
}

export type ContinuityHarness = Awaited<ReturnType<typeof createContinuityHarness>>;

export async function closeContinuityHarness(value: ContinuityHarness): Promise<void> {
  await value.workspace.shutdown();
  await value.appRuntime.close();
}

export async function cleanupContinuityHarnesses(): Promise<void> {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
}

export async function seedContinuity(value: ContinuityHarness) {
  const project = await value.workspace.create(
    randomUUID(),
    { name: '连续性强化测试', channel: '长篇' },
    value.parent,
  );
  const initial = value.structure.list(project.projectId);
  const volume = initial.volumes[0]!;
  const chapter1 = volume.chapters[0]!;
  const chapters = [chapter1];
  for (const title of ['第二章', '第三章', '第四章']) {
    const structure = await value.structure.createChapter(randomUUID(), {
      projectId: project.projectId,
      volumeId: volume.id,
      title,
    });
    chapters.push(structure.volumes[0]!.chapters.at(-1)!);
  }
  const [chapter2, chapter3, chapter4] = chapters.slice(1);
  const draft = await value.drafts.open(randomUUID(), {
    projectId: project.projectId,
    chapterId: chapter1.id,
  });
  const version = await value.versions.create(randomUUID(), {
    projectId: project.projectId,
    chapterId: chapter1.id,
    draftId: draft.draftId,
    baseRevision: draft.revision,
    title: '连续性强化来源',
  });
  let catalog = await value.canon.create(randomUUID(), {
    projectId: project.projectId,
    authority: 'author',
    entityType: 'character',
    name: '沈砚',
    aliases: [],
    summary: '',
  });
  const character = catalog.entities[0]!;
  catalog = await value.canon.create(randomUUID(), {
    projectId: project.projectId,
    authority: 'author',
    entityType: 'location',
    name: '南城',
    aliases: [],
    summary: '',
  });
  const south = catalog.entities.find((entity) => entity.name === '南城')!;
  catalog = await value.canon.create(randomUUID(), {
    projectId: project.projectId,
    authority: 'author',
    entityType: 'location',
    name: '北城',
    aliases: [],
    summary: '',
  });
  const north = catalog.entities.find((entity) => entity.name === '北城')!;
  return {
    project,
    chapter1,
    chapter2: chapter2!,
    chapter3: chapter3!,
    chapter4: chapter4!,
    draft,
    version,
    character,
    south,
    north,
  };
}

export function listContinuityAt(value: ContinuityHarness, projectId: string, chapterId: string) {
  return value.continuity.list({
    projectId,
    query: '',
    includeHistory: false,
    includeArchivedEvents: false,
    effectiveAtChapterId: chapterId,
  });
}
