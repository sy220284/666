import type {
  CandidateCreateFixtureInput,
  CandidateDiscardInput,
  CandidateDocument,
  CandidateGetInput,
  CandidateList,
  CandidatePreview,
  CandidatePreviewInput,
  CandidateSummary,
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

type RendererCandidatePreviewBridge = {
  readonly preview: (input: CandidatePreviewInput) => Promise<CommandResult<CandidatePreview>>;
};

declare global {
  interface Window {
    readonly worldforge: RendererWorldforgeBridge;
    readonly worldforgeCandidatePreview: RendererCandidatePreviewBridge;
  }
}

export {};
