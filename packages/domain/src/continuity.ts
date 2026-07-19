export const ENTITY_STATE_RECORD_STATUSES = [
  'current',
  'historical',
  'superseded',
  'invalid',
] as const;
export const TIMELINE_PRECISIONS = [
  'exact',
  'day',
  'month',
  'year',
  'approximate',
  'unknown',
] as const;
export const KNOWLEDGE_STATUSES = [
  'knows',
  'believes',
  'suspects',
  'misunderstands',
  'unknown',
] as const;

export type TimelinePrecision = (typeof TIMELINE_PRECISIONS)[number];

function normalizedText(value: string): string {
  return value.normalize('NFKC').trim();
}

function controlFree(value: string): boolean {
  return ![...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

export function normalizeContinuityKey(value: string, maximum = 240): string {
  const normalized = normalizedText(value).toLocaleLowerCase('en-US').replace(/\s+/gu, '-');
  if (normalized.length < 1 || normalized.length > maximum || !controlFree(normalized)) {
    throw new Error('CONTINUITY_KEY_INVALID');
  }
  return normalized;
}

function validCalendarDate(value: string): boolean {
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

export function normalizeStoryTimeValue(
  value: string,
  precision: TimelinePrecision,
): string {
  const normalized = normalizedText(value);
  if (normalized.length < 1 || normalized.length > 120 || !controlFree(normalized)) {
    throw new Error('TIMELINE_VALUE_INVALID');
  }
  switch (precision) {
    case 'exact':
      if (!Number.isFinite(Date.parse(normalized))) throw new Error('TIMELINE_VALUE_INVALID');
      return new Date(Date.parse(normalized)).toISOString();
    case 'day':
      if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized) || !validCalendarDate(normalized)) {
        throw new Error('TIMELINE_VALUE_INVALID');
      }
      return normalized;
    case 'month': {
      const match = /^(\d{4})-(\d{2})$/u.exec(normalized);
      if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
        throw new Error('TIMELINE_VALUE_INVALID');
      }
      return normalized;
    }
    case 'year':
      if (!/^\d{4}$/u.test(normalized)) throw new Error('TIMELINE_VALUE_INVALID');
      return normalized;
    case 'unknown':
      return normalized;
    case 'approximate':
      return normalized;
  }
}

export function comparableStoryTime(
  value: string,
  precision: TimelinePrecision,
): number | null {
  switch (precision) {
    case 'exact':
      return Date.parse(value);
    case 'day':
      return Date.parse(`${value}T00:00:00.000Z`);
    case 'month':
      return Date.parse(`${value}-01T00:00:00.000Z`);
    case 'year':
      return Date.parse(`${value}-01-01T00:00:00.000Z`);
    case 'approximate':
    case 'unknown':
      return null;
  }
}

export function assertStoryTimeRange(
  startValue: string,
  endValue: string | null,
  precision: TimelinePrecision,
): void {
  if (precision === 'unknown' && endValue !== null) {
    throw new Error('TIMELINE_RANGE_INVALID');
  }
  if (endValue === null) return;
  const start = comparableStoryTime(startValue, precision);
  const end = comparableStoryTime(endValue, precision);
  if (start !== null && end !== null && end < start) {
    throw new Error('TIMELINE_RANGE_INVALID');
  }
}

export function timelineMomentKey(input: {
  readonly precision: TimelinePrecision;
  readonly startValue: string;
  readonly endValue: string | null;
}): string {
  return `${input.precision}\u0000${input.startValue}\u0000${input.endValue ?? ''}`;
}

export function wouldCreateTimelineCycle(
  eventId: string,
  dependencyIds: readonly string[],
  graph: ReadonlyMap<string, readonly string[]>,
): boolean {
  const proposed = new Map(graph);
  proposed.set(eventId, [...dependencyIds]);
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (current: string): boolean => {
    if (visiting.has(current)) return true;
    if (visited.has(current)) return false;
    visiting.add(current);
    for (const dependency of proposed.get(current) ?? []) {
      if (visit(dependency)) return true;
    }
    visiting.delete(current);
    visited.add(current);
    return false;
  };

  return visit(eventId);
}
