export interface ExportSelectionChoice {
  readonly versionId: string;
  readonly finalized: boolean;
}

export function mixesWholeBookFinalsWithOtherVersions(
  selectedVersionIds: readonly string[],
  versions: readonly ExportSelectionChoice[],
): boolean {
  const selected = new Set(selectedVersionIds);
  const finalized = new Set(
    versions.filter((version) => version.finalized).map((version) => version.versionId),
  );
  if (finalized.size === 0) return false;
  const includesEveryFinalized = [...finalized].every((versionId) => selected.has(versionId));
  if (!includesEveryFinalized) return false;
  return (
    selected.size !== finalized.size ||
    [...selected].some((versionId) => !finalized.has(versionId))
  );
}
