const DEFAULT_JOURNAL_TIME_ZONE = 'Asia/Shanghai';
const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

interface LocalDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export interface JournalCalendarWindow {
  readonly start: string;
  readonly end: string;
}

export function normalizeJournalTimeZone(candidate: string | null | undefined): string {
  const timeZone = candidate?.trim() || DEFAULT_JOURNAL_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(0));
    return timeZone;
  } catch {
    return DEFAULT_JOURNAL_TIME_ZONE;
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

function localMidnightUtc(parts: LocalDateParts, timeZoneInput: string): Date {
  const timeZone = normalizeJournalTimeZone(timeZoneInput);
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

function parseCalendarDate(value: string): LocalDateParts {
  const match = CALENDAR_DATE_PATTERN.exec(value);
  if (!match) throw new Error('JOURNAL_CALENDAR_DATE_INVALID');
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    date.getUTCFullYear() !== parts.year ||
    date.getUTCMonth() + 1 !== parts.month ||
    date.getUTCDate() !== parts.day
  ) {
    throw new Error('JOURNAL_CALENDAR_DATE_INVALID');
  }
  return parts;
}

function compareLocalDates(left: LocalDateParts, right: LocalDateParts): number {
  return (
    Date.UTC(left.year, left.month - 1, left.day) -
    Date.UTC(right.year, right.month - 1, right.day)
  );
}

export function journalCurrentDayWindow(
  now: Date,
  timeZoneInput: string,
): JournalCalendarWindow {
  const timeZone = normalizeJournalTimeZone(timeZoneInput);
  const today = localDateParts(now, timeZone);
  return {
    start: localMidnightUtc(today, timeZone).toISOString(),
    end: localMidnightUtc(shiftLocalDate(today, 1), timeZone).toISOString(),
  };
}

export function journalCurrentWeekWindow(
  now: Date,
  timeZoneInput: string,
): JournalCalendarWindow {
  const timeZone = normalizeJournalTimeZone(timeZoneInput);
  const today = localDateParts(now, timeZone);
  const day = weekday(today);
  const sinceMonday = day === 0 ? 6 : day - 1;
  const monday = shiftLocalDate(today, -sinceMonday);
  return {
    start: localMidnightUtc(monday, timeZone).toISOString(),
    end: now.toISOString(),
  };
}

export function journalDateRangeWindow(
  startDate: string,
  endDate: string,
  timeZoneInput: string,
): JournalCalendarWindow {
  const timeZone = normalizeJournalTimeZone(timeZoneInput);
  const start = parseCalendarDate(startDate);
  const end = parseCalendarDate(endDate);
  if (compareLocalDates(start, end) > 0) throw new Error('JOURNAL_CALENDAR_RANGE_INVALID');
  return {
    start: localMidnightUtc(start, timeZone).toISOString(),
    end: localMidnightUtc(shiftLocalDate(end, 1), timeZone).toISOString(),
  };
}

export function journalCompletedScheduleWindow(
  schedule: 'daily' | 'weekly',
  now: Date,
  timeZoneInput: string,
): JournalCalendarWindow {
  const timeZone = normalizeJournalTimeZone(timeZoneInput);
  const today = localDateParts(now, timeZone);
  if (schedule === 'daily') {
    return {
      start: localMidnightUtc(shiftLocalDate(today, -1), timeZone).toISOString(),
      end: localMidnightUtc(today, timeZone).toISOString(),
    };
  }

  const day = weekday(today);
  const sinceMonday = day === 0 ? 6 : day - 1;
  const end = shiftLocalDate(today, -sinceMonday);
  const start = shiftLocalDate(end, -7);
  return {
    start: localMidnightUtc(start, timeZone).toISOString(),
    end: localMidnightUtc(end, timeZone).toISOString(),
  };
}
