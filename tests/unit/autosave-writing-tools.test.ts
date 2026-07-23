import { describe, expect, it, vi } from 'vitest';

import {
  DraftAutosaveCoordinator,
  calculateWritingStatistics,
  findTextRanges,
  replaceTextRanges,
} from '../../packages/editor-core/src/index.js';

describe('DraftAutosaveCoordinator', () => {
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
    await vi.advanceTimersByTimeAsync(799);
    expect(saves).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(saves).toBe(1);
    coordinator.markDirty();
    release?.(true);
    await vi.runAllTimersAsync();
    expect(saves).toBe(2);
    coordinator.destroy();
    vi.useRealTimers();
  });

  it('pauses during composition and flushes after resume', async () => {
    vi.useFakeTimers();
    let saves = 0;
    const coordinator = new DraftAutosaveCoordinator({
      delayMs: 800,
      save: async () => (++saves, true),
    });
    coordinator.pause();
    coordinator.markDirty();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(saves).toBe(0);
    coordinator.resume();
    await vi.advanceTimersByTimeAsync(800);
    expect(saves).toBe(1);
    coordinator.destroy();
    vi.useRealTimers();
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
    coordinator.destroy();
    expect(states).toEqual(['waiting', 'saving', 'idle']);
    release?.(true);
    await vi.runAllTimersAsync();
    expect(states).toEqual(['waiting', 'saving', 'idle']);
    vi.useRealTimers();
  });
});

describe('writing tools', () => {
  it('uses one Unicode-aware statistics algorithm', () => {
    expect(calculateWritingStatistics('雨落。 Wind 42', 2, 10)).toEqual({
      characterCount: 9,
      textCount: 8,
      paragraphCount: 2,
      progressPercent: 80,
    });
  });

  it('finds and replaces non-overlapping chapter matches', () => {
    expect(findTextRanges('风起，风又起', '风')).toEqual([
      { from: 0, to: 1 },
      { from: 3, to: 4 },
    ]);
    expect(replaceTextRanges('风起，风又起', '风', '雨', true)).toBe('雨起，雨又起');
  });
});
