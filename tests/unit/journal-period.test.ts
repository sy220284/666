import { DatabaseSync } from 'node:sqlite';

import { describe, expect, it } from 'vitest';

import { journalCatchUpWindow } from '../../packages/core-service/src/journal-period.js';

const PROJECT_ID = '00000000-0000-4000-8000-000000000001';

function databaseFor(timeZone: string): DatabaseSync {
  const database = new DatabaseSync(':memory:');
  database.exec(
    'CREATE TABLE genre_rhythm_profiles(project_id TEXT PRIMARY KEY, time_zone TEXT NOT NULL)',
  );
  database
    .prepare('INSERT INTO genre_rhythm_profiles(project_id, time_zone) VALUES(?, ?)')
    .run(PROJECT_ID, timeZone);
  return database;
}

describe('journalCatchUpWindow', () => {
  it('uses the project IANA timezone for the previous completed local day', () => {
    const database = databaseFor('Asia/Shanghai');
    try {
      const window = journalCatchUpWindow(
        database,
        PROJECT_ID,
        'daily',
        new Date('2026-08-15T03:36:00.000Z'),
      );
      expect(window).toEqual({
        start: '2026-08-13T16:00:00.000Z',
        end: '2026-08-14T16:00:00.000Z',
      });
    } finally {
      database.close();
    }
  });

  it('uses the previous completed Monday-to-Monday week in project local time', () => {
    const database = databaseFor('Asia/Shanghai');
    try {
      const window = journalCatchUpWindow(
        database,
        PROJECT_ID,
        'weekly',
        new Date('2026-08-15T03:36:00.000Z'),
      );
      expect(window).toEqual({
        start: '2026-08-02T16:00:00.000Z',
        end: '2026-08-09T16:00:00.000Z',
      });
    } finally {
      database.close();
    }
  });

  it('keeps daylight-saving boundaries as local midnight instead of forcing 24 hours', () => {
    const database = databaseFor('America/New_York');
    try {
      const window = journalCatchUpWindow(
        database,
        PROJECT_ID,
        'daily',
        new Date('2026-03-09T16:00:00.000Z'),
      );
      expect(window).toEqual({
        start: '2026-03-08T05:00:00.000Z',
        end: '2026-03-09T04:00:00.000Z',
      });
    } finally {
      database.close();
    }
  });
});
