import { readFile, rm, writeFile } from 'node:fs/promises';

async function read(path) {
  return readFile(path, 'utf8');
}

async function write(path, content) {
  await writeFile(path, content, 'utf8');
}

function replaceExact(content, before, after, label) {
  const count = content.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, received ${count}`);
  return content.replace(before, after);
}

let contract = await read('packages/contracts/src/candidate.ts');
contract = replaceExact(
  contract,
  `export const CandidateListSchema = z.strictObject({
  candidates: z.array(CandidateSummarySchema),
});

export const CandidateChapterInputSchema = z.strictObject({`,
  `export const CandidateListSchema = z.strictObject({
  candidates: z.array(CandidateSummarySchema),
});

export const CandidateListInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: DraftEntityIdSchema.optional(),
});

export const CandidateChapterInputSchema = z.strictObject({`,
  'candidate list input schema',
);
contract = replaceExact(
  contract,
  `  payload: CandidateChapterInputSchema,
});

export const CandidateGetCommandSchema`,
  `  payload: CandidateListInputSchema,
});

export const CandidateGetCommandSchema`,
  'candidate list command payload',
);
contract = replaceExact(
  contract,
  `    operation: z.literal(CANDIDATE_COMMANDS.listCandidates),
    input: CandidateChapterInputSchema,
  }),`,
  `    operation: z.literal(CANDIDATE_COMMANDS.listCandidates),
    input: CandidateListInputSchema,
  }),`,
  'core candidate list input',
);
contract = replaceExact(
  contract,
  `export type CandidateList = z.infer<typeof CandidateListSchema>;
export type CandidateChapterInput`,
  `export type CandidateList = z.infer<typeof CandidateListSchema>;
export type CandidateListInput = z.infer<typeof CandidateListInputSchema>;
export type CandidateChapterInput`,
  'candidate list input type',
);
await write('packages/contracts/src/candidate.ts', contract);

let service = await read('packages/core-service/src/candidate.ts');
service = replaceExact(
  service,
  `  CandidateGetInputSchema,
  CandidateListSchema,`,
  `  CandidateGetInputSchema,
  CandidateListInputSchema,
  CandidateListSchema,`,
  'candidate service schema import',
);
service = replaceExact(
  service,
  `  type CandidateGetInput,
  type CandidateList,`,
  `  type CandidateGetInput,
  type CandidateList,
  type CandidateListInput,`,
  'candidate service type import',
);
service = replaceExact(
  service,
  `  list(raw: { readonly projectId: string; readonly chapterId: string }): CandidateList {
    const input = CandidateGetInputSchema.pick({ projectId: true, chapterId: true }).parse(raw);
    return this.#workspace.readProject(input.projectId, (database) => {
      const rows = database
        .prepare(
          \`${summaryQuery('ca.chapter_id = ? AND p.id = ?')}
           ORDER BY ca.created_at DESC, ca.id DESC\`,
        )
        .all(input.chapterId, input.projectId) as unknown as CandidateSummaryRow[];
      return CandidateListSchema.parse({ candidates: rows.map(mapSummary) });
    });
  }`,
  `  list(raw: CandidateListInput): CandidateList {
    const input = CandidateListInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (database) => {
      const statement = input.chapterId
        ? database.prepare(
            \`${summaryQuery('ca.chapter_id = ? AND p.id = ?')}
             ORDER BY ca.created_at DESC, ca.id DESC\`,
          )
        : database.prepare(
            \`${summaryQuery('p.id = ?')}
             ORDER BY ca.created_at DESC, ca.id DESC\`,
          );
      const rows = (input.chapterId
        ? statement.all(input.chapterId, input.projectId)
        : statement.all(input.projectId)) as unknown as CandidateSummaryRow[];
      return CandidateListSchema.parse({ candidates: rows.map(mapSummary) });
    });
  }`,
  'candidate service project list',
);
await write('packages/core-service/src/candidate.ts', service);

let preload = await read('apps/desktop/preload/src/index.ts');
preload = replaceExact(
  preload,
  `    readonly list: (projectId: string, chapterId: string) => Promise<CommandResult<CandidateList>>;`,
  `    readonly list: (
      projectId: string,
      chapterId?: string,
    ) => Promise<CommandResult<CandidateList>>;`,
  'preload candidate bridge list',
);
preload = replaceExact(
  preload,
  `    list: (projectId, chapterId) =>
      invoke(
        CANDIDATE_IPC_CHANNELS.listCandidates,
        CandidateListCommandSchema.parse(
          envelope(CANDIDATE_COMMANDS.listCandidates, { projectId, chapterId }),
        ),
        CandidateListResultSchema,
      ),`,
  `    list: (projectId, chapterId) =>
      invoke(
        CANDIDATE_IPC_CHANNELS.listCandidates,
        CandidateListCommandSchema.parse(
          envelope(CANDIDATE_COMMANDS.listCandidates, {
            projectId,
            ...(chapterId ? { chapterId } : {}),
          }),
        ),
        CandidateListResultSchema,
      ),`,
  'preload candidate payload',
);
await write('apps/desktop/preload/src/index.ts', preload);

let globalTypes = await read('apps/desktop/renderer/src/global.d.ts');
globalTypes = replaceExact(
  globalTypes,
  `  readonly list: (projectId: string, chapterId: string) => Promise<CommandResult<CandidateList>>;`,
  `  readonly list: (
    projectId: string,
    chapterId?: string,
  ) => Promise<CommandResult<CandidateList>>;`,
  'renderer global candidate list',
);
await write('apps/desktop/renderer/src/global.d.ts', globalTypes);

let adapter = await read('apps/desktop/renderer/src/bridge/renderer-bridge-adapter.ts');
adapter = replaceExact(
  adapter,
  `  readonly list: (projectId: string, chapterId: string) => Promise<CommandResult<CandidateList>>;`,
  `  readonly list: (
    projectId: string,
    chapterId?: string,
  ) => Promise<CommandResult<CandidateList>>;`,
  'renderer adapter candidate list',
);
await write('apps/desktop/renderer/src/bridge/renderer-bridge-adapter.ts', adapter);

let attention = await read('apps/desktop/renderer/src/runtime/workspace-attention.ts');
attention = replaceExact(
  attention,
  `export async function loadWorkspaceAttention(
  bridge: RendererBridgeAdapter,
  projectId: string,
  chapterId: string | null,
): Promise<WorkspaceAttention> {
  const [candidateOutcome, proposalOutcome, validationOutcome, searchOutcome] = await Promise.all([
    chapterId
      ? guarded(() => bridge.candidate.list(projectId, chapterId, { mode: 'replace' }))
      : Promise.resolve(null),`,
  `export async function loadWorkspaceAttention(
  bridge: RendererBridgeAdapter,
  projectId: string,
): Promise<WorkspaceAttention> {
  const [candidateOutcome, proposalOutcome, validationOutcome, searchOutcome] = await Promise.all([
    guarded(() => bridge.candidate.list(projectId, undefined, { mode: 'replace' })),`,
  'workspace attention project candidate list',
);
attention = replaceExact(
  attention,
  `  if (chapterId && candidateOutcome?.state !== 'success') unavailableSources.push('candidate');`,
  `  if (candidateOutcome?.state !== 'success') unavailableSources.push('candidate');`,
  'workspace candidate unavailable',
);
await write('apps/desktop/renderer/src/runtime/workspace-attention.ts', attention);

let appShell = await read('apps/desktop/renderer/src/app/app-shell-m3.tsx');
appShell = replaceExact(
  appShell,
  `    const next = await loadWorkspaceAttention(
      bridge,
      activeProject.projectId,
      continuation?.chapterId ?? null,
    );`,
  `    const next = await loadWorkspaceAttention(bridge, activeProject.projectId);`,
  'app shell project attention call',
);
appShell = replaceExact(
  appShell,
  `  }, [activeProject, bridge, continuation?.chapterId]);`,
  `  }, [activeProject, bridge]);`,
  'app shell attention dependencies',
);
await write('apps/desktop/renderer/src/app/app-shell-m3.tsx', appShell);

await write(
  'tests/integration/candidate-project-list.test.ts',
  `import { randomUUID } from 'node:crypto';
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

      const createCandidate = async (chapterId: string, title: string, completeness: 'complete' | 'partial') => {
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
              text: \`\${title}正文\`,
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
`,
);

await rm('scripts/m8-02-candidate-project-list-codemod.mjs');
await rm('.github/workflows/m8-02-candidate-project-list-codemod.yml');
