import { describe, expect, it } from 'vitest';

import {
  ContinuationPersistenceTracker,
  derivePanelSwitchInput,
} from '../../apps/desktop/renderer/src/features/writing/continuation-persistence.js';

interface ContinuationFixture {
  readonly projectId: string;
  readonly chapterId: string;
  readonly scrollTop: number;
  readonly panel: 'editor' | 'versions' | 'candidates';
}

function continuation(overrides: Partial<ContinuationFixture> = {}): ContinuationFixture {
  return {
    projectId: '00000000-0000-4000-8000-000000000001',
    chapterId: '00000000-0000-4000-8000-000000000101',
    scrollTop: 320,
    panel: 'editor',
    ...overrides,
  };
}

describe('M4-04 C8 continuation persistence coordination', () => {
  it('dedupes a save only after the write has been confirmed', () => {
    const tracker = new ContinuationPersistenceTracker<ContinuationFixture>();
    const input = continuation();

    expect(tracker.isCommitted(input)).toBe(false);
    tracker.commit(input);
    expect(tracker.isCommitted(input)).toBe(true);
    expect(tracker.committedInput()).toBe(input);
  });

  it('keeps an unconfirmed panel switch eligible for re-submission', () => {
    const tracker = new ContinuationPersistenceTracker<ContinuationFixture>();
    tracker.commit(continuation({ panel: 'editor' }));

    // The save for the derived panel switch fails, so the tracker must not be
    // committed: re-submission of the very same panel state stays possible
    // (M4-04 known risk #6).
    const retry = derivePanelSwitchInput(tracker.committedInput(), 'candidates');
    expect(retry).not.toBeNull();
    if (!retry) return;
    expect(tracker.isCommitted(retry)).toBe(false);

    tracker.commit(retry);
    expect(tracker.isCommitted(continuation({ panel: 'candidates' }))).toBe(true);
  });

  it('derives a panel-switch save only from committed state and only when changed', () => {
    const tracker = new ContinuationPersistenceTracker<ContinuationFixture>();

    expect(derivePanelSwitchInput(tracker.committedInput(), 'versions')).toBeNull();

    const committed = continuation({ panel: 'editor', scrollTop: 128 });
    tracker.commit(committed);

    expect(derivePanelSwitchInput(tracker.committedInput(), 'editor')).toBeNull();
    expect(derivePanelSwitchInput(tracker.committedInput(), 'versions')).toEqual({
      ...committed,
      panel: 'versions',
    });
  });

  it('treats any persisted field change as a new signature', () => {
    const tracker = new ContinuationPersistenceTracker<ContinuationFixture>();
    tracker.commit(continuation());

    expect(tracker.isCommitted(continuation({ scrollTop: 321 }))).toBe(false);
    expect(
      tracker.isCommitted(continuation({ chapterId: '00000000-0000-4000-8000-000000000102' })),
    ).toBe(false);
  });
});
