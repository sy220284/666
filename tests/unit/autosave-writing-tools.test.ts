import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DraftAutosaveCoordinator,
  calculateWritingStatistics,
  findTextRanges,
  replaceTextRanges,
} from '../../packages/editor-core/src/index.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('DraftAutosaveCoordinator', () => {
  it('rejects invalid delays and reports an initially idle coordinator', async () => {
    expect(
      () =>
        new DraftAutosaveCoordinator({
          delayMs: -1,
          save: async () => true,
        }),
    ).toThrow('AUTOSAVE_DELAY_INVALID');
    expect(
      () =>
        new DraftAutosaveCoordinator({
          delayMs: 1.5,
          save: async () => true,
        }),
    ).toThrow('AUTOSAVE_DELAY_INVALID');

    const coordinator = new DraftAutosaveCoordinator({
      delayMs: 0,
      save: async () => true,
    });
    expect(coordinator.hasPendingWork).toBe(false);
    await expect(coordinator.flush()).resolves.toBe(true);
    coordinator.destroy();
    await expect(coordinator.flush()).resolves.toBe(true);
    coordinator.markDirty();
    coordinator.pause();
    coordinator.resume();
    coordinator.destroy();
    expect(coordinator.hasPendingWork).toBe(false);
  });

  it('waits 800ms and coalesces changes made during a save', async () => {
    vi.useFakeTimers();
    let saves = 0;
    let release: ((value: boolean) => void) | undefined;
    const coordinator = new DraftAutosaveCoordinator({
      delayMs: 800,
      save: async () => {
        saves += 1;
        if (saves === 1) return new Promise<boolean>((resolve) => (release = resolve));
        return true;
      },
    });
    coordinator.markDirty();
    expect(coordinator.hasPendingWork).toBe(true);
    await vi.advanceTimersByTimeAsync(799);
    expect(saves).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(saves).toBe(1);
    coordinator.markDirty();
    release?.(true);
    await vi.runAllTimersAsync();
    expect(saves).toBe(2);
    expect(coordinator.hasPendingWork).toBe(false);
    coordinator.destroy();
  });

  it('pauses during composition, rejects a paused flush and schedules dirty work after resume', async () => {
    vi.useFakeTimers();
    const states: string[] = [];
    let saves = 0;
    const coordinator = new DraftAutosaveCoordinator({
      delayMs: 800,
      save: async () => (++saves, true),
      onState: (state) => states.push(state),
    });
    coordinator.pause();
    coordinator.markDirty();
    await expect(coordinator.flush()).resolves.toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(saves).toBe(0);
    coordinator.resume();
    await vi.advanceTimersByTimeAsync(800);
    expect(saves).toBe(1);
    expect(states).toEqual(['paused', 'waiting', 'saving', 'saved']);
    coordinator.resume();
    expect(states.at(-1)).toBe('idle');
    coordinator.destroy();
  });

  it('marks failed and rejected saves dirty for a later retry', async () => {
    const states: string[] = [];
    let attempts = 0;
    const coordinator = new DraftAutosaveCoordinator({
      delayMs: 0,
      save: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('network failed');
        if (attempts === 2) return false;
        return true;
      },
      onState: (state) => states.push(state),
    });

    coordinator.markDirty();
    await expect(coordinator.flush()).resolves.toBe(false);
    expect(coordinator.hasPendingWork).toBe(true);
    await expect(coordinator.flush()).resolves.toBe(false);
    expect(coordinator.hasPendingWork).toBe(true);
    await expect(coordinator.flush()).resolves.toBe(true);
    expect(coordinator.hasPendingWork).toBe(false);
    expect(states).toEqual([
      'waiting',
      'saving',
      'failed',
      'saving',
      'failed',
      'saving',
      'saved',
    ]);
    coordinator.destroy();
  });

  it('shares an in-flight save across concurrent flushes and propagates failure', async () => {
    let release: ((value: boolean) => void) | undefined;
    const coordinator = new DraftAutosaveCoordinator({
      delayMs: 0,
      save: () => new Promise<boolean>((resolve) => (release = resolve)),
    });
    coordinator.markDirty();
    const first = coordinator.flush();
    const second = coordinator.flush();
    release?.(false);
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(false);
    expect(coordinator.hasPendingWork).toBe(true);
    coordinator.destroy();
  });

  it('flushes dirty work added while another caller awaits the in-flight save', async () => {
    let saves = 0;
    let release: ((value: boolean) => void) | undefined;
    const coordinator = new DraftAutosaveCoordinator({
      delayMs: 0,
      save: async () => {
        saves += 1;
        if (saves === 1) return new Promise<boolean>((resolve) => (release = resolve));
        return true;
      },
    });
    coordinator.markDirty();
    const first = coordinator.flush();
    const waiter = coordinator.flush();
    coordinator.markDirty();
    release?.(true);
    await expect(first).resolves.toBe(true);
    await expect(waiter).resolves.toBe(true);
    expect(saves).toBe(2);
    coordinator.destroy();
  });

  it('does not publish a late saved or failed state after the editor destroys the coordinator', async () => {
    vi.useFakeTimers();
    let release: ((value: boolean) => void) | undefined;
    const states: string[] = [];
    const coordinator = new DraftAutosaveCoordinator({
      delayMs: 800,
      save: () => new Promise<boolean>((resolve) => (release = resolve)),
      onState: (state) => states.push(state),
    });
    coordinator.markDirty();
    await vi.advanceTimersByTimeAsync(800);
    expect(states).toEqual(['waiting', 'saving']);
    const flush = coordinator.flush();
    coordinator.destroy();
    expect(states).toEqual(['waiting', 'saving', 'idle']);
    release?.(true);
    await expect(flush).resolves.toBe(true);
    await vi.runAllTimersAsync();
    expect(states).toEqual(['waiting', 'saving', 'idle']);
  });
});

describe('writing tools', () => {
  it('uses one Unicode-aware statistics algorithm across target and paragraph boundaries', () => {
    expect(calculateWritingStatistics('雨落。 Wind 42', 2, 10)).toEqual({
      characterCount: 9,
      textCount: 8,
      paragraphCount: 2,
      progressPercent: 80,
    });
    expect(calculateWritingStatistics('一二三', -2.8)).toEqual({
      characterCount: 3,
      textCount: 3,
      paragraphCount: 0,
      progressPercent: null,
    });
    expect(calculateWritingStatistics('一二三', 1.9, 0).progressPercent).toBeNull();
    expect(calculateWritingStatistics('一二三', 1, -1).progressPercent).toBeNull();
    expect(calculateWritingStatistics('一二三', 1, 1).progressPercent).toBe(100);
  });

  it('finds case-sensitive and insensitive non-overlapping matches', () => {
    expect(findTextRanges('风起，风又起', '风')).toEqual([
      { from: 0, to: 1 },
      { from: 3, to: 4 },
    ]);
    expect(findTextRanges('Alpha alpha ALPHA', 'alpha')).toEqual([
      { from: 0, to: 5 },
      { from: 6, to: 11 },
      { from: 12, to: 17 },
    ]);
    expect(findTextRanges('Alpha alpha', 'alpha', true)).toEqual([{ from: 6, to: 11 }]);
    expect(findTextRanges('aaaa', 'aa')).toEqual([
      { from: 0, to: 2 },
      { from: 2, to: 4 },
    ]);
    expect(findTextRanges('正文', '')).toEqual([]);
    expect(findTextRanges('正文', '缺失')).toEqual([]);
  });

  it('replaces the first, every or no matching range without overlapping edits', () => {
    expect(replaceTextRanges('风起，风又起', '风', '雨', true)).toBe('雨起，雨又起');
    expect(replaceTextRanges('Alpha alpha', 'alpha', 'Beta', false)).toBe('Beta alpha');
    expect(replaceTextRanges('Alpha alpha', 'alpha', 'Beta', false, true)).toBe('Alpha Beta');
    expect(replaceTextRanges('正文', '缺失', '替换', true)).toBe('正文');
  });
});
