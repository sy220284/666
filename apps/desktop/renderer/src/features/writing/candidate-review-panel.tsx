import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  CandidateConflictItem,
  CandidateDocument,
  CandidatePreview,
  CandidateSummary,
  CandidateUndoPreview,
  Chapter,
  DraftDocument,
  GenerationIntent,
  GenerationRun,
  ProjectWorkspaceSummary,
  RewriteSelectionAnchor,
  VersionDocument,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { rendererCommandCoordinatorFor } from '../../runtime/command-coordinator.js';
import type { AppDisclosureMode } from '../../shell/app-shell-model.js';
import { refreshCandidateGenerationRun } from './candidate-generation-refresh.js';
import { CandidateReviewDisplay } from './candidate-review-display.js';
import {
  buildCandidateSelection,
  candidateReviewCollections,
  toggleSelectionSet,
  type CandidateSelectionMode,
} from './candidate-selection.js';
import {
  applyCandidate,
  cancelCandidatePreview,
  discardCandidate,
  saveSkeletonCandidate,
  undoCandidate,
  type CandidateActionContext,
} from './candidate-preview-actions.js';
import {
  loadCandidateDocument,
  loadCandidateList,
  loadCandidateUndo,
  type CandidateReviewLoader,
} from './candidate-review-loader.js';
import {
  GenerationStudio,
  type ChapterGenerationSource,
  type GenerationMode,
} from './generation-studio.js';
import { startGenerationTask } from './generation-start.js';
import { useGenerationTaskSubscription } from './generation-task-subscription.js';
import { useGenerationSources } from './use-generation-sources.js';
import { useGenerationRunActions } from './use-generation-run-actions.js';

export function CandidateReviewPanel({
  bridge,
  chapter,
  disclosureMode = 'professional',
  draft,
  project,
  flush,
  onDraftReplace,
  onClose,
  getRewriteSelectionAnchor,
  initialGenerationMode,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly chapter: Chapter;
  readonly disclosureMode?: AppDisclosureMode;
  readonly draft: DraftDocument;
  readonly project: ProjectWorkspaceSummary;
  readonly flush: () => Promise<boolean>;
  readonly onDraftReplace: (draft: DraftDocument, message: string) => void;
  readonly onClose: () => void;
  readonly getRewriteSelectionAnchor: () => Promise<RewriteSelectionAnchor | null>;
  readonly initialGenerationMode?: string | null;
}) {
  const readOnly = project.databaseMode !== 'read-write';
  const [candidates, setCandidates] = useState<readonly CandidateSummary[]>([]);
  const [candidateId, setCandidateId] = useState('');
  const [preview, setPreview] = useState<CandidatePreview | null>(null);
  const [undoPreview, setUndoPreview] = useState<CandidateUndoPreview | null>(null);
  const [selectionMode, setSelectionMode] = useState<CandidateSelectionMode>('all');
  const [selectedBlocks, setSelectedBlocks] = useState<Set<string>>(new Set());
  const [selectedBeats, setSelectedBeats] = useState<Set<string>>(new Set());
  const [conflicts, setConflicts] = useState<readonly CandidateConflictItem[]>([]);
  const [status, setStatus] = useState(
    disclosureMode === 'beginner'
      ? '预览只读取已保存的当前稿，不会写入作品数据库。'
      : `预览只读取已保存的当前稿（保存序号 ${draft.revision}），不会写入作品数据库。`,
  );
  const [pending, setPending] = useState(false);
  const documentRequest = useRef(0);
  const generationEpoch = useRef(0);
  const previewRequest = useRef<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<CandidateDocument | null>(null);
  const [baseVersion, setBaseVersion] = useState<VersionDocument | null>(null);
  const {
    providers,
    providerId,
    setProviderId,
    sceneBeats,
    mergeMappingMode,
    setMergeMappingMode,
  } = useGenerationSources(bridge, project.projectId, chapter.id);
  const [generationMode, setGenerationMode] = useState<GenerationMode>('chapter');
  useEffect(() => {
    if (
      initialGenerationMode === 'skeleton' ||
      initialGenerationMode === 'chapter' ||
      initialGenerationMode === 'rewrite'
    ) {
      setGenerationMode(initialGenerationMode);
    }
  }, [initialGenerationMode]);
  const [chapterSource, setChapterSource] =
    useState<ChapterGenerationSource>('direct_chapter_goal');
  const [chapterGoal, setChapterGoal] = useState('');
  const [tendency, setTendency] = useState('悬疑推进');
  const [generationInstruction, setGenerationInstruction] = useState('');
  const [targetCharacters, setTargetCharacters] = useState(3_000);
  const [candidateCount, setCandidateCount] = useState(3);
  const [selectedSkeletonId, setSelectedSkeletonId] = useState('');
  const [acknowledgeStaleSkeleton, setAcknowledgeStaleSkeleton] = useState(false);
  const [mergeCandidateIds, setMergeCandidateIds] = useState<Set<string>>(new Set());
  const [mergeBeatSources, setMergeBeatSources] = useState<Record<string, string>>({});
  const [activeRun, setActiveRun] = useState<GenerationRun | null>(null);
  const [selectedRun, setSelectedRun] = useState<GenerationRun | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] =
    useState('可按任务自动选择智能连接，也可手动指定。');
  const [skeletonEndingHook, setSkeletonEndingHook] = useState('');
  const [skeletonTendency, setSkeletonTendency] = useState('');
  const [lastGenerationIntent, setLastGenerationIntent] = useState<GenerationIntent | null>(null);
  const commandPrefix = useMemo(
    () => `writing:${project.projectId}:${chapter.id}:`,
    [chapter.id, project.projectId],
  );
  const commandCoordinator = useMemo(() => rendererCommandCoordinatorFor(setPending), [setPending]);

  const loader = useMemo<CandidateReviewLoader>(
    () => ({
      bridge,
      disclosureMode,
      projectId: project.projectId,
      chapterId: chapter.id,
      commandPrefix,
      documentRequest,
      previewRequest,
      setCandidates,
      setPreview,
      setUndoPreview,
      setSelectedDocument,
      setSelectedRun,
      setSelectionMode,
      setSelectedBlocks,
      setSelectedBeats,
      setSelectedSkeletonId,
      setSkeletonEndingHook,
      setSkeletonTendency,
      setConflicts,
      setStatus,
      setPending,
    }),
    [bridge, chapter.id, commandPrefix, disclosureMode, project.projectId],
  );
  const refreshList = useCallback(
    (canCommit?: () => boolean) => loadCandidateList(loader, canCommit),
    [loader],
  );
  const loadUndo = useCallback(
    (nextPreview: CandidatePreview, canCommit?: () => boolean) =>
      loadCandidateUndo(loader, nextPreview, canCommit),
    [loader],
  );
  const loadCandidate = useCallback(
    (nextCandidateId: string) => loadCandidateDocument(loader, nextCandidateId),
    [loader],
  );

  useEffect(() => {
    let active = true;
    const sourceVersionId = selectedDocument?.sourceVersionId ?? null;
    if (!sourceVersionId || selectedDocument?.candidateType === 'skeleton') {
      setBaseVersion(null);
      return () => {
        active = false;
      };
    }
    setBaseVersion(null);
    void bridge.version
      .get(
        { projectId: project.projectId, chapterId: chapter.id, versionId: sourceVersionId },
        { mode: 'replace' },
      )
      .then((outcome) => {
        if (!active) return;
        setBaseVersion(outcome.state === 'success' ? outcome.data : null);
      });
    return () => {
      active = false;
    };
  }, [bridge, chapter.id, project.projectId, selectedDocument]);

  useEffect(() => {
    let active = true;
    setCandidates([]);
    setCandidateId('');
    setPreview(null);
    setUndoPreview(null);
    setSelectedDocument(null);
    setBaseVersion(null);
    setSelectedRun(null);
    setSelectedBlocks(new Set());
    setSelectedBeats(new Set());
    setConflicts([]);
    setSelectedSkeletonId('');
    setSkeletonEndingHook('');
    setSkeletonTendency('');
    setAcknowledgeStaleSkeleton(false);
    setActiveRun(null);
    setActiveTaskId(null);
    setLastGenerationIntent(null);
    setStatus('正在读取当前章节建议稿…');
    setGenerationStatus('可按任务自动选择智能连接，也可手动指定。');
    void refreshList(() => active).then((items) => {
      if (!active) return;
      const first = items[0];
      if (!first) {
        setStatus('当前章节没有建议稿。');
        return;
      }
      setCandidateId(first.candidateId);
      void loadCandidate(first.candidateId);
    });
    return () => {
      active = false;
      commandCoordinator.invalidatePrefix(commandPrefix);
      generationEpoch.current += 1;
      documentRequest.current += 1;
      const requestId = previewRequest.current;
      previewRequest.current = null;
      if (requestId) void bridge.candidateAction.cancelPreview(requestId);
    };
  }, [bridge, commandCoordinator, commandPrefix, loadCandidate, refreshList]);

  const refreshActiveRun = useCallback(
    () =>
      refreshCandidateGenerationRun({
        activeRun,
        bridge,
        disclosureMode,
        projectId: project.projectId,
        loader,
        generationEpoch,
        loadCandidate,
        setActiveRun,
        setGenerationStatus,
        setCandidateId,
        setActiveTaskId,
      }),
    [activeRun, bridge, disclosureMode, loadCandidate, loader, project.projectId],
  );

  useGenerationTaskSubscription({
    activeTaskId,
    bridge,
    projectId: project.projectId,
    onStatus: setGenerationStatus,
    onTerminal: refreshActiveRun,
  });

  const selection = useMemo(
    () => buildCandidateSelection(preview, selectionMode, selectedBlocks, selectedBeats),
    [preview, selectedBeats, selectedBlocks, selectionMode],
  );

  const cancel = async (): Promise<void> => {
    const epoch = generationEpoch.current;
    if (
      (await cancelCandidatePreview(bridge, previewRequest.current)) &&
      generationEpoch.current === epoch
    )
      setStatus('正在取消差异计算…');
  };

  const actionContext = useMemo<CandidateActionContext>(
    () => ({
      bridge,
      disclosureMode,
      projectId: project.projectId,
      chapterId: chapter.id,
      commandPrefix,
      readOnly,
      refreshList,
      onDraftReplace,
      setPreview,
      setUndoPreview,
      setSelectedDocument,
      setSkeletonEndingHook,
      setSkeletonTendency,
      setConflicts,
      setStatus,
      setPending,
    }),
    [
      bridge,
      chapter.id,
      commandPrefix,
      disclosureMode,
      onDraftReplace,
      project.projectId,
      readOnly,
      refreshList,
    ],
  );
  const discard = () => discardCandidate(actionContext, selectedDocument);
  const apply = () => applyCandidate({ ...actionContext, flush, loadUndo }, preview, selection);
  const undo = () => undoCandidate(actionContext, undoPreview);

  const { skeletonCandidates, proseCandidates, reviewGroups } = useMemo(
    () => candidateReviewCollections(candidates),
    [candidates],
  );

  const startGeneration = async (
    continuationOfRunId: string | null = null,
    intentOverride: GenerationIntent | null = null,
  ): Promise<void> => {
    generationEpoch.current += 1;
    documentRequest.current += 1;
    setActiveTaskId(null);
    return startGenerationTask({
      bridge,
      projectId: project.projectId,
      chapterId: chapter.id,
      commandPrefix,
      draft,
      providerId,
      providers,
      readOnly,
      flush,
      generationMode,
      chapterSource,
      chapterGoal,
      tendency,
      generationInstruction,
      targetCharacters,
      candidateCount,
      sceneBeats,
      selectedSkeletonId,
      acknowledgeStaleSkeleton,
      mergeMappingMode,
      mergeCandidateIds,
      mergeBeatSources,
      getRewriteSelectionAnchor,
      continuationOfRunId,
      intentOverride,
      setPending,
      setStatus: setGenerationStatus,
      setLastIntent: setLastGenerationIntent,
      onStarted: (run, taskId) => {
        setActiveRun(run);
        setActiveTaskId(taskId);
      },
    });
  };

  const { cancelGeneration, decidePartial } = useGenerationRunActions({
    activeRun,
    bridge,
    projectId: project.projectId,
    commandPrefix,
    setPending,
    refreshCandidates: refreshList,
    setActiveRun,
    setStatus: setGenerationStatus,
  });

  const saveSkeletonEdit = () =>
    saveSkeletonCandidate(actionContext, selectedDocument, skeletonTendency, skeletonEndingHook);

  return (
    <section className="candidate-workbench" data-candidate-preview-dialog>
      <header className="feature-card__heading">
        <div>
          <h2>智能创作与建议稿工作台</h2>
          <p>生成只读取已保存的权威数据；骨架与正文候选使用独立的审阅、采用规则。</p>
        </div>
      </header>
      <GenerationStudio
        activeRun={activeRun}
        disclosureMode={disclosureMode}
        acknowledgeStaleSkeleton={acknowledgeStaleSkeleton}
        candidateCount={candidateCount}
        chapterGoal={chapterGoal}
        chapterSource={chapterSource}
        generationInstruction={generationInstruction}
        generationMode={generationMode}
        generationStatus={generationStatus}
        lastGenerationIntent={lastGenerationIntent}
        mergeBeatSources={mergeBeatSources}
        mergeCandidateIds={mergeCandidateIds}
        mergeMappingMode={mergeMappingMode}
        pending={pending}
        proseCandidates={proseCandidates}
        providerId={providerId}
        providers={providers}
        readOnly={readOnly}
        sceneBeats={sceneBeats}
        selectedSkeletonId={selectedSkeletonId}
        skeletonCandidates={skeletonCandidates}
        targetCharacters={targetCharacters}
        tendency={tendency}
        onAcknowledgeStaleSkeletonChange={setAcknowledgeStaleSkeleton}
        onCancelGeneration={() => void cancelGeneration()}
        onCandidateCountChange={setCandidateCount}
        onChapterGoalChange={setChapterGoal}
        onChapterSourceChange={setChapterSource}
        onDecidePartial={(decision) => void decidePartial(decision)}
        onGenerationInstructionChange={setGenerationInstruction}
        onGenerationModeChange={setGenerationMode}
        onMergeBeatSourceChange={(beatId, source) =>
          setMergeBeatSources((current) => ({ ...current, [beatId]: source }))
        }
        onMergeCandidateChange={(nextCandidateId, included) =>
          setMergeCandidateIds(toggleSelectionSet(mergeCandidateIds, nextCandidateId, included))
        }
        onMergeMappingModeChange={setMergeMappingMode}
        onProviderIdChange={setProviderId}
        onRetryRewrite={() =>
          lastGenerationIntent && void startGeneration(null, lastGenerationIntent)
        }
        onSelectedSkeletonChange={(nextCandidateId) => {
          setSelectedSkeletonId(nextCandidateId);
          setAcknowledgeStaleSkeleton(false);
        }}
        onStartGeneration={() => void startGeneration()}
        onTargetCharactersChange={setTargetCharacters}
        onTendencyChange={setTendency}
      />
      <CandidateReviewDisplay
        apply={apply}
        disclosureMode={disclosureMode}
        baseVersion={baseVersion}
        cancel={cancel}
        candidateId={candidateId}
        conflicts={conflicts}
        discard={discard}
        loadCandidate={loadCandidate}
        onClose={onClose}
        pending={pending}
        preview={preview}
        previewRequest={previewRequest}
        providers={providers}
        readOnly={readOnly}
        reviewGroups={reviewGroups}
        saveSkeletonEdit={saveSkeletonEdit}
        sceneBeats={sceneBeats}
        selectedBeats={selectedBeats}
        selectedBlocks={selectedBlocks}
        selectedDocument={selectedDocument}
        selectedRun={selectedRun}
        selection={selection}
        selectionMode={selectionMode}
        skeletonEndingHook={skeletonEndingHook}
        skeletonTendency={skeletonTendency}
        startGeneration={startGeneration}
        status={status}
        undo={undo}
        undoPreview={undoPreview}
        setAcknowledgeStaleSkeleton={setAcknowledgeStaleSkeleton}
        setCandidateId={setCandidateId}
        setChapterSource={setChapterSource}
        setGenerationMode={setGenerationMode}
        setSelectedBeats={setSelectedBeats}
        setSelectedBlocks={setSelectedBlocks}
        setSelectedSkeletonId={setSelectedSkeletonId}
        setSelectionMode={setSelectionMode}
        setSkeletonEndingHook={setSkeletonEndingHook}
        setSkeletonTendency={setSkeletonTendency}
      />
    </section>
  );
}
