import type {
  CommandResult,
  ContinuityCatalog,
  ContinuityListInput,
  EntityStateInvalidateInput,
  EntityStateSetInput,
  KnowledgeStateInvalidateInput,
  KnowledgeStateSetInput,
  TimelineEventArchiveInput,
  TimelineEventSaveInput,
} from '@worldforge/contracts';

declare global {
  interface Window {
    readonly worldforgeContinuity: {
      list(input: ContinuityListInput): Promise<CommandResult<ContinuityCatalog>>;
      setEntityState(input: EntityStateSetInput): Promise<CommandResult<ContinuityCatalog>>;
      invalidateEntityState(
        input: EntityStateInvalidateInput,
      ): Promise<CommandResult<ContinuityCatalog>>;
      saveTimelineEvent(input: TimelineEventSaveInput): Promise<CommandResult<ContinuityCatalog>>;
      archiveTimelineEvent(
        input: TimelineEventArchiveInput,
      ): Promise<CommandResult<ContinuityCatalog>>;
      setKnowledgeState(input: KnowledgeStateSetInput): Promise<CommandResult<ContinuityCatalog>>;
      invalidateKnowledgeState(
        input: KnowledgeStateInvalidateInput,
      ): Promise<CommandResult<ContinuityCatalog>>;
    };
  }
}

export {};
