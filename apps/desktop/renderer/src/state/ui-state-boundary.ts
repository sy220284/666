export const RENDERER_ROUTE_IDS = [
  'home',
  'project',
  'planning',
  'canon',
  'research',
  'journal',
  'structure',
  'writing',
  'versions',
  'candidates',
  'checks',
  'settings',
  'recovery',
] as const;

export type RendererRouteId = (typeof RENDERER_ROUTE_IDS)[number];
export type RendererOverlayKind = 'drawer' | 'dialog' | 'popover';

export interface RendererSelectionState {
  readonly projectId: string | null;
  readonly volumeId: string | null;
  readonly chapterId: string | null;
  readonly entityId: string | null;
  readonly researchNoteId: string | null;
  readonly logicalBlockId: string | null;
  readonly versionId: string | null;
  readonly sceneBeatId: string | null;
  readonly issueId: string | null;
}

export interface RendererReturnLocation {
  readonly route: RendererRouteId;
  readonly focusKey: string | null;
  readonly selection: RendererSelectionState;
  readonly filters: Readonly<Record<string, string>>;
  readonly scrollTop: number;
}

export interface RendererFeedbackState {
  readonly id: string;
  readonly kind: 'success' | 'info';
  readonly expiresAt: number;
}

export interface RendererUiState {
  readonly route: RendererRouteId;
  readonly selection: RendererSelectionState;
  readonly overlays: Readonly<Record<RendererOverlayKind, string | null>>;
  readonly returnLocation: RendererReturnLocation | null;
  readonly filters: Readonly<Record<string, string>>;
  readonly foregroundRequestKey: string | null;
  readonly feedback: RendererFeedbackState | null;
}

export type RendererUiAction =
  | {
      readonly type: 'navigate';
      readonly route: RendererRouteId;
      readonly returnLocation?: RendererReturnLocation | null;
    }
  | {
      readonly type: 'apply-navigation';
      readonly route: RendererRouteId;
      readonly selection: Partial<RendererSelectionState>;
      readonly filters: Readonly<Record<string, string | null>>;
      readonly returnLocation: RendererReturnLocation | null;
    }
  | {
      readonly type: 'select';
      readonly selection: Partial<RendererSelectionState>;
    }
  | {
      readonly type: 'set-overlay';
      readonly kind: RendererOverlayKind;
      readonly id: string | null;
    }
  | {
      readonly type: 'set-filter';
      readonly key: string;
      readonly value: string | null;
    }
  | {
      readonly type: 'set-foreground-request';
      readonly requestKey: string | null;
    }
  | {
      readonly type: 'set-feedback';
      readonly feedback: RendererFeedbackState | null;
    }
  | { readonly type: 'return-to-source' }
  | { readonly type: 'reset-project-context' };

const selectionKeys = [
  'projectId',
  'volumeId',
  'chapterId',
  'entityId',
  'researchNoteId',
  'logicalBlockId',
  'versionId',
  'sceneBeatId',
  'issueId',
] as const;

export function createInitialRendererUiState(): RendererUiState {
  return {
    route: 'home',
    selection: {
      projectId: null,
      volumeId: null,
      chapterId: null,
      entityId: null,
      researchNoteId: null,
      logicalBlockId: null,
      versionId: null,
      sceneBeatId: null,
      issueId: null,
    },
    overlays: {
      drawer: null,
      dialog: null,
      popover: null,
    },
    returnLocation: null,
    filters: {},
    foregroundRequestKey: null,
    feedback: null,
  };
}

export function reduceRendererUiState(
  state: RendererUiState,
  action: RendererUiAction,
): RendererUiState {
  if (action.type === 'navigate') {
    return {
      ...state,
      route: action.route,
      returnLocation:
        'returnLocation' in action ? (action.returnLocation ?? null) : state.returnLocation,
    };
  }
  if (action.type === 'apply-navigation') {
    const filters = { ...state.filters };
    for (const [key, value] of Object.entries(action.filters)) {
      if (value === null) delete filters[key];
      else filters[key] = value;
    }
    return {
      ...state,
      route: action.route,
      selection: { ...state.selection, ...action.selection },
      filters,
      returnLocation: action.returnLocation,
    };
  }
  if (action.type === 'select') {
    return {
      ...state,
      selection: { ...state.selection, ...action.selection },
    };
  }
  if (action.type === 'set-overlay') {
    return {
      ...state,
      overlays: { ...state.overlays, [action.kind]: action.id },
    };
  }
  if (action.type === 'set-filter') {
    const filters = { ...state.filters };
    if (action.value === null) delete filters[action.key];
    else filters[action.key] = action.value;
    return { ...state, filters };
  }
  if (action.type === 'set-foreground-request') {
    return { ...state, foregroundRequestKey: action.requestKey };
  }
  if (action.type === 'set-feedback') {
    return { ...state, feedback: action.feedback };
  }
  if (action.type === 'return-to-source') {
    if (!state.returnLocation) return state;
    return {
      ...state,
      route: state.returnLocation.route,
      selection: state.returnLocation.selection,
      filters: state.returnLocation.filters,
      returnLocation: null,
    };
  }
  return {
    ...createInitialRendererUiState(),
    route: 'project',
  };
}

export function assertTemporaryUiState(value: unknown): asserts value is RendererUiState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Renderer UI state must be an object.');
  }
  const state = value as Record<string, unknown>;
  const allowedRootKeys = new Set([
    'route',
    'selection',
    'overlays',
    'returnLocation',
    'filters',
    'foregroundRequestKey',
    'feedback',
  ]);
  for (const key of Object.keys(state)) {
    if (!allowedRootKeys.has(key)) {
      throw new TypeError(`Renderer UI state cannot contain authoritative field: ${key}.`);
    }
  }
  if (!RENDERER_ROUTE_IDS.includes(state.route as RendererRouteId)) {
    throw new TypeError('Renderer UI state contains an invalid route.');
  }
  assertNullableStringRecord(state.selection, selectionKeys);
  assertNullableStringRecord(state.overlays, ['drawer', 'dialog', 'popover']);
  assertReturnLocation(state.returnLocation);
  assertFeedback(state.feedback);
  if (!isNullableString(state.foregroundRequestKey)) {
    throw new TypeError('Renderer foreground request key must be a string or null.');
  }
  if (!state.filters || typeof state.filters !== 'object' || Array.isArray(state.filters)) {
    throw new TypeError('Renderer filters must be a string record.');
  }
  if (Object.values(state.filters).some((item) => typeof item !== 'string')) {
    throw new TypeError('Renderer filters must contain strings only.');
  }
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function assertNullableStringRecord(value: unknown, allowedKeys: readonly string[]): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Renderer UI identifier state must be an object.');
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowedKeys.includes(key))) {
    throw new TypeError('Renderer UI identifier state contains an unsupported field.');
  }
  if (allowedKeys.some((key) => !isNullableString(record[key]))) {
    throw new TypeError('Renderer UI identifiers must be strings or null.');
  }
}

function assertReturnLocation(value: unknown): void {
  if (value === null) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Renderer return location must be an object or null.');
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some(
      (key) => !['route', 'focusKey', 'selection', 'filters', 'scrollTop'].includes(key),
    ) ||
    !RENDERER_ROUTE_IDS.includes(record.route as RendererRouteId) ||
    !isNullableString(record.focusKey) ||
    typeof record.scrollTop !== 'number' ||
    !Number.isFinite(record.scrollTop) ||
    record.scrollTop < 0
  ) {
    throw new TypeError('Renderer return location is invalid.');
  }
  assertNullableStringRecord(record.selection, selectionKeys);
  if (!record.filters || typeof record.filters !== 'object' || Array.isArray(record.filters)) {
    throw new TypeError('Renderer return location is invalid.');
  }
  if (Object.values(record.filters).some((item) => typeof item !== 'string')) {
    throw new TypeError('Renderer return location is invalid.');
  }
}

function assertFeedback(value: unknown): void {
  if (value === null) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Renderer feedback must be an object or null.');
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => !['id', 'kind', 'expiresAt'].includes(key)) ||
    typeof record.id !== 'string' ||
    (record.kind !== 'success' && record.kind !== 'info') ||
    typeof record.expiresAt !== 'number' ||
    !Number.isFinite(record.expiresAt)
  ) {
    throw new TypeError('Renderer feedback is invalid.');
  }
}
