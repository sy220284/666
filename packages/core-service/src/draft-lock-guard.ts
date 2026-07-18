export interface LockGuardBlock {
  readonly logicalBlockId: string;
  readonly blockType: string;
  readonly text: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly locked: boolean;
}

export interface LockGuardViolation {
  readonly kind: 'deleted' | 'modified' | 'moved';
  readonly logicalBlockId: string;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function collectLockGuardViolations(
  current: readonly LockGuardBlock[],
  target: readonly LockGuardBlock[],
): LockGuardViolation[] {
  const currentById = new Map(current.map((block) => [block.logicalBlockId, block]));
  const targetById = new Map(target.map((block) => [block.logicalBlockId, block]));
  const currentOrder = current
    .filter((block) => targetById.has(block.logicalBlockId))
    .map((block) => block.logicalBlockId);
  const targetOrder = target
    .filter((block) => currentById.has(block.logicalBlockId))
    .map((block) => block.logicalBlockId);
  const currentIndexes = new Map(
    currentOrder.map((logicalBlockId, index) => [logicalBlockId, index]),
  );
  const targetIndexes = new Map(
    targetOrder.map((logicalBlockId, index) => [logicalBlockId, index]),
  );
  const violations: LockGuardViolation[] = [];

  for (const locked of current.filter((block) => block.locked)) {
    const next = targetById.get(locked.logicalBlockId);
    if (!next) {
      violations.push({ kind: 'deleted', logicalBlockId: locked.logicalBlockId });
      continue;
    }
    if (
      next.blockType !== locked.blockType ||
      next.text !== locked.text ||
      stable(next.attributes) !== stable(locked.attributes)
    ) {
      violations.push({ kind: 'modified', logicalBlockId: locked.logicalBlockId });
    }
    if (currentIndexes.get(locked.logicalBlockId) !== targetIndexes.get(locked.logicalBlockId)) {
      violations.push({ kind: 'moved', logicalBlockId: locked.logicalBlockId });
    }
  }
  return violations;
}
