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
  readonly editorState: string;
  readonly editorFailure: boolean;
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
  editorState,
  editorFailure,
  setOutlineVisible,
  setContextVisible,
  onPanelChange,
  rememberCurrentSelection,
  backToProject,
  toggleFocusMode,
}: WritingWorkbenchHeaderProps) {
  return (
    <header className="feature-heading writing-heading">
      <div className="writing-heading__identity">
        <button
          className="quiet-button"
          data-back-project
          type="button"
          onPointerDownCapture={rememberCurrentSelection}
          onClick={() => void backToProject()}
        >
          返回
        </button>
        <div>
          <h1>{chapter ? `${project.name} · ${chapter.title}` : project.name}</h1>
          <p
            className={editorFailure ? 'writing-save-state is-error' : 'writing-save-state'}
            data-writing-save-state
            role="status"
            aria-live="polite"
          >
            {editorState}
          </p>
        </div>
      </div>
      <div className="feature-heading__actions writing-heading__actions">
        {panel !== 'editor' ? (
          <button type="button" onClick={() => onPanelChange('editor')}>
            返回正文
          </button>
        ) : null}
        <button
          aria-pressed={outlineVisible}
          data-toggle-writing-outline
          type="button"
          onClick={() => setOutlineVisible((visible) => !visible)}
        >
          {outlineVisible ? '隐藏目录' : '显示目录'}
        </button>
        <button
          aria-pressed={contextVisible}
          data-toggle-writing-context
          type="button"
          onClick={() => setContextVisible((visible) => !visible)}
        >
          {contextVisible ? '隐藏写作辅助' : '显示写作辅助'}
        </button>
        <button
          data-open-candidate-preview
          type="button"
          className={panel === 'candidates' ? 'is-active' : ''}
          disabled={!chapter}
          onClick={() => onPanelChange('candidates')}
        >
          智能助手
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
        <details className="writing-more-menu">
          <summary>更多</summary>
          <div className="writing-more-menu__panel">
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
          </div>
        </details>
      </div>
    </header>
  );
}
