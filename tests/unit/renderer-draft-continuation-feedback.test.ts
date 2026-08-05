import { describe, expect, it, vi } from 'vitest';

import { reportPersistedDraft } from '../../apps/desktop/renderer/src/features/writing/use-draft-autosave.js';

describe('M10-11 persisted Draft feedback', () => {
  it('reports a retryable continuation warning after the Draft itself is persisted', async () => {
    const setStatus = vi.fn();

    await expect(
      reportPersistedDraft({
        revision: 9,
        editorChanged: false,
        saveContinuation: async () => false,
        setStatus,
        savedStatus: (label, revision) => `${label} · 修订 ${revision}`,
      }),
    ).resolves.toBe(false);

    expect(setStatus).toHaveBeenCalledWith('已保存 · 修订 9 · 续写位置待重试', true);
  });

  it('keeps new editor input visible while confirming both persistence layers', async () => {
    const setStatus = vi.fn();

    await expect(
      reportPersistedDraft({
        revision: 10,
        editorChanged: true,
        saveContinuation: async () => true,
        setStatus,
        savedStatus: (label, revision) => `${label} · 修订 ${revision}`,
      }),
    ).resolves.toBe(true);

    expect(setStatus).toHaveBeenCalledWith('已保存 · 修订 10 · 编辑器仍有新输入', false);
  });
});
