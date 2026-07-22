import type {
  ArcMilestoneSaveInput,
  ArcMilestoneTransitionInput,
  CharacterArcSaveInput,
  CommandResult,
  ContinuityCatalog,
  ContinuityListInput,
  EntityStateInvalidateInput,
  EntityStateSetInput,
  ForeshadowingSaveInput,
  ForeshadowingTransitionInput,
  KnowledgeStateInvalidateInput,
  KnowledgeStateSetInput,
  NarrativePlanningCatalog,
  NarrativePlanningListInput,
  StateProposalBridge,
  TaskStreamUpdate,
  TimelineEventArchiveInput,
  TimelineEventSaveInput,
  WorldforgeBridge,
} from '@worldforge/contracts';

import {
  BridgeRequestCoordinator,
  type BridgeRequestOptions,
  type BridgeRequestOutcome,
} from './request-lifecycle.js';

type RendererBridgePort = Pick<
  WorldforgeBridge,
  | 'app'
  | 'settings'
  | 'project'
  | 'recovery'
  | 'textIo'
  | 'planning'
  | 'canon'
  | 'trash'
  | 'draft'
  | 'task'
>;

interface ContinuityBridgePort {
  readonly list: (input: ContinuityListInput) => Promise<CommandResult<ContinuityCatalog>>;
  readonly setEntityState: (
    input: EntityStateSetInput,
  ) => Promise<CommandResult<ContinuityCatalog>>;
  readonly invalidateEntityState: (
    input: EntityStateInvalidateInput,
  ) => Promise<CommandResult<ContinuityCatalog>>;
  readonly saveTimelineEvent: (
    input: TimelineEventSaveInput,
  ) => Promise<CommandResult<ContinuityCatalog>>;
  readonly archiveTimelineEvent: (
    input: TimelineEventArchiveInput,
  ) => Promise<CommandResult<ContinuityCatalog>>;
  readonly setKnowledgeState: (
    input: KnowledgeStateSetInput,
  ) => Promise<CommandResult<ContinuityCatalog>>;
  readonly invalidateKnowledgeState: (
    input: KnowledgeStateInvalidateInput,
  ) => Promise<CommandResult<ContinuityCatalog>>;
}

interface NarrativePlanningBridgePort {
  readonly list: (
    input: NarrativePlanningListInput,
  ) => Promise<CommandResult<NarrativePlanningCatalog>>;
  readonly saveForeshadowing: (
    input: ForeshadowingSaveInput,
  ) => Promise<CommandResult<NarrativePlanningCatalog>>;
  readonly transitionForeshadowing: (
    input: ForeshadowingTransitionInput,
  ) => Promise<CommandResult<NarrativePlanningCatalog>>;
  readonly saveCharacterArc: (
    input: CharacterArcSaveInput,
  ) => Promise<CommandResult<NarrativePlanningCatalog>>;
  readonly saveArcMilestone: (
    input: ArcMilestoneSaveInput,
  ) => Promise<CommandResult<NarrativePlanningCatalog>>;
  readonly transitionArcMilestone: (
    input: ArcMilestoneTransitionInput,
  ) => Promise<CommandResult<NarrativePlanningCatalog>>;
}

interface AuxiliaryRendererBridges {
  readonly continuity: ContinuityBridgePort;
  readonly narrativePlanning: NarrativePlanningBridgePort;
  readonly stateProposal: StateProposalBridge;
}

type AdaptedMethod<Method> = Method extends (
  ...args: infer Args
) => Promise<CommandResult<infer Data>>
  ? (...args: [...Args, options?: BridgeRequestOptions]) => Promise<BridgeRequestOutcome<Data>>
  : never;

type AdaptedDomain<Domain> = {
  readonly [
    Key in keyof Domain as AdaptedMethod<Domain[Key]> extends never ? never : Key
  ]: AdaptedMethod<Domain[Key]>;
};

export interface RendererBridgeAdapter {
  readonly app: AdaptedDomain<WorldforgeBridge['app']>;
  readonly settings: AdaptedDomain<WorldforgeBridge['settings']>;
  readonly project: AdaptedDomain<WorldforgeBridge['project']>;
  readonly recovery: AdaptedDomain<WorldforgeBridge['recovery']>;
  readonly textIo: AdaptedDomain<WorldforgeBridge['textIo']>;
  readonly planning: AdaptedDomain<WorldforgeBridge['planning']>;
  readonly canon: AdaptedDomain<WorldforgeBridge['canon']>;
  readonly trash: AdaptedDomain<WorldforgeBridge['trash']>;
  readonly draft: AdaptedDomain<Pick<WorldforgeBridge['draft'], 'open'>>;
  readonly continuity: AdaptedDomain<ContinuityBridgePort>;
  readonly narrativePlanning: AdaptedDomain<NarrativePlanningBridgePort>;
  readonly stateProposal: AdaptedDomain<StateProposalBridge>;
  readonly task: AdaptedDomain<
    Pick<WorldforgeBridge['task'], 'getSnapshot' | 'cancel' | 'listActive'>
  > & {
    readonly subscribe: (
      listener: (update: TaskStreamUpdate) => void,
      projectId?: string,
    ) => () => void;
  };
  readonly cancelAll: () => void;
}

export function createRendererBridgeAdapter(
  bridge: RendererBridgePort,
  coordinator = new BridgeRequestCoordinator(),
  auxiliary?: AuxiliaryRendererBridges,
): RendererBridgeAdapter {
  const requireAuxiliary = <Domain extends keyof AuxiliaryRendererBridges>(
    domain: Domain,
  ): AuxiliaryRendererBridges[Domain] => {
    const port = auxiliary?.[domain];
    if (port) return port;
    return new Proxy(
      {},
      {
        get() {
          return async () => {
            throw new Error(`The ${domain} preload bridge is unavailable.`);
          };
        },
      },
    ) as AuxiliaryRendererBridges[Domain];
  };

  return {
    app: {
      getInfo: (options) => coordinator.run('app.getInfo', () => bridge.app.getInfo(), options),
      getCoreStatus: (options) =>
        coordinator.run('app.getCoreStatus', () => bridge.app.getCoreStatus(), options),
      restartCore: (options) =>
        coordinator.run('app.restartCore', () => bridge.app.restartCore(), options),
      getWindowPreferences: (options) =>
        coordinator.run(
          'app.getWindowPreferences',
          () => bridge.app.getWindowPreferences(),
          options,
        ),
      setAppearancePreferences: (preferences, options) =>
        coordinator.run(
          'app.setAppearancePreferences',
          () => bridge.app.setAppearancePreferences(preferences),
          options,
        ),
    },
    settings: {
      get: (options) => coordinator.run('settings.get', () => bridge.settings.get(), options),
      set: (settings, options) =>
        coordinator.run('settings.set', () => bridge.settings.set(settings), options),
      reset: (options) => coordinator.run('settings.reset', () => bridge.settings.reset(), options),
    },
    project: {
      listRecent: (options) =>
        coordinator.run('project.listRecent', () => bridge.project.listRecent(), options),
      relocateRecent: (projectId, options) =>
        coordinator.run(
          `project.relocateRecent:${projectId}`,
          () => bridge.project.relocateRecent(projectId),
          options,
        ),
      removeRecent: (projectId, options) =>
        coordinator.run(
          `project.removeRecent:${projectId}`,
          () => bridge.project.removeRecent(projectId),
          options,
        ),
      getActive: (options) =>
        coordinator.run('project.getActive', () => bridge.project.getActive(), options),
      create: (input, options) =>
        coordinator.run('project.create', () => bridge.project.create(input), options),
      openSelected: (options) =>
        coordinator.run('project.openSelected', () => bridge.project.openSelected(), options),
      openRecent: (projectId, options) =>
        coordinator.run(
          `project.openRecent:${projectId}`,
          () => bridge.project.openRecent(projectId),
          options,
        ),
      close: (projectId, options) =>
        coordinator.run(
          `project.close:${projectId}`,
          () => bridge.project.close(projectId),
          options,
        ),
      move: (projectId, options) =>
        coordinator.run(`project.move:${projectId}`, () => bridge.project.move(projectId), options),
    },
    recovery: {
      createCheckpoint: (input, options) =>
        coordinator.run(
          `recovery.createCheckpoint:${input.projectId}`,
          () => bridge.recovery.createCheckpoint(input),
          options,
        ),
      getOverview: (projectId, options) =>
        coordinator.run(
          `recovery.getOverview:${projectId}`,
          () => bridge.recovery.getOverview(projectId),
          options,
        ),
      restoreCheckpoint: (input, options) =>
        coordinator.run(
          `recovery.restoreCheckpoint:${input.backupId}`,
          () => bridge.recovery.restoreCheckpoint(input),
          options,
        ),
      exportVersion: (input, options) =>
        coordinator.run(
          `recovery.exportVersion:${input.versionId}`,
          () => bridge.recovery.exportVersion(input),
          options,
        ),
    },
    textIo: {
      previewImport: (input, options) =>
        coordinator.run(
          `textIo.previewImport:${input.projectId}`,
          () => bridge.textIo.previewImport(input),
          options,
        ),
      commitImport: (input, options) =>
        coordinator.run(
          `textIo.commitImport:${input.projectId}`,
          () => bridge.textIo.commitImport(input),
          options,
        ),
      listExportVersions: (projectId, options) =>
        coordinator.run(
          `textIo.listExportVersions:${projectId}`,
          () => bridge.textIo.listExportVersions(projectId),
          options,
        ),
      exportVersions: (input, options) =>
        coordinator.run(
          `textIo.exportVersions:${input.projectId}`,
          () => bridge.textIo.exportVersions(input),
          options,
        ),
    },
    planning: createPlanningAdapter(bridge, coordinator),
    canon: {
      list: (input, options) =>
        coordinator.run(`canon.list:${input.projectId}`, () => bridge.canon.list(input), options),
      create: (input, options) =>
        coordinator.run(
          `canon.create:${input.projectId}`,
          () => bridge.canon.create(input),
          options,
        ),
      update: (input, options) =>
        coordinator.run(
          `canon.update:${input.entityId}`,
          () => bridge.canon.update(input),
          options,
        ),
      archive: (input, options) =>
        coordinator.run(
          `canon.archive:${input.entityId}`,
          () => bridge.canon.archive(input),
          options,
        ),
      setFact: (input, options) =>
        coordinator.run(
          `canon.setFact:${input.entityId}:${input.factKey}`,
          () => bridge.canon.setFact(input),
          options,
        ),
      linkSceneBeat: (input, options) =>
        coordinator.run(
          `canon.linkSceneBeat:${input.sceneBeatId}:${input.entityId}`,
          () => bridge.canon.linkSceneBeat(input),
          options,
        ),
      previewDelete: (input, options) =>
        coordinator.run(
          `canon.previewDelete:${input.entityId}`,
          () => bridge.canon.previewDelete(input),
          options,
        ),
      delete: (input, options) =>
        coordinator.run(
          `canon.delete:${input.entityId}`,
          () => bridge.canon.delete(input),
          options,
        ),
    },
    trash: {
      list: (projectId, options) =>
        coordinator.run(`trash.list:${projectId}`, () => bridge.trash.list(projectId), options),
      restore: (input, options) =>
        coordinator.run(
          `trash.restore:${input.trashEntryId}`,
          () => bridge.trash.restore(input),
          options,
        ),
      previewPermanentDelete: (input, options) =>
        coordinator.run(
          `trash.previewPermanentDelete:${input.trashEntryId}`,
          () => bridge.trash.previewPermanentDelete(input),
          options,
        ),
      permanentDelete: (input, options) =>
        coordinator.run(
          `trash.permanentDelete:${input.trashEntryId}`,
          () => bridge.trash.permanentDelete(input),
          options,
        ),
    },
    draft: {
      open: (input, options) =>
        coordinator.run(`draft.open:${input.chapterId}`, () => bridge.draft.open(input), options),
    },
    continuity: createContinuityAdapter(requireAuxiliary('continuity'), coordinator),
    narrativePlanning: createNarrativePlanningAdapter(
      requireAuxiliary('narrativePlanning'),
      coordinator,
    ),
    stateProposal: createStateProposalAdapter(requireAuxiliary('stateProposal'), coordinator),
    task: {
      getSnapshot: (taskId, projectId, options) =>
        coordinator.run(
          `task.getSnapshot:${taskId}`,
          () => bridge.task.getSnapshot(taskId, projectId),
          options,
        ),
      cancel: (taskId, projectId, options) =>
        coordinator.run(
          `task.cancel:${taskId}`,
          () => bridge.task.cancel(taskId, projectId),
          options,
        ),
      listActive: (projectId, options) =>
        coordinator.run(
          `task.listActive:${projectId ?? 'application'}`,
          () => bridge.task.listActive(projectId),
          options,
        ),
      subscribe: (listener, projectId) => bridge.task.subscribe(listener, projectId),
    },
    cancelAll: () => coordinator.cancelAll(),
  };
}

export function createWindowRendererBridgeAdapter(): RendererBridgeAdapter {
  if (
    typeof window === 'undefined' ||
    !window.worldforge ||
    !window.worldforgeContinuity ||
    !window.worldforgeNarrativePlanning ||
    !window.worldforgeStateProposal
  ) {
    throw new Error('The trusted WorldForge preload bridge is unavailable.');
  }
  return createRendererBridgeAdapter(window.worldforge, new BridgeRequestCoordinator(), {
    continuity: window.worldforgeContinuity,
    narrativePlanning: window.worldforgeNarrativePlanning,
    stateProposal: window.worldforgeStateProposal,
  });
}

function createPlanningAdapter(
  bridge: RendererBridgePort,
  coordinator: BridgeRequestCoordinator,
): AdaptedDomain<WorldforgeBridge['planning']> {
  const domain = bridge.planning;
  return {
    getBrief: (projectId, options) =>
      coordinator.run(`planning.getBrief:${projectId}`, () => domain.getBrief(projectId), options),
    updateBrief: (input, options) =>
      coordinator.run(
        `planning.updateBrief:${input.projectId}`,
        () => domain.updateBrief(input),
        options,
      ),
    listPlotNodes: (projectId, options) =>
      coordinator.run(
        `planning.listPlotNodes:${projectId}`,
        () => domain.listPlotNodes(projectId),
        options,
      ),
    createPlotNode: (input, options) =>
      coordinator.run(
        `planning.createPlotNode:${input.projectId}`,
        () => domain.createPlotNode(input),
        options,
      ),
    updatePlotNode: (input, options) =>
      coordinator.run(
        `planning.updatePlotNode:${input.nodeId}`,
        () => domain.updatePlotNode(input),
        options,
      ),
    movePlotNode: (input, options) =>
      coordinator.run(
        `planning.movePlotNode:${input.nodeId}`,
        () => domain.movePlotNode(input),
        options,
      ),
    deletePlotNode: (input, options) =>
      coordinator.run(
        `planning.deletePlotNode:${input.nodeId}`,
        () => domain.deletePlotNode(input),
        options,
      ),
    listSceneBeats: (input, options) =>
      coordinator.run(
        `planning.listSceneBeats:${input.chapterId}`,
        () => domain.listSceneBeats(input),
        options,
      ),
    createSceneBeat: (input, options) =>
      coordinator.run(
        `planning.createSceneBeat:${input.chapterId}`,
        () => domain.createSceneBeat(input),
        options,
      ),
    updateSceneBeat: (input, options) =>
      coordinator.run(
        `planning.updateSceneBeat:${input.sceneBeatId}`,
        () => domain.updateSceneBeat(input),
        options,
      ),
    moveSceneBeat: (input, options) =>
      coordinator.run(
        `planning.moveSceneBeat:${input.sceneBeatId}`,
        () => domain.moveSceneBeat(input),
        options,
      ),
    previewMoveSceneBeat: (input, options) =>
      coordinator.run(
        `planning.previewMoveSceneBeat:${input.sceneBeatId}`,
        () => domain.previewMoveSceneBeat(input),
        options,
      ),
    moveSceneBeatAcrossChapters: (input, options) =>
      coordinator.run(
        `planning.moveSceneBeatAcrossChapters:${input.sceneBeatId}`,
        () => domain.moveSceneBeatAcrossChapters(input),
        options,
      ),
    deleteSceneBeat: (input, options) =>
      coordinator.run(
        `planning.deleteSceneBeat:${input.sceneBeatId}`,
        () => domain.deleteSceneBeat(input),
        options,
      ),
    restoreSceneBeat: (input, options) =>
      coordinator.run(
        `planning.restoreSceneBeat:${input.sceneBeatId}`,
        () => domain.restoreSceneBeat(input),
        options,
      ),
    setSceneBeatBlockLinks: (input, options) =>
      coordinator.run(
        `planning.setSceneBeatBlockLinks:${input.sceneBeatId}`,
        () => domain.setSceneBeatBlockLinks(input),
        options,
      ),
    convertBlocksToSceneBeat: (input, options) =>
      coordinator.run(
        `planning.convertBlocksToSceneBeat:${input.chapterId}`,
        () => domain.convertBlocksToSceneBeat(input),
        options,
      ),
    listStructure: (projectId, options) =>
      coordinator.run(
        `planning.listStructure:${projectId}`,
        () => domain.listStructure(projectId),
        options,
      ),
    createVolume: (input, options) =>
      coordinator.run(
        `planning.createVolume:${input.projectId}`,
        () => domain.createVolume(input),
        options,
      ),
    updateVolume: (input, options) =>
      coordinator.run(
        `planning.updateVolume:${input.volumeId}`,
        () => domain.updateVolume(input),
        options,
      ),
    moveVolume: (input, options) =>
      coordinator.run(
        `planning.moveVolume:${input.volumeId}`,
        () => domain.moveVolume(input),
        options,
      ),
    deleteVolume: (input, options) =>
      coordinator.run(
        `planning.deleteVolume:${input.volumeId}`,
        () => domain.deleteVolume(input),
        options,
      ),
    createChapter: (input, options) =>
      coordinator.run(
        `planning.createChapter:${input.volumeId}`,
        () => domain.createChapter(input),
        options,
      ),
    updateChapter: (input, options) =>
      coordinator.run(
        `planning.updateChapter:${input.chapterId}`,
        () => domain.updateChapter(input),
        options,
      ),
    moveChapter: (input, options) =>
      coordinator.run(
        `planning.moveChapter:${input.chapterId}`,
        () => domain.moveChapter(input),
        options,
      ),
    deleteChapter: (input, options) =>
      coordinator.run(
        `planning.deleteChapter:${input.chapterId}`,
        () => domain.deleteChapter(input),
        options,
      ),
    previewSplitChapter: (input, options) =>
      coordinator.run(
        `planning.previewSplitChapter:${input.chapterId}`,
        () => domain.previewSplitChapter(input),
        options,
      ),
    splitChapter: (input, options) =>
      coordinator.run(
        `planning.splitChapter:${input.chapterId}`,
        () => domain.splitChapter(input),
        options,
      ),
    previewMergeChapters: (input, options) =>
      coordinator.run(
        `planning.previewMergeChapters:${input.sourceChapterId}`,
        () => domain.previewMergeChapters(input),
        options,
      ),
    mergeChapters: (input, options) =>
      coordinator.run(
        `planning.mergeChapters:${input.sourceChapterId}`,
        () => domain.mergeChapters(input),
        options,
      ),
    previewMoveBlocks: (input, options) =>
      coordinator.run(
        `planning.previewMoveBlocks:${input.sourceChapterId}`,
        () => domain.previewMoveBlocks(input),
        options,
      ),
    moveBlocks: (input, options) =>
      coordinator.run(
        `planning.moveBlocks:${input.sourceChapterId}`,
        () => domain.moveBlocks(input),
        options,
      ),
  };
}

function createContinuityAdapter(
  domain: ContinuityBridgePort,
  coordinator: BridgeRequestCoordinator,
): AdaptedDomain<ContinuityBridgePort> {
  return {
    list: (input, options) =>
      coordinator.run(`continuity.list:${input.projectId}`, () => domain.list(input), options),
    setEntityState: (input, options) =>
      coordinator.run(
        `continuity.setEntityState:${input.entityId}:${input.stateKey}`,
        () => domain.setEntityState(input),
        options,
      ),
    invalidateEntityState: (input, options) =>
      coordinator.run(
        `continuity.invalidateEntityState:${input.entityId}:${input.stateKey}`,
        () => domain.invalidateEntityState(input),
        options,
      ),
    saveTimelineEvent: (input, options) =>
      coordinator.run(
        `continuity.saveTimelineEvent:${input.eventId ?? 'new'}`,
        () => domain.saveTimelineEvent(input),
        options,
      ),
    archiveTimelineEvent: (input, options) =>
      coordinator.run(
        `continuity.archiveTimelineEvent:${input.eventId}`,
        () => domain.archiveTimelineEvent(input),
        options,
      ),
    setKnowledgeState: (input, options) =>
      coordinator.run(
        `continuity.setKnowledgeState:${input.characterId}:${input.informationKey}`,
        () => domain.setKnowledgeState(input),
        options,
      ),
    invalidateKnowledgeState: (input, options) =>
      coordinator.run(
        `continuity.invalidateKnowledgeState:${input.characterId}:${input.informationKey}`,
        () => domain.invalidateKnowledgeState(input),
        options,
      ),
  };
}

function createNarrativePlanningAdapter(
  domain: NarrativePlanningBridgePort,
  coordinator: BridgeRequestCoordinator,
): AdaptedDomain<NarrativePlanningBridgePort> {
  return {
    list: (input, options) =>
      coordinator.run(
        `narrativePlanning.list:${input.projectId}`,
        () => domain.list(input),
        options,
      ),
    saveForeshadowing: (input, options) =>
      coordinator.run(
        `narrativePlanning.saveForeshadowing:${input.foreshadowingId ?? 'new'}`,
        () => domain.saveForeshadowing(input),
        options,
      ),
    transitionForeshadowing: (input, options) =>
      coordinator.run(
        `narrativePlanning.transitionForeshadowing:${input.foreshadowingId}`,
        () => domain.transitionForeshadowing(input),
        options,
      ),
    saveCharacterArc: (input, options) =>
      coordinator.run(
        `narrativePlanning.saveCharacterArc:${input.arcId ?? 'new'}`,
        () => domain.saveCharacterArc(input),
        options,
      ),
    saveArcMilestone: (input, options) =>
      coordinator.run(
        `narrativePlanning.saveArcMilestone:${input.milestoneId ?? 'new'}`,
        () => domain.saveArcMilestone(input),
        options,
      ),
    transitionArcMilestone: (input, options) =>
      coordinator.run(
        `narrativePlanning.transitionArcMilestone:${input.milestoneId}`,
        () => domain.transitionArcMilestone(input),
        options,
      ),
  };
}

function createStateProposalAdapter(
  domain: StateProposalBridge,
  coordinator: BridgeRequestCoordinator,
): AdaptedDomain<StateProposalBridge> {
  return {
    list: (input, options) =>
      coordinator.run(
        `stateProposal.list:${input.projectId}:${input.chapterId ?? 'all'}`,
        () => domain.list(input),
        options,
      ),
    generate: (input, options) =>
      coordinator.run(
        `stateProposal.generate:${input.chapterId}`,
        () => domain.generate(input),
        options,
      ),
    resolve: (input, options) =>
      coordinator.run(
        `stateProposal.resolve:${input.projectId}`,
        () => domain.resolve(input),
        options,
      ),
    refreshSnapshot: (input, options) =>
      coordinator.run(
        `stateProposal.refreshSnapshot:${input.chapterId}`,
        () => domain.refreshSnapshot(input),
        options,
      ),
    readSnapshot: (input, options) =>
      coordinator.run(
        `stateProposal.readSnapshot:${input.chapterId}`,
        () => domain.readSnapshot(input),
        options,
      ),
    invalidateDerived: (input, options) =>
      coordinator.run(
        `stateProposal.invalidateDerived:${input.sourceChapterId}`,
        () => domain.invalidateDerived(input),
        options,
      ),
  };
}
