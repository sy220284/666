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

/** M3-10 retired every command-style Renderer business module. */
export const LEGACY_RENDERER_OWNERSHIP: readonly LegacyOwnershipRecord[] = [];

export function assertLegacyOwnershipComplete(modules: readonly string[]): void {
  if (modules.length > 0) {
    throw new Error(`Retired legacy Renderer modules remain: ${modules.join(', ')}.`);
  }
}
