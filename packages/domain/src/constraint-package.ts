export type ConstraintPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

export interface TrimmableConstraint {
  readonly id: string;
  readonly priority: ConstraintPriority;
  readonly required: boolean;
  readonly relevance: number;
  readonly estimatedTokens: number;
}

export interface ConstraintTrimRecord {
  readonly sourceId: string;
  readonly priority: ConstraintPriority;
  readonly estimatedTokens: number;
  readonly reason: 'token_budget';
}

export class ConstraintBudgetError extends Error {
  readonly mandatoryTokens: number;
  readonly usableTokens: number;

  constructor(mandatoryTokens: number, usableTokens: number) {
    super(
      `Mandatory P0/P1 constraints require ${mandatoryTokens} tokens but only ${usableTokens} are usable.`,
    );
    this.name = 'ConstraintBudgetError';
    this.mandatoryTokens = mandatoryTokens;
    this.usableTokens = usableTokens;
  }
}

const priorityOrder: Readonly<Record<ConstraintPriority, number>> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
};

const trimOrder: Readonly<Record<ConstraintPriority, number>> = {
  P4: 0,
  P3: 1,
  P2: 2,
  P1: 3,
  P0: 4,
};

function normalizeStableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeStableValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right, 'en'))
        .map(([key, entry]) => [key, normalizeStableValue(entry)]),
    );
  }
  return value;
}

export function stableSerialize(value: unknown): string {
  return JSON.stringify(normalizeStableValue(value));
}

function isCjkCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0x20000 && codePoint <= 0x323af) ||
    (codePoint >= 0x3040 && codePoint <= 0x30ff) ||
    (codePoint >= 0x31f0 && codePoint <= 0x31ff) ||
    (codePoint >= 0x1100 && codePoint <= 0x11ff) ||
    (codePoint >= 0x3130 && codePoint <= 0x318f) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7af)
  );
}

function isWhitespaceCodePoint(codePoint: number): boolean {
  return (
    codePoint <= 0x20 ||
    (codePoint >= 0x7f && codePoint <= 0xa0) ||
    codePoint === 0x1680 ||
    (codePoint >= 0x2000 && codePoint <= 0x200a) ||
    codePoint === 0x2028 ||
    codePoint === 0x2029 ||
    codePoint === 0x202f ||
    codePoint === 0x205f ||
    codePoint === 0x3000 ||
    codePoint === 0xfeff
  );
}

export function estimateConstraintTokens(value: string): number {
  let cjk = 0;
  let other = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (isCjkCodePoint(codePoint)) cjk += 1;
    else if (!isWhitespaceCodePoint(codePoint)) other += 1;
  }
  return Math.max(1, cjk + Math.ceil(other / 4) + 8);
}

export function sortConstraints<T extends TrimmableConstraint>(items: readonly T[]): T[] {
  return [...items].sort(
    (left, right) =>
      priorityOrder[left.priority] - priorityOrder[right.priority] ||
      Number(right.required) - Number(left.required) ||
      right.relevance - left.relevance ||
      left.id.localeCompare(right.id, 'en'),
  );
}

export function trimConstraints<T extends TrimmableConstraint>(
  input: readonly T[],
  usableTokens: number,
): {
  readonly kept: T[];
  readonly trimLog: ConstraintTrimRecord[];
  readonly estimatedTokens: number;
} {
  if (!Number.isInteger(usableTokens) || usableTokens <= 0) {
    throw new RangeError('usableTokens must be a positive integer.');
  }
  const ordered = sortConstraints(input);
  const mandatoryTokens = ordered
    .filter((item) => item.priority === 'P0' || item.priority === 'P1' || item.required)
    .reduce((total, item) => total + item.estimatedTokens, 0);
  if (mandatoryTokens > usableTokens)
    throw new ConstraintBudgetError(mandatoryTokens, usableTokens);

  let total = ordered.reduce((sum, item) => sum + item.estimatedTokens, 0);
  const removed = new Set<string>();
  const trimLog: ConstraintTrimRecord[] = [];
  const candidates = ordered
    .filter((item) => !item.required && item.priority !== 'P0' && item.priority !== 'P1')
    .sort(
      (left, right) =>
        trimOrder[left.priority] - trimOrder[right.priority] ||
        left.relevance - right.relevance ||
        right.estimatedTokens - left.estimatedTokens ||
        left.id.localeCompare(right.id, 'en'),
    );

  for (const item of candidates) {
    if (total <= usableTokens) break;
    removed.add(item.id);
    total -= item.estimatedTokens;
    trimLog.push({
      sourceId: item.id,
      priority: item.priority,
      estimatedTokens: item.estimatedTokens,
      reason: 'token_budget',
    });
  }
  return {
    kept: ordered.filter((item) => !removed.has(item.id)),
    trimLog,
    estimatedTokens: total,
  };
}
