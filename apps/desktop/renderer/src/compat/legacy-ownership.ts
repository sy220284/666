export type LegacyResourceKind =
  | 'event-listeners'
  | 'timers'
  | 'async-requests'
  | 'editor-instance'
  | 'autosave'
  | 'dom-ownership';

export interface LegacyOwnershipRecord {
  readonly module: string;
  readonly owner: string;
  readonly resources: readonly LegacyResourceKind[];
  readonly migrationTask: 'M3-08' | 'M3-09' | 'M3-10';
}

export const LEGACY_RENDERER_OWNERSHIP: readonly LegacyOwnershipRecord[] = [
  {
    module: 'index.ts',
    owner: 'legacy-shell-and-writing',
    resources: [
      'event-listeners',
      'timers',
      'async-requests',
      'editor-instance',
      'autosave',
      'dom-ownership',
    ],
    migrationTask: 'M3-10',
  },
  {
    module: 'candidate-preview-bootstrap.ts',
    owner: 'legacy-candidate-preview-bootstrap',
    resources: ['event-listeners', 'async-requests', 'dom-ownership'],
    migrationTask: 'M3-10',
  },
  {
    module: 'candidate-preview-ui.ts',
    owner: 'legacy-candidate-preview-ui',
    resources: ['event-listeners', 'async-requests', 'dom-ownership'],
    migrationTask: 'M3-10',
  },
  {
    module: 'candidate-apply-bootstrap.ts',
    owner: 'legacy-candidate-apply-bootstrap',
    resources: ['event-listeners', 'async-requests', 'dom-ownership'],
    migrationTask: 'M3-10',
  },
  {
    module: 'candidate-apply-ui.ts',
    owner: 'legacy-candidate-apply-ui',
    resources: ['event-listeners', 'async-requests', 'dom-ownership'],
    migrationTask: 'M3-10',
  },
] as const;

export function assertLegacyOwnershipComplete(modules: readonly string[]): void {
  const registered = new Set(LEGACY_RENDERER_OWNERSHIP.map((record) => record.module));
  const missing = modules.filter((module) => !registered.has(module));
  if (missing.length > 0) {
    throw new Error(`Legacy ownership is missing for: ${missing.join(', ')}.`);
  }
}
