import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { DraftService, type DraftServiceError } from '../../packages/core-service/src/draft.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import {
  arrayArbitrary,
  assertProperty,
  SequenceIdFactory,
  stringArbitrary,
} from '../../packages/testkit/src/index.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-08-11T06:30:00.000Z') };

interface Harness {
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly drafts: DraftService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-reliability-draft-'));
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
  };
}

async function closeHarness(harness: Harness): Promise<void> {
  await harness.workspace.shutdown();
  await harness.appRuntime.close();
}

function patchLogCount(harness: Harness, projectId: string): number {
  return harness.workspace.readProject(projectId, (connection) =>
    Number(connection.prepare('SELECT COUNT(*) AS count FROM draft_patch_log').get()?.count ?? 0),
  );
}

const generatedContent = stringArbitrary({
  alphabet: [
    'a',
    'Z',
    '0',
    ' ',
    '，',
    '。',
    '“',
    '”',
    '中',
    '雨',
    '龘',
    '🌧',
    '🗡',
    '\n',
    '\r',
    '\t',
    '{',
    '}',
    '*',
    '#',
  ],
  minLength: 0,
  maxLength: 32,
});
const generatedSequence = arrayArbitrary(generatedContent, { minLength: 1, maxLength: 8 });

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('reliability: Draft CAS property invariants', () => {
  it('preserves the newest committed state across generated and shrinkable update sequences', async () => {
    await assertProperty(
      generatedSequence,
      async (sequence) => {
        const harness = await createHarness();
        const ids = new SequenceIdFactory();
        try {
          const project = await harness.workspace.create(
            ids.nextUuid(),
            { name: 'CAS属性测试项目', channel: '长篇' },
            harness.parent,
          );
          const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
          let current = await harness.drafts.open(ids.nextUuid(), {
            projectId: project.projectId,
            chapterId: chapter.id,
          });
          const logicalBlockId = current.blocks[0]!.logicalBlockId;

          for (const [index, content] of sequence.entries()) {
            const before = current;
            const committed = await harness.drafts.applyPatch(ids.nextUuid(), {
              projectId: project.projectId,
              chapterId: chapter.id,
              draftId: before.draftId,
              baseRevision: before.revision,
              operations: [
                {
                  type: 'update',
                  logicalBlockId,
                  expectedHash: before.blocks[0]!.contentHash!,
                  content,
                },
              ],
            });

            expect(committed.revision).toBe(before.revision + 1);
            expect(committed.blocks[0]!.text).toBe(
              content.replaceAll('\r\n', '\n').replaceAll('\r', '\n').normalize('NFC'),
            );
            expect(committed.blocks[0]!.contentHash).toMatch(/^[0-9a-f]{64}$/u);

            await expect(
              harness.drafts.applyPatch(ids.nextUuid(), {
                projectId: project.projectId,
                chapterId: chapter.id,
                draftId: before.draftId,
                baseRevision: before.revision,
                operations: [
                  {
                    type: 'update',
                    logicalBlockId,
                    expectedHash: committed.blocks[0]!.contentHash!,
                    content: `stale-overwrite-${index}`,
                  },
                ],
              }),
            ).rejects.toMatchObject<DraftServiceError>({ code: 'DRAFT_REVISION_CONFLICT' });

            const reopened = await harness.drafts.open(ids.nextUuid(), {
              projectId: project.projectId,
              chapterId: chapter.id,
            });
            expect(reopened).toEqual(committed);
            current = committed;
          }

          expect(current.revision).toBe(sequence.length);
          expect(patchLogCount(harness, project.projectId)).toBe(sequence.length);
        } finally {
          await closeHarness(harness);
        }
      },
      { seed: 0x5746_4341, runs: 16, maxShrinks: 32 },
    );
  });
});
