import type {
  CandidateApplyInput,
  CandidateApplyOutcome,
  CandidateCreateFixtureInput,
  CandidateDiscardInput,
  CandidateDocument,
  CandidateGetInput,
  CandidateList,
  CandidatePreview,
  CandidatePreviewCancel,
  CandidatePreviewInput,
  CandidateSummary,
  CandidateUndoInput,
  CandidateUndoLookup,
  CandidateUndoLookupInput,
  CandidateUndoOutcome,
  CandidateUndoPreview,
  CandidateUndoPreviewInput,
  CommandResult,
  VersionCreateInput,
  WorldforgeBridge,
} from '@worldforge/contracts';

type RendererVersionCreateInput = Omit<VersionCreateInput, 'versionType'> & {
  readonly versionType?: VersionCreateInput['versionType'];
};

type RendererCandidateBridge = {
  readonly createFixture: (
    input: CandidateCreateFixtureInput,
  ) => Promise<CommandResult<CandidateDocument>>;
  readonly list: (projectId: string, chapterId: string) => Promise<CommandResult<CandidateList>>;
  readonly get: (input: CandidateGetInput) => Promise<CommandResult<CandidateDocument>>;
  readonly discard: (input: CandidateDiscardInput) => Promise<CommandResult<CandidateSummary>>;
};

type RendererWorldforgeBridge = Omit<WorldforgeBridge, 'version'> & {
  readonly candidate: RendererCandidateBridge;
  readonly version: Omit<WorldforgeBridge['version'], 'create'> & {
    readonly create: (
      input: RendererVersionCreateInput,
    ) => ReturnType<WorldforgeBridge['version']['create']>;
  };
};

type RendererCandidateActionBridge = {
  readonly preview: (
    input: CandidatePreviewInput,
    requestId?: string,
  ) => Promise<CommandResult<CandidatePreview>>;
  readonly cancelPreview: (
    previewRequestId: string,
  ) => Promise<CommandResult<CandidatePreviewCancel>>;
  readonly apply: (input: CandidateApplyInput) => Promise<CommandResult<CandidateApplyOutcome>>;
  readonly findUndoRecord: (
    input: CandidateUndoLookupInput,
  ) => Promise<CommandResult<CandidateUndoLookup>>;
  readonly previewUndo: (
    input: CandidateUndoPreviewInput,
  ) => Promise<CommandResult<CandidateUndoPreview>>;
  readonly undo: (input: CandidateUndoInput) => Promise<CommandResult<CandidateUndoOutcome>>;
};

declare global {
  interface Window {
    readonly worldforge: RendererWorldforgeBridge;
    readonly worldforgeCandidatePreview: RendererCandidateActionBridge;
  }
}

export {};
