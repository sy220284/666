import type { LifecycleStatus, PlotNode } from '@worldforge/contracts';

export function lineValues(value: FormDataEntryValue | null): string[] {
  return String(value ?? '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function nullableString(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

export function lifecycleStatusLabel(status: LifecycleStatus): string {
  return {
    pending: '待规划',
    outlined: '已规划',
    writing: '写作中',
    reviewing: '审阅中',
    finalized: '已定稿',
  }[status];
}

export function sortedPlotNodes(
  nodes: readonly PlotNode[],
  parentId: string | null,
): PlotNode[] {
  return nodes
    .filter((node) => node.parentId === parentId)
    .sort((left, right) => {
      const difference = BigInt(left.orderKey) - BigInt(right.orderKey);
      return difference < 0n ? -1 : difference > 0n ? 1 : left.id.localeCompare(right.id, 'en');
    });
}
