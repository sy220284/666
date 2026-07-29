export interface ExportVersionChoice {
  readonly versionId: string;
  readonly finalized: boolean;
}

export function finalizedVersionIds(versions: readonly ExportVersionChoice[]): string[] {
  return versions.filter((version) => version.finalized).map((version) => version.versionId);
}

export function selectedAllFinalized(
  selected: ReadonlySet<string>,
  versions: readonly ExportVersionChoice[],
): boolean {
  const finalized = new Set(finalizedVersionIds(versions));
  return (
    finalized.size > 0 &&
    selected.size === finalized.size &&
    [...selected].every((versionId) => finalized.has(versionId))
  );
}

export function wholeBookExportLabel(
  selected: ReadonlySet<string>,
  versions: readonly ExportVersionChoice[],
): string {
  return selectedAllFinalized(selected, versions)
    ? '选择目录并导出整部作品'
    : '选择目录并导出所选版本';
}
