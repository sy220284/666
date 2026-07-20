export type TimelinePrecision =
  | 'exact'
  | 'day'
  | 'month'
  | 'year'
  | 'approximate'
  | 'unknown';

export interface ComparableTimeRange {
  readonly startMs: number;
  readonly endMs: number;
}

export function normalizeContinuityKey(value: string, maxLength = 240): string {
  const normalized = value.trim().replace(/\s+/gu, ' ');
  if (!normalized || normalized.length > maxLength) {
    throw new Error('CONTINUITY_KEY_INVALID');
  }
  for (const character of normalized) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) throw new Error('CONTINUITY_KEY_INVALID');
  }
  return normalized;
}

function dateParts(value: string, precision: TimelinePrecision): number[] | null {
  if (precision === 'year') {
    const match = /^(\d{4})$/u.exec(value);
    return match ? [Number(match[1])] : null;
  }
  if (precision === 'month') {
    const match = /^(\d{4})-(\d{2})$/u.exec(value);
    return match ? [Number(match[1]), Number(match[2])] : null;
  }
  if (precision === 'day') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
  }
  return null;
}

function validUtcDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function comparableTimeRange(
  value: string,
  precision: TimelinePrecision,
): ComparableTimeRange | null {
  const normalized = value.trim();
  if (precision === 'approximate' || precision === 'unknown') return null;
  if (precision === 'exact') {
    const instant = Date.parse(normalized);
    if (!Number.isFinite(instant)) throw new Error('TIMELINE_VALUE_INVALID');
    return { startMs: instant, endMs: instant + 1 };
  }
  const parts = dateParts(normalized, precision);
  if (!parts) throw new Error('TIMELINE_VALUE_INVALID');
  const year = parts[0]!;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  if (month < 1 || month > 12 || !validUtcDate(year, month, day)) {
    throw new Error('TIMELINE_VALUE_INVALID');
  }
  const startMs = Date.UTC(year, month - 1, day);
  let endMs: number;
  if (precision === 'year') endMs = Date.UTC(year + 1, 0, 1);
  else if (precision === 'month') endMs = Date.UTC(year, month, 1);
  else endMs = Date.UTC(year, month - 1, day + 1);
  return { startMs, endMs };
}

export function eventTimeRange(
  startValue: string,
  endValue: string | null,
  precision: TimelinePrecision,
): ComparableTimeRange | null {
  const start = comparableTimeRange(startValue, precision);
  if (!start) return null;
  const end = endValue ? comparableTimeRange(endValue, precision) : null;
  const endMs = end?.endMs ?? start.endMs;
  if (endMs <= start.startMs) throw new Error('TIMELINE_RANGE_INVALID');
  return { startMs: start.startMs, endMs };
}

export function timeRangesOverlap(
  left: ComparableTimeRange,
  right: ComparableTimeRange,
): boolean {
  return left.startMs < right.endMs && right.startMs < left.endMs;
}

export function dependencyDefinitelyOutOfOrder(
  dependency: ComparableTimeRange,
  event: ComparableTimeRange,
): boolean {
  return dependency.startMs >= event.endMs;
}

export function compareChapterPosition(
  left: readonly [number, number],
  right: readonly [number, number],
): number {
  return left[0] - right[0] || left[1] - right[1];
}

export function chapterRangeContains(
  start: readonly [number, number],
  end: readonly [number, number] | null,
  target: readonly [number, number],
): boolean {
  return (
    compareChapterPosition(start, target) <= 0 &&
    (!end || compareChapterPosition(target, end) < 0)
  );
}
