import { useMemo, useRef, useState } from 'react';

import type {
  Chapter,
  DraftDocument,
  ProjectContinuationSnapshot,
  ProjectWorkspaceSummary,
} from '@worldforge/contracts';
import type { DraftAutosaveCoordinator, Editor } from '@worldforge/editor-core';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import type { AppDisclosureMode } from '../../shell/app-shell-model.js';
import type { AuthorNavigationTarget } from '../../shell/navigation-target.js';
import { useWritingContinuation } from './use-writing-continuation.js';
import { useWritingMetrics } from './use-writing-metrics.js';
import { useWritingSessionController } from './use-writing-session-controller.js';
import { useWritingStatus } from './use-writing-status.js';
import { WritingWorkbenchView } from './writing-workbench-view.js';
import type { WritingPanel } from './writing-workbench-types.js';

export type { WritingPanel } from './writing-workbench-types.js';

interface WritingWorkbenchProps {
  readonly bridge: RendererBridgeAdapter;
  readonly disclosureMode: AppDisclosureMode;
  readonly project: ProjectWorkspaceSummary;
  readonly initialContinuation: ProjectContinuationSnapshot | null;
  readonly panel: WritingPanel;
  readonly typewriterMode: boolean;
  readonly typewriterAnchorPercent: number;
  readonly onTypewriterModeChange: (enabled: boolean) => Promise<boolean>;
  readonly navigationChapterId?: string | null;
  readonly navigationLogicalBlockId?: string | null;
  readonly navigationVersionId?: string | null;
  readonly navigationQuery?: string | null;
  readonly navigationGenerationMode?: string | null;
  readonly onNavigate: (target: AuthorNavigationTarget) => void;
  readonly onPanelChange: (panel: WritingPanel) => void;
  readonly onStatus: (message: string) => void;
  readonly statusNotice?: string | null;
  readonly onStatusNoticeConsumed?: () => void;
}

export function WritingWorkbench({
  bridge,
  disclosureMode,
  project,
  initialContinuation,
  panel,
  typewriterMode,
  typewriterAnchorPercent,
  onTypewriterModeChange,
  navigationChapterId,
  navigationLogicalBlockId,
  navigationVersionId,
  navigationQuery,
  navigationGenerationMode,
  onNavigate,
  onPanelChange,
  onStatus,
  statusNotice,
  onStatusNoticeConsumed,
}: WritingWorkbenchProps) {
  const readOnly = project.databaseMode !== 'read-write';
  const editorHost = useRef<HTMLDivElement>(null);
  const editor = useRef<Editor | null>(null);
  const autosave = useRef<DraftAutosaveCoordinator | null>(null);
  const activeDraft = useRef<DraftDocument | null>(null);
  const activeChapter = useRef<Chapter | null>(null);
  const editorGeneration = useRef(0);
  const composing = useRef(false);
  const synchronizing = useRef(false);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [draft, setDraft] = useState<DraftDocument | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [findIndex, setFindIndex] = useState(0);
  const [findCount, setFindCount] = useState(0);
  const [editorReady, setEditorReady] = useState(false);
  const [outlineVisible, setOutlineVisible] = useState(true);
  const [contextVisible, setContextVisible] = useState(true);
  const [focusMode, setFocusMode] = useState(false);

  const statusInput = useMemo(
    () => ({
      panel,
      editorReady,
      editorHost,
      navigationLogicalBlockId,
      navigationQuery,
      statusNotice,
      onStatusNoticeConsumed,
      setFindText,
    }),
    [
      editorReady,
      navigationLogicalBlockId,
      navigationQuery,
      onStatusNoticeConsumed,
      panel,
      statusNotice,
    ],
  );
  const writingStatus = useWritingStatus(statusInput);
  const { setStatus } = writingStatus;
  const metrics = useWritingMetrics(editor, activeChapter);
  const { setSelectedLocked, refreshStatistics, clearStatistics, refreshLockState } = metrics;

  const continuationInput = useMemo(
    () => ({
      bridge,
      projectId: project.projectId,
      readOnly,
      panel,
      editorHost,
      editor,
      activeDraft,
      activeChapter,
    }),
    [bridge, panel, project.projectId, readOnly],
  );
  const {
    continuationTimer,
    continuationScrollCleanup,
    saveContinuation,
    scheduleContinuationSave,
  } = useWritingContinuation(continuationInput);

  const sessionControllerInput = useMemo(
    () => ({
      bridge,
      disclosureMode,
      projectId: project.projectId,
      readOnly,
      panel,
      initialContinuation,
      navigationChapterId,
      navigationLogicalBlockId,
      navigationVersionId,
      onStatus,
      chapter,
      draft,
      isComposing,
      findText,
      replaceText,
      findIndex,
      editorHost,
      editor,
      autosave,
      activeDraft,
      activeChapter,
      editorGeneration,
      composing,
      synchronizing,
      continuationTimer,
      continuationScrollCleanup,
      setDraft,
      setChapter,
      setSelectedLocked,
      setEditorReady,
      setIsComposing,
      setFindCount,
      setFindIndex,
      setFocusMode,
      clearStatistics,
      refreshStatistics,
      refreshLockState,
      saveContinuation,
      scheduleContinuationSave,
      setStatus,
    }),
    [
      bridge,
      chapter,
      clearStatistics,
      continuationScrollCleanup,
      continuationTimer,
      disclosureMode,
      draft,
      findIndex,
      findText,
      initialContinuation,
      isComposing,
      navigationChapterId,
      navigationLogicalBlockId,
      navigationVersionId,
      onStatus,
      panel,
      project.projectId,
      readOnly,
      refreshLockState,
      refreshStatistics,
      replaceText,
      saveContinuation,
      scheduleContinuationSave,
      setSelectedLocked,
      setStatus,
    ],
  );
  const { flush, editorTools, chapterSession, replaceDraft, backToProject, editorUnavailable } =
    useWritingSessionController(sessionControllerInput);

  return (
    <WritingWorkbenchView
      autosave={autosave}
      backToProject={backToProject}
      bridge={bridge}
      chapter={chapter}
      chapterSessionPhase={chapterSession.state.phase}
      composing={composing}
      contextVisible={contextVisible}
      disclosureMode={disclosureMode}
      draft={draft}
      editor={editor}
      editorHost={editorHost}
      editorReady={editorReady}
      editorUnavailable={editorUnavailable}
      findCount={findCount}
      findIndex={findIndex}
      findText={findText}
      flush={flush}
      focusMode={focusMode}
      isComposing={isComposing}
      editorTools={editorTools}
      navigationVersionId={navigationVersionId}
      navigationGenerationMode={navigationGenerationMode}
      onNavigate={onNavigate}
      onPanelChange={onPanelChange}
      onStatus={onStatus}
      openChapter={chapterSession.openChapter}
      outlineVisible={outlineVisible}
      panel={panel}
      project={project}
      readOnly={readOnly}
      typewriterMode={typewriterMode}
      typewriterAnchorPercent={typewriterAnchorPercent}
      onTypewriterModeChange={onTypewriterModeChange}
      replaceDraft={replaceDraft}
      replaceText={replaceText}
      setContextVisible={setContextVisible}
      setFindIndex={setFindIndex}
      setFindText={setFindText}
      setIsComposing={setIsComposing}
      setOutlineVisible={setOutlineVisible}
      setReplaceText={setReplaceText}
      metrics={metrics}
      writingStatus={writingStatus}
    />
  );
}
