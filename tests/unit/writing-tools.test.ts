import { describe, expect, it } from 'vitest';

import { candidateConflictLabel } from '../../apps/desktop/renderer/src/features/writing/candidate-conflicts.js';
import {
  nullableFormText,
  toggleSelectionSet,
} from '../../apps/desktop/renderer/src/features/writing/candidate-selection.js';
import { continuationCursorPosition } from '../../apps/desktop/renderer/src/features/writing/continuation-anchor.js';
import { clampEditorTextSelection } from '../../apps/desktop/renderer/src/features/writing/editor-selection.js';
import { pastedStyleIsHidden } from '../../apps/desktop/renderer/src/features/writing/paste-sanitizer.js';

describe('Writing纯工具', () => {
  it('限制恢复的编辑器选择范围', () => {
    expect(clampEditorTextSelection(-2, 99, 8)).toEqual({ from: 1, to: 8 });
    expect(clampEditorTextSelection(0, 0, 0)).toEqual({ from: 1, to: 1 });
  });

  it('限制续写光标在目标正文块内', () => {
    expect(continuationCursorPosition(10, -3, 20)).toBe(11);
    expect(continuationCursorPosition(10, 99, 20)).toBe(31);
  });

  it('识别粘贴内容中的隐藏样式', () => {
    expect(pastedStyleIsHidden('color: red; display: none')).toBe(true);
    expect(pastedStyleIsHidden('visibility:hidden')).toBe(true);
    expect(pastedStyleIsHidden('display: block; color: red')).toBe(false);
  });

  it('以不可变集合记录候选选择', () => {
    const source = new Set(['a']);
    const added = toggleSelectionSet(source, 'b', true);
    const removed = toggleSelectionSet(added, 'a', false);
    expect(source).toEqual(new Set(['a']));
    expect(added).toEqual(new Set(['a', 'b']));
    expect(removed).toEqual(new Set(['b']));
  });

  it('规范可空表单文本与冲突作者提示', () => {
    expect(nullableFormText('  标签  ')).toBe('标签');
    expect(nullableFormText('   ')).toBeNull();
    expect(candidateConflictLabel('locked')).toBe('建议稿涉及已锁定的正文');
  });
});
