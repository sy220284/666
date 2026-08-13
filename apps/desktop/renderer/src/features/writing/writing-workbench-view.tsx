import { useEffect, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { Chapter, DraftDocument, ProjectWorkspaceSummary } from '@worldforge/contracts';
import { redoWorldforgeEditor, undoWorldforgeEditor } from '@worldforge/editor-core';
import type { DraftAutosaveCoordinator, Editor } from '@worldforge/editor-core';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import type { AuthorNavigationTarget } from '../../shell/navigation-target.js';
import { StructureNavigator } from '../structure/structure-navigator.js';
import { CandidateReviewPanel } from './candidate-review-panel.js';
import type { ChapterSessionPhase } from './chapter-session-state.js';
import { captureRewriteSelectionAnchor } from './editor-selection.js';
import { FindReplaceToolbar } from './find-replace-toolbar.js';
import { VersionPanel } from './version-panel.js';
import { WritingAssistancePanel } from './writing-assistance-panel.js';
import { WritingWorkbenchHeader } from './writing-workbench-header.js';
import type { useWritingEditorTools } from './use-writing-editor-tools.js';
import type { useWritingMetrics } from './use-writing-metrics.js';
import type { useWritingStatus } from './use-writing-status.js';
import type { WritingPanel } from './writing-workbench-types.js';

interface WritingWorkbenchViewProps {
  readonly bridge: RendererBridgeAdapter;
  readonly project: ProjectWorkspaceSummary;
  readonly panel: WritingPanel;
  readonly chapterSessionPhase: ChapterSessionPhase;
  readonly chapter: Chapter | null;
  readonly draft: DraftDocument | null;
  readonly readOnly: boolean;
  readonly editorReady: boolean;
  readonly editorUnavailable: boolean;
  readonly focusMode: boolean;
  readonly outlineVisible: boolean;
  readonly contextVisible: boolean;
  readonly isComposing: boolean;
  readonly findText: string;
  readonly replaceText: string;
  readonly findIndex: number;
  readonly findCount: number;
  readonly editorTools: ReturnType<typeof useWritingEditorTools>;
  readonly metrics: ReturnType<typeof useWritingMetrics>;
  readonly writingStatus: ReturnType<typeof useWritingStatus>;
  readonly navigationVersionId: string | null | undefined;
  readonly editorHost: MutableRefObject<HTMLDivElement | null>;
  readonly editor: MutableRefObject<Editor | null>;
  readonly autosave: MutableRefObject<DraftAutosaveCoordinator | null>;
  readonly composing: MutableRefObject<boolean>;
  readonly setOutlineVisible: Dispatch<SetStateAction<boolean>>;
  readonly setContextVisible: Dispatch<SetStateAction<boolean>>;
  readonly setFindText: Dispatch<SetStateAction<string>>;
  readonly setReplaceText: Dispatch<SetStateAction<string>>;
  readonly setFindIndex: Dispatch<SetStateAction<number>>;
  readonly setIsComposing: Dispatch<SetStateAction<boolean>>;
  readonly onNavigate: (target: AuthorNavigationTarget) => void;
  readonly onPanelChange: (panel: WritingPanel) => void;
  readonly onStatus: (message: string) => void;
  readonly openChapter: (chapter: Chapter) => Promise<void>;
  readonly flush: () => Promise<boolean>;
  readonly replaceDraft: (draft: DraftDocument, message: string) => void;
  readonly backToProject: () => Promise<void>;
}

export function WritingWorkbenchView({
  bridge,
  project,
  panel,
  chapterSessionPhase,
  chapter,
  draft,
  readOnly,
  editorReady,
  editorUnavailable,
  focusMode,
  outlineVisible,
  contextVisible,
  isComposing,
  findText,
  replaceText,
  findIndex,
  findCount,
  editorTools,
  metrics,
  writingStatus,
  navigationVersionId,
  editorHost,
  editor,
  autosave,
  composing,
  setOutlineVisible,
  setContextVisible,
  setFindText,
  setReplaceText,
  setFindIndex,
  setIsComposing,
  onNavigate,
  onPanelChange,
  onStatus,
  openChapter,
  flush,
  replaceDraft,
  backToProject,
}: WritingWorkbenchViewProps) {
  const [findOpen, setFindOpen] = useState(false);
  const {
    rememberCurrentSelection,
    toggleFocusMode,
    selectMatch,
    replaceMatches,
    setBlockType,
    insertSeparator,
    toggleLock,
    manualSave,
  } = editorTools;
  const { statistics, selectedLocked } = metrics;
  const { editorState, editorFailure, setStatus } = writingStatus;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (panel !== 'editor') return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setFindOpen(true);
        return;
      }
      if (event.key === 'Escape' && findOpen) setFindOpen(false);
    };
    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
  }, [findOpen, panel]);

  return (
    <section
      className="writing-workbench"
      data-chapter-session-phase={chapterSessionPhase}
      data-focus-mode={focusMode}
      data-writing-workbench
      data-draft-workspace={editorReady ? '' : undefined}
    >
      <WritingWorkbenchHeader
        backToProject={backToProject}
        chapter={chapter}
        contextVisible={contextVisible}
        editorFailure={editorFailure}
        editorState={editorState}
        focusMode={focusMode}
        onPanelChange={onPanelChange}
        outlineVisible={outlineVisible}
        panel={panel}
        project={project}
        rememberCurrentSelection={rememberCurrentSelection}
        setContextVisible={setContextVisible}
        setOutlineVisible={setOutlineVisible}
        toggleFocusMode={toggleFocusMode}
      />
      <div
        className="writing-grid"
        data-context-visible={contextVisible && !focusMode}
        data-outline-visible={outlineVisible && !focusMode}
      >
        {outlineVisible && !focusMode ? (
          <StructureNavigator
            bridge={bridge}
            compact
            projectId={project.projectId}
            readOnly={readOnly}
            selectedChapterId={chapter?.id ?? null}
            onSelectChapter={() => undefined}
            onOpenChapter={(nextChapter) => void openChapter(nextChapter)}
            onBeforeWrite={flush}
            onStatus={onStatus}
          />
        ) : null}

        <main className="writing-editor-card">
          {panel === 'editor' ? (
            <>
              <div className="draft-editor-controls" data-draft-editor-controls>
                <details className="draft-tools-menu" data-draft-tools-menu>
                  <summary>段落工具</summary>
                  <div className="draft-toolbar" role="toolbar" aria-label="正文段落工具">
                    <button
                      data-set-block-type="paragraph"
                      type="button"
                      disabled={editorUnavailable}
                      onClick={() => setBlockType('paragraph')}
                    >
                      正文
                    </button>
                    <button
                      data-set-block-type="dialogue"
                      type="button"
                      disabled={editorUnavailable}
                      onClick={() => setBlockType('dialogue')}
                    >
                      对话
                    </button>
                    <button
                      data-set-block-type="heading"
                      type="button"
                      disabled={editorUnavailable}
                      onClick={() => setBlockType('heading')}
                    >
                      小标题
                    </button>
                    <button
                      data-insert-separator
                      type="button"
                      disabled={editorUnavailable}
                      onClick={insertSeparator}
                    >
                      分隔线
                    </button>
                    <button
                      data-toggle-block-lock
                      type="button"
                      aria-pressed={selectedLocked === true}
                      disabled={editorUnavailable || selectedLocked === null}
                      onClick={toggleLock}
                    >
                      {selectedLocked ? '解锁当前段落' : '锁定当前段落'}
                    </button>
                    <button
                      data-undo-draft
                      type="button"
                      disabled={editorUnavailable}
                      onClick={() => editor.current && undoWorldforgeEditor(editor.current)}
                    >
                      撤销
                    </button>
                    <button
                      data-redo-draft
                      type="button"
                      disabled={editorUnavailable}
                      onClick={() => editor.current && redoWorldforgeEditor(editor.current)}
                    >
                      重做
                    </button>
                  </div>
                </details>
                <button
                  data-toggle-draft-find
                  type="button"
                  aria-expanded={findOpen}
                  onClick={() => setFindOpen((open) => !open)}
                >
                  {findOpen ? '收起查找' : '查找与替换'}
                </button>
                <details className="draft-more-actions" data-draft-more-actions>
                  <summary>更多操作</summary>
                  <div className="inline-actions">
                    <button
                      data-save-draft
                      type="button"
                      disabled={editorUnavailable}
                      onClick={() => void manualSave()}
                    >
                      立即保存
                    </button>
                    <button
                      type="button"
                      disabled={!draft}
                      onClick={() =>
                        void navigator.clipboard.writeText(
                          editor.current?.getText({ blockSeparator: '\n\n' }) ??
                            draft?.blocks.map((block) => block.text).join('\n\n') ??
                            '',
                        )
                      }
                    >
                      复制正文
                    </button>
                  </div>
                </details>
              </div>

              {findOpen ? (
                <FindReplaceToolbar
                  findText={findText}
                  replaceText={replaceText}
                  findIndex={findIndex}
                  findCount={findCount}
                  readOnly={readOnly}
                  isComposing={isComposing}
                  onFindTextChange={(value) => {
                    setFindText(value);
                    setFindIndex(0);
                  }}
                  onReplaceTextChange={setReplaceText}
                  onSelectMatch={selectMatch}
                  onReplaceMatches={replaceMatches}
                />
              ) : null}

              {chapter ? (
                <div
                  className="draft-editor-host"
                  data-draft-editor-host
                  ref={editorHost}
                  onCompositionStart={() => {
                    composing.current = true;
                    setIsComposing(true);
                    autosave.current?.pause();
                    setStatus('输入法组合中；保存与结构键已暂停。');
                  }}
                  onCompositionEnd={() => {
                    composing.current = false;
                    setIsComposing(false);
                    autosave.current?.resume();
                    autosave.current?.markDirty();
                  }}
                />
              ) : (
                <section className="feature-card writing-empty">
                  <h2>选择章节开始写作</h2>
                  <p>正文编辑器只在章节打开后创建，切章前会强制完成自动保存。</p>
                </section>
              )}

              <footer className="draft-statusbar" aria-label="写作状态">
                <div className="draft-metrics" aria-label="正文统计">
                  <span>
                    字数 <strong data-draft-text-count>{statistics.textCount}</strong>
                  </span>
                  <span>
                    字符 <strong data-draft-character-count>{statistics.characterCount}</strong>
                  </span>
                  <span>
                    段落 <strong data-draft-paragraph-count>{statistics.paragraphCount}</strong>
                  </span>
                  <span>
                    {statistics.progressPercent === null
                      ? '未设置目标'
                      : `目标进度 ${statistics.progressPercent}%`}
                  </span>
                </div>
                <p
                  className={editorFailure ? 'draft-state is-error' : 'draft-state'}
                  data-draft-state
                  role="status"
                  aria-live="polite"
                >
                  {editorState}
                </p>
              </footer>
            </>
          ) : null}

          {panel === 'versions' && chapter && draft ? (
            <VersionPanel
              bridge={bridge}
              chapter={chapter}
              draft={draft}
              project={project}
              navigationVersionId={navigationVersionId ?? null}
              flush={flush}
              onClose={() => onPanelChange('editor')}
              onDraftReplace={replaceDraft}
            />
          ) : null}

          {panel === 'candidates' && chapter && draft ? (
            <CandidateReviewPanel
              bridge={bridge}
              chapter={chapter}
              draft={draft}
              project={project}
              flush={flush}
              onDraftReplace={replaceDraft}
              onClose={() => onPanelChange('editor')}
              getRewriteSelectionAnchor={() => {
                const instance = editor.current;
                return instance
                  ? captureRewriteSelectionAnchor(instance, project.projectId, chapter, draft)
                  : Promise.resolve(null);
              }}
            />
          ) : null}
        </main>

        {contextVisible && !focusMode && chapter ? (
          <WritingAssistancePanel
            bridge={bridge}
            projectId={project.projectId}
            chapterId={chapter.id}
            savedRevision={draft?.revision ?? null}
            readOnly={readOnly}
            onNavigate={onNavigate}
            onOpenAssistant={() => onPanelChange('candidates')}
          />
        ) : null}
      </div>
    </section>
  );
}
