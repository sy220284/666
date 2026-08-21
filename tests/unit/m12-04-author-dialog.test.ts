import { afterEach, describe, expect, it } from 'vitest';

import {
  authorConfirm,
  authorConfirmName,
  authorPrompt,
  authorSelect,
  resetAuthorDialogsForTesting,
  resolveAuthorDialog,
  subscribeAuthorDialog,
  type PendingAuthorDialog,
} from '../../apps/desktop/renderer/src/runtime/author-dialog.js';

afterEach(() => {
  resetAuthorDialogsForTesting();
});

describe('M12-04 author dialog service', () => {
  it('resolves ordinary confirmation without browser-native dialog ownership', async () => {
    let active: PendingAuthorDialog | null = null;
    const unsubscribe = subscribeAuthorDialog((pending) => {
      active = pending;
    });

    const result = authorConfirm({
      title: '删除章节',
      message: '确认移入回收站？',
      danger: true,
    });

    const pending = active as PendingAuthorDialog | null;
    expect(pending?.request.kind).toBe('confirm');
    expect(pending?.request.title).toBe('删除章节');
    if (!pending) throw new Error('AUTHOR_DIALOG_NOT_OPEN');
    resolveAuthorDialog(pending.id, true);
    await expect(result).resolves.toBe(true);
    unsubscribe();
  });

  it('queues text and selection requests and preserves their author-facing values', async () => {
    let active: PendingAuthorDialog | null = null;
    const unsubscribe = subscribeAuthorDialog((pending) => {
      active = pending;
    });

    const text = authorPrompt({ title: '新章节标题', initialValue: '第二章' });
    const selected = authorSelect({
      title: '选择处理方式',
      options: [
        { value: 'keep', label: '保留' },
        { value: 'discard', label: '放弃' },
      ],
    });

    const first = active as PendingAuthorDialog | null;
    if (!first) throw new Error('AUTHOR_DIALOG_NOT_OPEN');
    expect(first.request.kind).toBe('text');
    resolveAuthorDialog(first.id, '第二章·雨夜');
    await expect(text).resolves.toBe('第二章·雨夜');

    const second = active as PendingAuthorDialog | null;
    if (!second) throw new Error('AUTHOR_DIALOG_QUEUE_NOT_ADVANCED');
    expect(second.request.kind).toBe('select');
    resolveAuthorDialog(second.id, 'keep');
    await expect(selected).resolves.toBe('keep');
    unsubscribe();
  });

  it('returns false when a high-risk name confirmation is cancelled', async () => {
    let active: PendingAuthorDialog | null = null;
    const unsubscribe = subscribeAuthorDialog((pending) => {
      active = pending;
    });

    const result = authorConfirmName({
      title: '永久删除作品',
      expectedName: '示例作品',
      danger: true,
    });
    const pending = active as PendingAuthorDialog | null;
    if (!pending) throw new Error('AUTHOR_DIALOG_NOT_OPEN');
    expect(pending.request.kind).toBe('name');
    resolveAuthorDialog(pending.id, false);
    await expect(result).resolves.toBe(false);
    unsubscribe();
  });
});
