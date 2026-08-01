import type { Dispatch, SetStateAction } from 'react';

import type { Chapter, ProjectWorkspaceSummary } from '@worldforge/contracts';

import type { WritingPanel } from './writing-workbench-types.js';

interface WritingWorkbenchHeaderProps {
  readonly project: ProjectWorkspaceSummary;
  readonly chapter: Chapter | null;
  readonly panel: WritingPanel;
  readonly outlineVisible: boolean;
  readonly contextVisible: boolean;
  readonly focusMode: boolean;
  readonly setOutlineVisible: Dispatch<SetStateAction<boolean>>;
  readonly setContextVisible: Dispatch<SetStateAction<boolean>>;
  readonly onPanelChange: (panel: WritingPanel) => void;
  readonly rememberCurrentSelection: () => void;
  readonly backToProject: () => Promise<void>;
  readonly toggleFocusMode: () => void;
}

export function WritingWorkbenchHeader({
  project,
  chapter,
  panel,
  outlineVisible,
  contextVisible,
  focusMode,
  setOutlineVisible,
  setContextVisible,
  onPanelChange,
  rememberCurrentSelection,
  backToProject,
  toggleFocusMode,
}: WritingWorkbenchHeaderProps) {
  return (
    <header className="feature-heading writing-heading">
      <div>
        <p className="eyebrow">本地写作 · 自动保存</p>
        <h1>{chapter ? `${project.name} · ${chapter.title}` : project.name}</h1>
        <p>正文、历史版本和建议稿都保存在当前作品中；采用前可预览，保存后可追溯。</p>
      </div>
      <div className="feature-heading__actions">
        <button
          data-back-project
          type="button"
          onPointerDownCapture={rememberCurrentSelection}
          onClick={() => void backToProject()}
        >
          返回项目
        </button>
        <button
          type="button"
          className={panel === 'editor' ? 'is-active' : ''}
          onClick={() => onPanelChange('editor')}
        >
          正文
        </button>
        <button
          data-open-versions
          data-create-version
          type="button"
          className={panel === 'versions' ? 'is-active' : ''}
          disabled={!chapter}
          onClick={() => onPanelChange('versions')}
        >
          历史版本
        </button>
        <button
          data-open-candidate-preview
          type="button"
          className={panel === 'candidates' ? 'is-active' : ''}
          disabled={!chapter}
          onClick={() => onPanelChange('candidates')}
        >
          建议稿
        </button>
        <button
          aria-pressed={outlineVisible}
          data-toggle-writing-outline
          type="button"
          onClick={() => setOutlineVisible((visible) => !visible)}
        >
          {outlineVisible ? '收起目录' : '展开目录'}
        </button>
        <button
          aria-pressed={contextVisible}
          data-toggle-writing-context
          type="button"
          onClick={() => setContextVisible((visible) => !visible)}
        >
          {contextVisible ? '收起写作辅助' : '展开写作辅助'}
        </button>
        <button
          aria-pressed={focusMode}
          data-toggle-focus-mode
          type="button"
          onPointerDownCapture={rememberCurrentSelection}
          onClick={toggleFocusMode}
        >
          {focusMode ? '退出沉浸' : '沉浸写作'}
        </button>
      </div>
    </header>
  );
}
