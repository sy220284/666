import { describe, expect, it } from 'vitest';

import {
  journalCompletedScheduleWindow,
  journalCurrentDayWindow,
  journalCurrentWeekWindow,
  journalDateRangeWindow,
  normalizeJournalTimeZone,
} from '@worldforge/contracts';

describe('创作日志作品时区窗口', () => {
  it('跨电脑时区时仍按作品时区计算今日和本周', () => {
    const now = new Date('2026-08-20T02:30:00.000Z');

    expect(journalCurrentDayWindow(now, 'America/New_York')).toEqual({
      start: '2026-08-19T04:00:00.000Z',
      end: '2026-08-20T04:00:00.000Z',
    });
    expect(journalCurrentWeekWindow(now, 'America/New_York')).toEqual({
      start: '2026-08-17T04:00:00.000Z',
      end: '2026-08-20T02:30:00.000Z',
    });
  });

  it('指定日期范围正确处理夏令时日长变化', () => {
    expect(journalDateRangeWindow('2026-03-08', '2026-03-08', 'America/New_York')).toEqual({
      start: '2026-03-08T05:00:00.000Z',
      end: '2026-03-09T04:00:00.000Z',
    });
  });

  it('自动复盘与手动复盘共享同一作品时区算法', () => {
    const now = new Date('2026-08-20T02:30:00.000Z');
    expect(journalCompletedScheduleWindow('daily', now, 'America/New_York')).toEqual({
      start: '2026-08-18T04:00:00.000Z',
      end: '2026-08-19T04:00:00.000Z',
    });
    expect(journalCompletedScheduleWindow('weekly', now, 'America/New_York')).toEqual({
      start: '2026-08-10T04:00:00.000Z',
      end: '2026-08-17T04:00:00.000Z',
    });
  });

  it('无效作品时区与倒置日期范围失败关闭', () => {
    expect(normalizeJournalTimeZone('Invalid/Zone')).toBe('Asia/Shanghai');
    expect(() => journalDateRangeWindow('2026-08-20', '2026-08-19', 'Asia/Shanghai')).toThrow(
      'JOURNAL_CALENDAR_RANGE_INVALID',
    );
  });
});
