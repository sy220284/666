import type { DatabaseSync } from 'node:sqlite';

import type { JournalSchedule } from '@worldforge/contracts';

interface TimeZoneRow {
  readonly timeZone: string;
}

interface LocalDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function projectTimeZone(database: DatabaseSync, projectId: string): string {
  const row = database
    .prepare(
      `SELECT time_zone AS timeZone
         FROM genre_rhythm_profiles
        WHERE project_id = ?`,
    )
    .get(projectId) as TimeZoneRow | undefined;
  const candidate = row?.timeZone ?? 'Asia/Shanghai';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return 'Asia/Shanghai';
  }
}

function localDateParts(instant: Date, timeZone: string): LocalDateParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function localDateTimeParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function shiftLocalDate(parts: LocalDateParts, deltaDays: number): LocalDateParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + deltaDays));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function weekday(parts: LocalDateParts): number {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

function localMidnightUtc(parts: LocalDateParts, timeZone: string): Date {
  const desired = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0);
  let estimate = new Date(desired);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = localDateTimeParts(estimate, timeZone);
    const observedWallClock = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    const correction = desired - observedWallClock;
    if (correction === 0) return estimate;
    estimate = new Date(estimate.getTime() + correction);
  }
  return estimate;
}

export function journalCatchUpWindow(
  database: DatabaseSync,
  projectId: string,
  schedule: Exclude<JournalSchedule, 'off'>,
  now: Date,
): { readonly start: string; readonly end: string } {
  const timeZone = projectTimeZone(database, projectId);
  const today = localDateParts(now, timeZone);
  if (schedule === 'daily') {
    const endLocal = today;
    const startLocal = shiftLocalDate(endLocal, -1);
    return {
      start: localMidnightUtc(startLocal, timeZone).toISOString(),
      end: localMidnightUtc(endLocal, timeZone).toISOString(),
    };
  }

  const day = weekday(today);
  const sinceMonday = day === 0 ? 6 : day - 1;
  const endLocal = shiftLocalDate(today, -sinceMonday);
  const startLocal = shiftLocalDate(endLocal, -7);
  return {
    start: localMidnightUtc(startLocal, timeZone).toISOString(),
    end: localMidnightUtc(endLocal, timeZone).toISOString(),
  };
}
