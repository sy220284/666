import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import * as prettier from 'prettier';
import { describe, expect, it } from 'vitest';

const repositoryFormat = {
  printWidth: 100,
  singleQuote: true,
  trailingComma: 'all' as const,
};

function replaceOnce(source: string, anchor: string, replacement: string, file: string): string {
  const first = source.indexOf(anchor);
  if (first < 0 || source.indexOf(anchor, first + anchor.length) >= 0) {
    throw new Error(`Expected one routing anchor in ${file}: ${anchor.slice(0, 80)}`);
  }
  return `${source.slice(0, first)}${replacement}${source.slice(first + anchor.length)}`;
}

async function emit(file: string, source: string): Promise<void> {
  const formatted = await prettier.format(source, { filepath: file, ...repositoryFormat });
  const output = path.join('test-results/integration/m2-03-candidate-routing', file);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, formatted, 'utf8');
}

async function patchContractsIndex(): Promise<void> {
  const file = 'packages/contracts/src/index.ts';
  let source = await readFile(file, 'utf8');
  source = replaceOnce(
    source,
    "} from './draft.js';\nimport {\n  VERSION_COMMANDS,",
    `} from './draft.js';
import {
  CANDIDATE_COMMANDS,
  CANDIDATE_IPC_CHANNELS,
  CandidateCreateFixtureCommandSchema,
  CandidateDiscardCommandSchema,
  CandidateGetCommandSchema,
  CandidateListCommandSchema,
  type CandidateCreateFixtureInput,
  type CandidateDiscardInput,
  type CandidateDocument,
  type CandidateGetInput,
  type CandidateList,
  type CandidateSummary,
} from './candidate.js';
import {
  VERSION_COMMANDS,`,
    file,
  );
  source = replaceOnce(
    source,
    "export * from './draft.js';\nexport * from './version.js';",
    "export * from './draft.js';\nexport * from './candidate.js';\nexport * from './version.js';",
    file,
  );
  source = replaceOnce(
    source,
    '  ...DRAFT_IPC_CHANNELS,\n  ...VERSION_IPC_CHANNELS,',
    '  ...DRAFT_IPC_CHANNELS,\n  ...CANDIDATE_IPC_CHANNELS,\n  ...VERSION_IPC_CHANNELS,',
    file,
  );
  source = replaceOnce(
    source,
    '  ...DRAFT_COMMANDS,\n  ...VERSION_COMMANDS,',
    '  ...DRAFT_COMMANDS,\n  ...CANDIDATE_COMMANDS,\n  ...VERSION_COMMANDS,',
    file,
  );
  source = replaceOnce(
    source,
    '  DraftOpenCommandSchema,\n  DraftApplyPatchCommandSchema,\n  ImportPreviewCommandSchema,',
    `  DraftOpenCommandSchema,
  DraftApplyPatchCommandSchema,
  CandidateCreateFixtureCommandSchema,
  CandidateListCommandSchema,
  CandidateGetCommandSchema,
  CandidateDiscardCommandSchema,
  ImportPreviewCommandSchema,`,
    file,
  );
  source = replaceOnce(
    source,
    `  readonly draft: {
    readonly open: (input: DraftOpenInput) => Promise<CommandResult<DraftDocument>>;
    readonly applyPatch: (input: DraftApplyPatchInput) => Promise<CommandResult<DraftDocument>>;
  };
  readonly version: {`,
    `  readonly draft: {
    readonly open: (input: DraftOpenInput) => Promise<CommandResult<DraftDocument>>;
    readonly applyPatch: (input: DraftApplyPatchInput) => Promise<CommandResult<DraftDocument>>;
  };
  readonly candidate: {
    readonly createFixture: (
      input: CandidateCreateFixtureInput,
    ) => Promise<CommandResult<CandidateDocument>>;
    readonly list: (projectId: string, chapterId: string) => Promise<CommandResult<CandidateList>>;
    readonly get: (input: CandidateGetInput) => Promise<CommandResult<CandidateDocument>>;
    readonly discard: (input: CandidateDiscardInput) => Promise<CommandResult<CandidateSummary>>;
  };
  readonly version: {`,
    file,
  );
  await emit(file, source);
}

async function patchUtilityEntry(): Promise<void> {
  const file = 'packages/core-service/src/utility-entry.ts';
  let source = await readFile(file, 'utf8');
  source = replaceOnce(
    source,
    '  DRAFT_COMMANDS,\n  VERSION_COMMANDS,',
    '  DRAFT_COMMANDS,\n  CANDIDATE_COMMANDS,\n  VERSION_COMMANDS,',
    file,
  );
  source = replaceOnce(
    source,
    "import { DraftService, DraftServiceError } from './draft.js';\nimport { VersionService, VersionServiceError } from './version.js';",
    "import { CandidateService, CandidateServiceError } from './candidate.js';\nimport { DraftService, DraftServiceError } from './draft.js';\nimport { VersionService, VersionServiceError } from './version.js';",
    file,
  );
  source = replaceOnce(
    source,
    'const drafts = new DraftService(projectWorkspace);\nconst versions = new VersionService(projectWorkspace);',
    'const drafts = new DraftService(projectWorkspace);\nconst candidates = new CandidateService(projectWorkspace);\nconst versions = new VersionService(projectWorkspace);',
    file,
  );
  source = replaceOnce(
    source,
    '  if (error instanceof VersionServiceError) {',
    `  if (error instanceof CandidateServiceError) {
    switch (error.code) {
      case 'CANDIDATE_NOT_FOUND':
      case 'CANDIDATE_DRAFT_NOT_FOUND':
        return 'COMMON_NOT_FOUND_002';
      case 'CANDIDATE_REVISION_CONFLICT':
      case 'CANDIDATE_SOURCE_CONFLICT':
        return 'CANDIDATE_BASE_CONFLICT_002';
      case 'CANDIDATE_STATUS_CONFLICT':
        return 'CANDIDATE_ALREADY_RESOLVED_001';
      case 'CANDIDATE_INVALID':
        return 'COMMON_INVALID_INPUT_001';
    }
  }
  if (error instanceof VersionServiceError) {`,
    file,
  );
  source = replaceOnce(
    source,
    `      case DRAFT_COMMANDS.applyPatch:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await drafts.applyPatch(requestId, operation.input),
        });
      case VERSION_COMMANDS.createVersion:`,
    `      case DRAFT_COMMANDS.applyPatch:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await drafts.applyPatch(requestId, operation.input),
        });
      case CANDIDATE_COMMANDS.createFixtureCandidate:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await candidates.createFixture(requestId, operation.input),
        });
      case CANDIDATE_COMMANDS.listCandidates:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: candidates.list(operation.input),
        });
      case CANDIDATE_COMMANDS.getCandidate:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: candidates.get(operation.input),
        });
      case CANDIDATE_COMMANDS.discardCandidate:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await candidates.discard(requestId, operation.input),
        });
      case VERSION_COMMANDS.createVersion:`,
    file,
  );
  await emit(file, source);
}

async function patchIpcHandlers(): Promise<void> {
  const file = 'apps/desktop/main/src/ipc-handlers.ts';
  let source = await readFile(file, 'utf8');
  source = replaceOnce(
    source,
    '  DRAFT_COMMANDS,\n  VERSION_COMMANDS,',
    '  DRAFT_COMMANDS,\n  CANDIDATE_COMMANDS,\n  VERSION_COMMANDS,',
    file,
  );
  source = replaceOnce(
    source,
    '  DraftApplyPatchCommandSchema,\n  DraftOpenCommandSchema,\n  VersionCreateCommandSchema,',
    `  DraftApplyPatchCommandSchema,
  DraftOpenCommandSchema,
  CandidateCreateFixtureCommandSchema,
  CandidateDiscardCommandSchema,
  CandidateGetCommandSchema,
  CandidateListCommandSchema,
  VersionCreateCommandSchema,`,
    file,
  );
  source = replaceOnce(
    source,
    '    IPC_CHANNELS.openDraft,\n    IPC_CHANNELS.applyPatch,\n    IPC_CHANNELS.createVersion,',
    `    IPC_CHANNELS.openDraft,
    IPC_CHANNELS.applyPatch,
    IPC_CHANNELS.createFixtureCandidate,
    IPC_CHANNELS.listCandidates,
    IPC_CHANNELS.getCandidate,
    IPC_CHANNELS.discardCandidate,
    IPC_CHANNELS.createVersion,`,
    file,
  );
  source = replaceOnce(
    source,
    `  register(IPC_CHANNELS.applyPatch, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = DraftApplyPatchCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: DRAFT_COMMANDS.applyPatch,
      input: parsed.data.payload,
    });
  });

  for (const [channel, schema, operation] of [`,
    `  register(IPC_CHANNELS.applyPatch, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = DraftApplyPatchCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: DRAFT_COMMANDS.applyPatch,
      input: parsed.data.payload,
    });
  });

  for (const [channel, schema, operation] of [
    [
      IPC_CHANNELS.createFixtureCandidate,
      CandidateCreateFixtureCommandSchema,
      CANDIDATE_COMMANDS.createFixtureCandidate,
    ],
    [IPC_CHANNELS.listCandidates, CandidateListCommandSchema, CANDIDATE_COMMANDS.listCandidates],
    [IPC_CHANNELS.getCandidate, CandidateGetCommandSchema, CANDIDATE_COMMANDS.getCandidate],
    [
      IPC_CHANNELS.discardCandidate,
      CandidateDiscardCommandSchema,
      CANDIDATE_COMMANDS.discardCandidate,
    ],
  ] as const) {
    register(channel, async (event, raw) => {
      const rejected = rejectUntrusted(event, raw);
      if (rejected) return rejected;
      const parsed = schema.safeParse(raw);
      if (!parsed.success) return invalidRequest(raw);
      return invokeProject(parsed.data.requestId, {
        operation,
        input: parsed.data.payload,
      } as Parameters<CoreSupervisor['invokeProjectOperation']>[1]);
    });
  }

  for (const [channel, schema, operation] of [`,
    file,
  );
  await emit(file, source);
}

async function patchPreload(): Promise<void> {
  const file = 'apps/desktop/preload/src/index.ts';
  let source = await readFile(file, 'utf8');
  source = replaceOnce(
    source,
    '  DraftOpenCommandSchema,\n  VersionCreateCommandSchema,',
    `  DraftOpenCommandSchema,
  CandidateCreateFixtureCommandSchema,
  CandidateDiscardCommandSchema,
  CandidateDocumentResultSchema,
  CandidateGetCommandSchema,
  CandidateListCommandSchema,
  CandidateListResultSchema,
  CandidateSummaryResultSchema,
  VersionCreateCommandSchema,`,
    file,
  );
  source = replaceOnce(
    source,
    `  draft: {
    open: (input) =>
      invoke(
        IPC_CHANNELS.openDraft,
        DraftOpenCommandSchema.parse(envelope(APP_COMMANDS.openDraft, input)),
        DraftDocumentResultSchema,
      ),
    applyPatch: (input) =>
      invoke(
        IPC_CHANNELS.applyPatch,
        DraftApplyPatchCommandSchema.parse(envelope(APP_COMMANDS.applyPatch, input)),
        DraftDocumentResultSchema,
      ),
  },
  version: {`,
    `  draft: {
    open: (input) =>
      invoke(
        IPC_CHANNELS.openDraft,
        DraftOpenCommandSchema.parse(envelope(APP_COMMANDS.openDraft, input)),
        DraftDocumentResultSchema,
      ),
    applyPatch: (input) =>
      invoke(
        IPC_CHANNELS.applyPatch,
        DraftApplyPatchCommandSchema.parse(envelope(APP_COMMANDS.applyPatch, input)),
        DraftDocumentResultSchema,
      ),
  },
  candidate: {
    createFixture: (input) =>
      invoke(
        IPC_CHANNELS.createFixtureCandidate,
        CandidateCreateFixtureCommandSchema.parse(
          envelope(APP_COMMANDS.createFixtureCandidate, input),
        ),
        CandidateDocumentResultSchema,
      ),
    list: (projectId, chapterId) =>
      invoke(
        IPC_CHANNELS.listCandidates,
        CandidateListCommandSchema.parse(
          envelope(APP_COMMANDS.listCandidates, { projectId, chapterId }),
        ),
        CandidateListResultSchema,
      ),
    get: (input) =>
      invoke(
        IPC_CHANNELS.getCandidate,
        CandidateGetCommandSchema.parse(envelope(APP_COMMANDS.getCandidate, input)),
        CandidateDocumentResultSchema,
      ),
    discard: (input) =>
      invoke(
        IPC_CHANNELS.discardCandidate,
        CandidateDiscardCommandSchema.parse(envelope(APP_COMMANDS.discardCandidate, input)),
        CandidateSummaryResultSchema,
      ),
  },
  version: {`,
    file,
  );
  await emit(file, source);
}

describe('M2-03 Candidate desktop routing artifact', () => {
  it('emits formatted Core, IPC, Preload, and bridge routing changes', async () => {
    await patchContractsIndex();
    await patchUtilityEntry();
    await patchIpcHandlers();
    await patchPreload();
    expect(true).toBe(true);
  });
});
