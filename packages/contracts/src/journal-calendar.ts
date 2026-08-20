const DEFAULT_JOURNAL_TIME_ZONE = 'Asia/Shanghai';
const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

interface LocalDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

interface LocalDateTimeParts extends LocalDateParts {
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
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

function dateParts(instant: Date, timeZone: string): LocalDateParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const values = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function dateTimeParts(instant: Date, timeZone: string): LocalDateTimeParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const values = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function utcDateValue(parts: LocalDateParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function shiftDate(parts: LocalDateParts, days: number): LocalDateParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function weekday(parts: LocalDateParts): number {
  return new Date(utcDateValue(parts)).getUTCDay();
}

function localMidnight(parts: LocalDateParts, timeZoneInput: string): Date {
  const timeZone = normalizeJournalTimeZone(timeZoneInput);
  const target = utcDateValue(parts);
  let estimate = new Date(target);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = dateTimeParts(estimate, timeZone);
    const observedValue = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    const correction = target - observedValue;
    if (correction === 0) return estimate;
    estimate = new Date(estimate.getTime() + correction);
  }

  return estimate;
}

function parseDate(value: string): LocalDateParts {
  const match = CALENDAR_DATE_PATTERN.exec(value);
  if (!match) throw new Error('JOURNAL_CALENDAR_DATE_INVALID');

  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  const roundTrip = new Date(utcDateValue(parts));
  const valid =
    roundTrip.getUTCFullYear() === parts.year &&
    roundTrip.getUTCMonth() + 1 === parts.month &&
    roundTrip.getUTCDate() === parts.day;
  if (!valid) throw new Error('JOURNAL_CALENDAR_DATE_INVALID');
  return parts;
}

export function journalCurrentDayWindow(now: Date, timeZoneInput: string): JournalCalendarWindow {
  const timeZone = normalizeJournalTimeZone(timeZoneInput);
  const today = dateParts(now, timeZone);
  return {
    start: localMidnight(today, timeZone).toISOString(),
    end: localMidnight(shiftDate(today, 1), timeZone).toISOString(),
  };
}

export function journalCurrentWeekWindow(now: Date, timeZoneInput: string): JournalCalendarWindow {
  const timeZone = normalizeJournalTimeZone(timeZoneInput);
  const today = dateParts(now, timeZone);
  const day = weekday(today);
  const sinceMonday = day === 0 ? 6 : day - 1;
  const monday = shiftDate(today, -sinceMonday);
  return {
    start: localMidnight(monday, timeZone).toISOString(),
    end: now.toISOString(),
  };
}

export function journalDateRangeWindow(
  startDate: string,
  endDate: string,
  timeZoneInput: string,
): JournalCalendarWindow {
  const timeZone = normalizeJournalTimeZone(timeZoneInput);
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (utcDateValue(start) > utcDateValue(end)) {
    throw new Error('JOURNAL_CALENDAR_RANGE_INVALID');
  }
  return {
    start: localMidnight(start, timeZone).toISOString(),
    end: localMidnight(shiftDate(end, 1), timeZone).toISOString(),
  };
}

export function journalCompletedScheduleWindow(
  schedule: 'daily' | 'weekly',
  now: Date,
  timeZoneInput: string,
): JournalCalendarWindow {
  const timeZone = normalizeJournalTimeZone(timeZoneInput);
  const today = dateParts(now, timeZone);
  if (schedule === 'daily') {
    return {
      start: localMidnight(shiftDate(today, -1), timeZone).toISOString(),
      end: localMidnight(today, timeZone).toISOString(),
    };
  }

  const day = weekday(today);
  const sinceMonday = day === 0 ? 6 : day - 1;
  const end = shiftDate(today, -sinceMonday);
  const start = shiftDate(end, -7);
  return {
    start: localMidnight(start, timeZone).toISOString(),
    end: localMidnight(end, timeZone).toISOString(),
  };
}
