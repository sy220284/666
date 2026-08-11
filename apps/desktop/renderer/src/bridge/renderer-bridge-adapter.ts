import type {
  ArcMilestoneSaveInput,
  ArcMilestoneTransitionInput,
  CandidateApplyInput,
  CandidateApplyOutcome,
  CandidateCreateFixtureInput,
  CandidateDiscardInput,
  CandidateDocument,
  CandidateEditSkeletonInput,
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
  CharacterArcSaveInput,
  CharacterRelationshipInvalidateInput,
  CharacterRelationshipSetInput,
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
  ValidationBridge,
  SearchToolsBridge,
  RhythmBridge,
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

type BaseRendererBridgePort = Pick<
  WorldforgeBridge,
  | 'app'
  | 'lifecycle'
  | 'settings'
  | 'providers'
  | 'generation'
  | 'project'
  | 'recovery'
  | 'textIo'
  | 'planning'
  | 'canon'
  | 'trash'
  | 'draft'
  | 'version'
  | 'task'
>;

interface CandidateBridgePort {
  readonly createFixture: (
    input: CandidateCreateFixtureInput,
  ) => Promise<CommandResult<CandidateDocument>>;
  readonly list: (projectId: string, chapterId?: string) => Promise<CommandResult<CandidateList>>;
  readonly get: (input: CandidateGetInput) => Promise<CommandResult<CandidateDocument>>;
  readonly discard: (input: CandidateDiscardInput) => Promise<CommandResult<CandidateSummary>>;
  readonly editSkeleton: (
    input: CandidateEditSkeletonInput,
  ) => Promise<CommandResult<CandidateDocument>>;
}

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
  readonly setCharacterRelationship: (
    input: CharacterRelationshipSetInput,
  ) => Promise<CommandResult<ContinuityCatalog>>;
  readonly invalidateCharacterRelationship: (
    input: CharacterRelationshipInvalidateInput,
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

interface CandidateActionBridgePort {
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
}

interface AuxiliaryRendererBridges {
  readonly continuity?: ContinuityBridgePort;
  readonly narrativePlanning?: NarrativePlanningBridgePort;
  readonly stateProposal?: StateProposalBridge;
  readonly validation?: ValidationBridge;
  readonly searchTools?: SearchToolsBridge;
  readonly rhythm?: RhythmBridge;
  readonly candidateAction?: CandidateActionBridgePort;
}

type RendererBridgePort = Partial<BaseRendererBridgePort> & {
  readonly candidate?: CandidateBridgePort;
};

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

type AdaptedTaskDomain = AdaptedDomain<
  Pick<WorldforgeBridge['task'], 'getSnapshot' | 'cancel' | 'listActive'>
>;

export interface RendererBridgeAdapter {
  readonly lifecycle: WorldforgeBridge['lifecycle'];
  readonly app: AdaptedDomain<WorldforgeBridge['app']>;
  readonly settings: AdaptedDomain<WorldforgeBridge['settings']>;
  readonly providers: AdaptedDomain<WorldforgeBridge['providers']>;
  readonly generation: AdaptedDomain<WorldforgeBridge['generation']>;
  readonly project: AdaptedDomain<WorldforgeBridge['project']>;
  readonly recovery: AdaptedDomain<WorldforgeBridge['recovery']>;
  readonly textIo: AdaptedDomain<WorldforgeBridge['textIo']>;
  readonly planning: AdaptedDomain<WorldforgeBridge['planning']>;
  readonly canon: AdaptedDomain<WorldforgeBridge['canon']>;
  readonly trash: AdaptedDomain<WorldforgeBridge['trash']>;
  readonly draft: AdaptedDomain<WorldforgeBridge['draft']>;
  readonly version: AdaptedDomain<WorldforgeBridge['version']>;
  readonly candidate: AdaptedDomain<CandidateBridgePort>;
  readonly continuity: AdaptedDomain<ContinuityBridgePort>;
  readonly narrativePlanning: AdaptedDomain<NarrativePlanningBridgePort>;
  readonly stateProposal: AdaptedDomain<StateProposalBridge>;
  readonly validation: AdaptedDomain<ValidationBridge>;
  readonly searchTools: AdaptedDomain<SearchToolsBridge>;
  readonly rhythm: AdaptedDomain<RhythmBridge>;
  readonly candidateAction: AdaptedDomain<CandidateActionBridgePort>;
  readonly task: AdaptedTaskDomain & {
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
  auxiliary: AuxiliaryRendererBridges = {},
): RendererBridgeAdapter {
  const task = requireDomain(bridge.task, 'task');
  const adaptedTask = adaptDomain<
    Pick<WorldforgeBridge['task'], 'getSnapshot' | 'cancel' | 'listActive'>
  >('task', task, coordinator);
  const lifecycle = Object.hasOwn(bridge, 'lifecycle')
    ? (bridge as { readonly lifecycle: WorldforgeBridge['lifecycle'] }).lifecycle
    : {
        onShutdownPrepare: () => () => undefined,
        acknowledgeShutdown: () => undefined,
      };

  return {
    lifecycle,
    app: adaptDomain('app', requireDomain(bridge.app, 'app'), coordinator),
    settings: adaptDomain('settings', requireDomain(bridge.settings, 'settings'), coordinator),
    providers: adaptDomain('providers', requireDomain(bridge.providers, 'providers'), coordinator),
    generation: adaptDomain(
      'generation',
      requireDomain(bridge.generation, 'generation'),
      coordinator,
    ),
    project: adaptDomain('project', requireDomain(bridge.project, 'project'), coordinator),
    recovery: adaptDomain('recovery', requireDomain(bridge.recovery, 'recovery'), coordinator),
    textIo: adaptDomain('textIo', requireDomain(bridge.textIo, 'textIo'), coordinator),
    planning: adaptDomain('planning', requireDomain(bridge.planning, 'planning'), coordinator),
    canon: adaptDomain('canon', requireDomain(bridge.canon, 'canon'), coordinator),
    trash: adaptDomain('trash', requireDomain(bridge.trash, 'trash'), coordinator),
    draft: adaptDomain('draft', requireDomain(bridge.draft, 'draft'), coordinator),
    version: adaptDomain('version', requireDomain(bridge.version, 'version'), coordinator),
    candidate: adaptDomain('candidate', requireDomain(bridge.candidate, 'candidate'), coordinator),
    continuity: adaptDomain(
      'continuity',
      requireDomain(auxiliary.continuity, 'continuity'),
      coordinator,
    ),
    narrativePlanning: adaptDomain(
      'narrativePlanning',
      requireDomain(auxiliary.narrativePlanning, 'narrativePlanning'),
      coordinator,
    ),
    stateProposal: adaptDomain(
      'stateProposal',
      requireDomain(auxiliary.stateProposal, 'stateProposal'),
      coordinator,
    ),
    validation: adaptDomain(
      'validation',
      requireDomain(auxiliary.validation, 'validation'),
      coordinator,
    ),
    searchTools: adaptDomain(
      'searchTools',
      requireDomain(auxiliary.searchTools, 'searchTools'),
      coordinator,
    ),
    rhythm: adaptDomain('rhythm', requireDomain(auxiliary.rhythm, 'rhythm'), coordinator),
    candidateAction: adaptDomain(
      'candidateAction',
      requireDomain(auxiliary.candidateAction, 'candidateAction'),
      coordinator,
    ),
    task: {
      getSnapshot: (...args) => adaptedTask.getSnapshot(...args),
      cancel: (...args) => adaptedTask.cancel(...args),
      listActive: (...args) => adaptedTask.listActive(...args),
      subscribe: (listener, projectId) => task.subscribe(listener, projectId),
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
    !window.worldforgeStateProposal ||
    !window.worldforgeValidation ||
    !window.worldforgeSearchTools ||
    !window.worldforgeRhythm ||
    !window.worldforgeCandidatePreview
  ) {
    throw new Error('The trusted WorldForge preload bridge is unavailable.');
  }
  return createRendererBridgeAdapter(window.worldforge, new BridgeRequestCoordinator(), {
    continuity: window.worldforgeContinuity,
    narrativePlanning: window.worldforgeNarrativePlanning,
    stateProposal: window.worldforgeStateProposal,
    validation: window.worldforgeValidation,
    searchTools: window.worldforgeSearchTools,
    rhythm: window.worldforgeRhythm,
    candidateAction: window.worldforgeCandidatePreview,
  });
}

function requireDomain<Domain extends object>(domain: Domain | undefined, name: string): Domain {
  if (domain) return domain;
  return new Proxy(
    {},
    {
      get() {
        return async () => {
          throw new Error(`The ${name} preload bridge is unavailable.`);
        };
      },
    },
  ) as Domain;
}

function adaptDomain<Domain extends object>(
  domainName: string,
  domain: Domain,
  coordinator: BridgeRequestCoordinator,
): AdaptedDomain<Domain> {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (typeof property !== 'string') return undefined;
        return (...received: unknown[]) => {
          const args = [...received];
          const options = takeBridgeOptions(args);
          const method = (domain as Record<string, unknown>)[property];
          if (typeof method !== 'function') {
            return Promise.reject(
              new Error(`The ${domainName}.${property} bridge method is unavailable.`),
            );
          }
          const derivedRequestKey = requestKey(domainName, property, args);
          return coordinator.run(
            options?.requestKey ?? derivedRequestKey,
            () =>
              (method as (...values: unknown[]) => Promise<CommandResult<unknown>>).apply(
                domain,
                args,
              ),
            options,
          );
        };
      },
    },
  ) as AdaptedDomain<Domain>;
}

function takeBridgeOptions(args: unknown[]): BridgeRequestOptions | undefined {
  const last = args.at(-1);
  if (!isBridgeRequestOptions(last)) return undefined;
  args.pop();
  return last;
}

function isBridgeRequestOptions(value: unknown): value is BridgeRequestOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length > 0 &&
    keys.every(
      (key) => key === 'mode' || key === 'signal' || key === 'requestKey' || key === 'laneKey',
    ) &&
    (!('mode' in value) ||
      value.mode === 'reject' ||
      value.mode === 'replace' ||
      value.mode === 'share') &&
    (!('requestKey' in value) ||
      (typeof value.requestKey === 'string' && value.requestKey.length > 0)) &&
    (!('laneKey' in value) || (typeof value.laneKey === 'string' && value.laneKey.length > 0))
  );
}

function requestKey(domain: string, method: string, args: readonly unknown[]): string {
  const identity = args.map(stableRequestIdentity).join('|');
  return `${domain}.${method}:${identity || 'root'}`;
}

function stableRequestIdentity(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'undefined') return 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableRequestIdentity).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableRequestIdentity(record[key])}`)
      .join(',')}}`;
  }
  return typeof value;
}
