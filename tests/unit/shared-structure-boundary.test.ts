import { access, readFile } from 'node:fs/promises';

import type { Chapter, StructureOperationPreview } from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';

import {
  chapterMeta,
  nullableNumber,
  previewMessage,
  statusLabel,
} from '../../apps/desktop/renderer/src/features/structure/structure-formatters.js';

describe('Shared Structure boundary', () => {
  it('keeps Writing independent from Planning', async () => {
    const writing = await Promise.all(
      ['writing-core-workbench.tsx', 'writing-workbench-view.tsx'].map((file) =>
        readFile(`apps/desktop/renderer/src/features/writing/${file}`, 'utf8'),
      ),
    ).then((sources) => sources.join('\n'));
    expect(writing).toContain("from '../structure/structure-navigator.js'");
    expect(writing).not.toMatch(/from ['"]\.\.\/planning\//u);
  });

  it('exports one Shared Structure navigator for Planning and Writing', async () => {
    const [shared, planning, professional] = await Promise.all([
      readFile('apps/desktop/renderer/src/features/structure/structure-navigator.tsx', 'utf8'),
      readFile('apps/desktop/renderer/src/features/planning/planning-workbench.tsx', 'utf8'),
      readFile(
        'apps/desktop/renderer/src/features/planning/professional-planning-workbench.tsx',
        'utf8',
      ),
    ]);
    expect(shared).toContain('export function StructureNavigator');
    expect(planning).toContain(
      "export { StructureNavigator } from '../structure/structure-navigator.js'",
    );
    expect(professional).not.toContain('export function StructureNavigator');
  });

  it('keeps the frozen Shared Structure responsibility split', async () => {
    const root = 'apps/desktop/renderer/src/features/structure';
    const files = [
      'structure-navigator.tsx',
      'structure-tree.tsx',
      'volume-editor-dialog.tsx',
      'chapter-editor-dialog.tsx',
      'structure-operation-dialog.tsx',
      'trash-panel.tsx',
      'structure-formatters.ts',
    ];

    await Promise.all(files.map((file) => access(`${root}/${file}`)));
    const sources = await Promise.all(files.map((file) => readFile(`${root}/${file}`, 'utf8')));
    expect(
      sources.filter((source) => source.includes('export function StructureNavigator')),
    ).toHaveLength(1);
  });

  it('formats every Shared Structure metadata and preview branch', () => {
    const chapter = {
      id: 'chapter-1',
      volumeId: 'volume-1',
      title: '第一章',
      orderKey: '1',
      status: 'pending',
      targetWordMin: null,
      targetWordMax: null,
      activeDraftId: null,
      finalVersionId: null,
      deletedAt: null,
    } satisfies Chapter;
    const preview = {
      operation: 'move-blocks',
      planHash: 'plan-hash',
      sourceChapterId: 'chapter-1',
      targetChapterId: 'chapter-2',
      sourceDraftId: 'draft-1',
      targetDraftId: 'draft-2',
      sourceRevision: 1,
      targetRevision: 2,
      movedLogicalBlockIds: ['block-1'],
      lockedLogicalBlockIds: [],
      sourceBlockCount: 3,
      targetBlockCount: 2,
      resultingSourceBlockCount: 2,
      resultingTargetBlockCount: 3,
      movedCharacterCount: 12,
      warnings: [],
      canExecute: true,
    } satisfies StructureOperationPreview;

    expect(nullableNumber(null)).toBeNull();
    expect(nullableNumber('   ')).toBeNull();
    expect(nullableNumber(' 42 ')).toBe(42);
    expect(['pending', 'outlined', 'writing', 'reviewing', 'finalized'].map(statusLabel)).toEqual([
      '待规划',
      '已规划',
      '写作中',
      '审阅中',
      '已定稿',
    ]);
    expect(chapterMeta(chapter)).toBe('待规划');
    expect(chapterMeta({ ...chapter, targetWordMax: 1200 })).toBe('待规划 · 0—1200 字');
    expect(chapterMeta({ ...chapter, targetWordMin: 800 })).toBe('待规划 · 800—∞ 字');
    expect(previewMessage(preview)).toBe('影响正文段落 1 · 源章 3→2 · 目标章 2→3');
    expect(
      previewMessage({
        ...preview,
        lockedLogicalBlockIds: ['block-2'],
        warnings: ['目标章接近字数上限', '请复核上下文'],
      }),
    ).toBe(
      '影响正文段落 1 · 源章 3→2 · 目标章 2→3 · 锁定段落 1 · 目标章接近字数上限；请复核上下文',
    );
  });
});
