export type LegacySurfaceDisposal = Readonly<{
  flushAutosave: () => Promise<void>;
  cancelAsync: () => void;
  destroyEditor: () => void;
  removeListeners: () => void;
}>;

let legacyMount: Promise<void> | null = null;

export async function mountLegacySurface(): Promise<void> {
  legacyMount ??= import('../entry.js').then(() => undefined);
  await legacyMount;
}

export async function disposeLegacySurface(
  disposal: LegacySurfaceDisposal,
): Promise<void> {
  await disposal.flushAutosave();
  disposal.cancelAsync();
  disposal.destroyEditor();
  disposal.removeListeners();
}
