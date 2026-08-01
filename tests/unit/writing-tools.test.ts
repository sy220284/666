import { describe, expect, it } from 'vitest';

import { candidateConflictLabel } from '../../apps/desktop/renderer/src/features/writing/candidate-conflicts.js';
import {
  buildCandidateSelection,
  nullableFormText,
  toggleSelectionSet,
} from '../../apps/desktop/renderer/src/features/writing/candidate-selection.js';
import {
  captureContinuationAnchor,
  continuationCursorPosition,
  restoreContinuationAnchor,
} from '../../apps/desktop/renderer/src/features/writing/continuation-anchor.js';
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

  it('从当前正文块捕获续写锚点', () => {
    const anchor = captureContinuationAnchor({
      state: {
        selection: {
          $from: {
            depth: 2,
            pos: 17,
            start: () => 10,
            node: (depth: number) => ({
              attrs:
                depth === 1
                  ? { logicalBlockId: 'block-a', contentHash: 'hash-a' }
                  : { role: 'paragraph' },
            }),
          },
        },
      },
    } as Parameters<typeof captureContinuationAnchor>[0]);
    expect(anchor).toEqual({
      logicalBlockId: 'block-a',
      expectedBlockHash: 'hash-a',
      cursorOffset: 7,
    });
  });

  it('只在就绪续写快照匹配正文块时恢复光标', () => {
    const selections: number[] = [];
    let focused = false;
    const instance = {
      state: {
        doc: {
          descendants: (
            visit: (
              node: { attrs: unknown; content: { size: number } },
              position: number,
            ) => boolean | void,
          ) => {
            visit({ attrs: { logicalBlockId: 'other' }, content: { size: 2 } }, 3);
            visit({ attrs: { logicalBlockId: 'block-a' }, content: { size: 5 } }, 10);
            visit({ attrs: { logicalBlockId: 'block-a' }, content: { size: 5 } }, 20);
          },
        },
      },
      commands: {
        setTextSelection: (position: number) => selections.push(position),
        focus: () => {
          focused = true;
        },
      },
    } as Parameters<typeof restoreContinuationAnchor>[0];
    restoreContinuationAnchor(instance, {
      status: 'unavailable',
    } as Parameters<typeof restoreContinuationAnchor>[1]);
    restoreContinuationAnchor(instance, {
      status: 'ready',
      logicalBlockId: 'block-a',
      cursorOffset: 99,
    } as Parameters<typeof restoreContinuationAnchor>[1]);
    expect(selections).toEqual([16]);
    expect(focused).toBe(true);
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

  it('拒绝整稿采用不完整候选，并保留显式块选择', () => {
    const preview = {
      candidate: { completeness: 'partial' },
    } as Parameters<typeof buildCandidateSelection>[0];
    expect(buildCandidateSelection(preview, 'all', new Set(), new Set())).toBeNull();
    expect(
      buildCandidateSelection(preview, 'blocks', new Set(['block-b', 'block-a']), new Set()),
    ).toEqual({
      mode: 'blocks',
      candidateBlockIds: ['block-b', 'block-a'],
      deleteLogicalBlockIds: [],
    });
  });

  it('规范可空表单文本与冲突作者提示', () => {
    expect(nullableFormText('  标签  ')).toBe('标签');
    expect(nullableFormText('   ')).toBeNull();
    expect(candidateConflictLabel('locked')).toBe('建议稿涉及已锁定的正文');
  });
});
