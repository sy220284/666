import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const root = 'apps/desktop/renderer/src/features/writing';
const source = (file: string) => readFile(`${root}/${file}`, 'utf8');

describe('AR-04 Writing章节会话架构', () => {
  it('由显式状态机和三个专用Hook收敛会话职责', async () => {
    const [workbench, controller, session, lifecycle, autosave, state] = await Promise.all([
      source('writing-core-workbench.tsx'),
      source('use-writing-session-controller.ts'),
      source('use-chapter-session.ts'),
      source('use-editor-lifecycle.ts'),
      source('use-draft-autosave.ts'),
      source('chapter-session-state.ts'),
    ]);
    expect(workbench).toContain('useWritingSessionController');
    expect(controller).toContain('useChapterSession');
    expect(controller).toContain('useEditorLifecycle');
    expect(controller).toContain('useDraftAutosave');
    for (const phase of ['idle', 'loading', 'ready', 'flushing', 'switching', 'failed'])
      expect(state).toContain(`'${phase}'`);
    expect(session).toContain('chapterRequestIsCurrent');
    expect(lifecycle).toContain('editorGeneration.current += 1');
    expect(autosave).toContain('draftSaveContextIsCurrent');
  });

  it('统一Flush并保持IME暂停与恢复协议', async () => {
    const [controller, session, view] = await Promise.all([
      source('use-writing-session-controller.ts'),
      source('use-chapter-session.ts'),
      source('writing-workbench-view.tsx'),
    ]);
    expect(session).toContain('if (!(await input.flush()))');
    expect(controller).toContain('if (!(await flush()))');
    expect(view).toContain('onBeforeWrite={flush}');
    expect(view).toContain('onCompositionStart');
    expect(view).toContain('autosave.current?.pause()');
    expect(view).toContain('onCompositionEnd');
    expect(view).toContain('autosave.current?.resume()');
    expect(view).toContain('autosave.current?.markDirty()');
  });
});
