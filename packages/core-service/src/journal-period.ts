import type { DatabaseSync } from 'node:sqlite';

import {
  journalCompletedScheduleWindow,
  normalizeJournalTimeZone,
  type JournalSchedule,
} from '@worldforge/contracts';

interface TimeZoneRow {
  readonly timeZone: string;
}

function projectTimeZone(database: DatabaseSync, projectId: string): string {
  const row = database
    .prepare(
      `SELECT time_zone AS timeZone
         FROM genre_rhythm_profiles
        WHERE project_id = ?`,
    )
    .get(projectId) as TimeZoneRow | undefined;
  return normalizeJournalTimeZone(row?.timeZone);
}

export function journalCatchUpWindow(
  database: DatabaseSync,
  projectId: string,
  schedule: Exclude<JournalSchedule, 'off'>,
  now: Date,
): { readonly start: string; readonly end: string } {
  return journalCompletedScheduleWindow(schedule, now, projectTimeZone(database, projectId));
}
