import type {
  ArcMilestoneSaveInput,
  ArcMilestoneTransitionInput,
  CharacterArcSaveInput,
  CommandResult,
  ForeshadowingSaveInput,
  ForeshadowingTransitionInput,
  NarrativePlanningCatalog,
  NarrativePlanningListInput,
} from '@worldforge/contracts';

declare global {
  interface Window {
    readonly worldforgeNarrativePlanning: {
      list(input: NarrativePlanningListInput): Promise<CommandResult<NarrativePlanningCatalog>>;
      saveForeshadowing(
        input: ForeshadowingSaveInput,
      ): Promise<CommandResult<NarrativePlanningCatalog>>;
      transitionForeshadowing(
        input: ForeshadowingTransitionInput,
      ): Promise<CommandResult<NarrativePlanningCatalog>>;
      saveCharacterArc(
        input: CharacterArcSaveInput,
      ): Promise<CommandResult<NarrativePlanningCatalog>>;
      saveArcMilestone(
        input: ArcMilestoneSaveInput,
      ): Promise<CommandResult<NarrativePlanningCatalog>>;
      transitionArcMilestone(
        input: ArcMilestoneTransitionInput,
      ): Promise<CommandResult<NarrativePlanningCatalog>>;
    };
  }
}

export {};
