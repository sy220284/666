import {
  APP_COMMANDS,
  CANDIDATE_COMMANDS,
  CANDIDATE_IPC_CHANNELS,
  CandidateCreateFixtureCommandSchema,
  CandidateDiscardCommandSchema,
  CandidateDocumentResultSchema,
  CandidateEditSkeletonCommandSchema,
  CandidateGetCommandSchema,
  CandidateListCommandSchema,
  CandidateListResultSchema,
  CandidateSummaryResultSchema,
  DraftApplyPatchCommandSchema,
  DraftDocumentResultSchema,
  DraftOpenCommandSchema,
  IPC_CHANNELS,
  VersionCreateCommandSchema,
  VersionDocumentResultSchema,
  VersionGetCommandSchema,
  VersionListCommandSchema,
  VersionListResultSchema,
  VersionRestoreCommandSchema,
  VersionRestoreResultSchema,
  VersionSetFinalCommandSchema,
  VersionSummaryResultSchema,
  type CandidateCreateFixtureInput,
  type CandidateDiscardInput,
  type CandidateDocument,
  type CandidateEditSkeletonInput,
  type CandidateGetInput,
  type CandidateList,
  type CandidateSummary,
  type CommandResult,
  type WorldforgeBridge,
} from '@worldforge/contracts';
import { envelope, invoke } from './bridge-runtime.js';

export type CandidateBridge = {
  readonly candidate: {
    readonly createFixture: (
      input: CandidateCreateFixtureInput,
    ) => Promise<CommandResult<CandidateDocument>>;
    readonly list: (projectId: string, chapterId?: string) => Promise<CommandResult<CandidateList>>;
    readonly get: (input: CandidateGetInput) => Promise<CommandResult<CandidateDocument>>;
    readonly discard: (input: CandidateDiscardInput) => Promise<CommandResult<CandidateSummary>>;
    readonly editSkeleton: (
      input: CandidateEditSkeletonInput,
    ) => Promise<CommandResult<CandidateDocument>>;
  };
};

export function createWritingBridge(): Pick<WorldforgeBridge, 'draft' | 'version'> &
  CandidateBridge {
  return {
    draft: {
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
          CANDIDATE_IPC_CHANNELS.createFixtureCandidate,
          CandidateCreateFixtureCommandSchema.parse(
            envelope(CANDIDATE_COMMANDS.createFixtureCandidate, input),
          ),
          CandidateDocumentResultSchema,
        ),
      list: (projectId, chapterId) =>
        invoke(
          CANDIDATE_IPC_CHANNELS.listCandidates,
          CandidateListCommandSchema.parse(
            envelope(CANDIDATE_COMMANDS.listCandidates, {
              projectId,
              ...(chapterId ? { chapterId } : {}),
            }),
          ),
          CandidateListResultSchema,
        ),
      get: (input) =>
        invoke(
          CANDIDATE_IPC_CHANNELS.getCandidate,
          CandidateGetCommandSchema.parse(envelope(CANDIDATE_COMMANDS.getCandidate, input)),
          CandidateDocumentResultSchema,
        ),
      discard: (input) =>
        invoke(
          CANDIDATE_IPC_CHANNELS.discardCandidate,
          CandidateDiscardCommandSchema.parse(envelope(CANDIDATE_COMMANDS.discardCandidate, input)),
          CandidateSummaryResultSchema,
        ),
      editSkeleton: (input) =>
        invoke(
          CANDIDATE_IPC_CHANNELS.editSkeleton,
          CandidateEditSkeletonCommandSchema.parse(
            envelope(CANDIDATE_COMMANDS.editSkeleton, input),
          ),
          CandidateDocumentResultSchema,
        ),
    },
    version: {
      create: (input) =>
        invoke(
          IPC_CHANNELS.createVersion,
          VersionCreateCommandSchema.parse(envelope(APP_COMMANDS.createVersion, input)),
          VersionDocumentResultSchema,
        ),
      list: (projectId, chapterId) =>
        invoke(
          IPC_CHANNELS.listVersions,
          VersionListCommandSchema.parse(
            envelope(APP_COMMANDS.listVersions, { projectId, chapterId }),
          ),
          VersionListResultSchema,
        ),
      get: (input) =>
        invoke(
          IPC_CHANNELS.getVersion,
          VersionGetCommandSchema.parse(envelope(APP_COMMANDS.getVersion, input)),
          VersionDocumentResultSchema,
        ),
      setFinal: (input) =>
        invoke(
          IPC_CHANNELS.setFinalVersion,
          VersionSetFinalCommandSchema.parse(envelope(APP_COMMANDS.setFinalVersion, input)),
          VersionSummaryResultSchema,
        ),
      restore: (input) =>
        invoke(
          IPC_CHANNELS.restoreVersion,
          VersionRestoreCommandSchema.parse(envelope(APP_COMMANDS.restoreVersion, input)),
          VersionRestoreResultSchema,
        ),
    },
  };
}
