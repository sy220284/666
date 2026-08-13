import type { MutableRefObject } from 'react';

import type {
  CandidateConflictItem,
  CandidateDocument,
  CandidatePreview,
  CandidateSelection,
  CandidateUndoPreview,
  GenerationRun,
  ProviderSummary,
  SceneBeat,
} from '@worldforge/contracts';

import { candidateConflictLabel } from './candidate-conflicts.js';
import { CandidateSkeletonReview } from './candidate-skeleton-review.js';
import { toggleSelectionSet, type CandidateSelectionMode } from './candidate-selection.js';
import type { ChapterGenerationSource, GenerationMode } from './generation-studio.js';
import { ReviewDiffPanel } from './review-diff-panel.js';
import {
  candidateCompletenessLabel,
  candidateStatusLabel,
  candidateTypeLabel,
  sceneBeatReviewLabel,
  type CandidateReviewGroup,
} from './review-diff.js';

interface CandidateReviewDisplayProps {
  readonly apply: () => Promise<void>;
  readonly cancel: () => Promise<void>;
  readonly candidateId: string;
  readonly conflicts: readonly CandidateConflictItem[];
  readonly discard: () => Promise<void>;
  readonly loadCandidate: (candidateId: string) => Promise<void>;
  readonly onClose: () => void;
  readonly pending: boolean;
  readonly preview: CandidatePreview | null;
  readonly previewRequest: MutableRefObject<string | null>;
  readonly providerId: string;
  readonly providers: readonly ProviderSummary[];
  readonly readOnly: boolean;
  readonly reviewGroups: readonly CandidateReviewGroup[];
  readonly saveSkeletonEdit: () => Promise<void>;
  readonly sceneBeats: readonly SceneBeat[];
  readonly selectedBeats: Set<string>;
  readonly selectedBlocks: Set<string>;
  readonly selectedDocument: CandidateDocument | null;
  readonly selectedRun: GenerationRun | null;
  readonly selection: CandidateSelection | null;
  readonly selectionMode: CandidateSelectionMode;
  readonly skeletonEndingHook: string;
  readonly skeletonTendency: string;
  readonly startGeneration: (continuationOfRunId?: string | null) => Promise<void>;
  readonly status: string;
  readonly undo: () => Promise<void>;
  readonly undoPreview: CandidateUndoPreview | null;
  readonly setAcknowledgeStaleSkeleton: (value: boolean) => void;
  readonly setCandidateId: (value: string) => void;
  readonly setChapterSource: (value: ChapterGenerationSource) => void;
  readonly setGenerationMode: (value: GenerationMode) => void;
  readonly setSelectedBeats: (value: Set<string>) => void;
  readonly setSelectedBlocks: (value: Set<string>) => void;
  readonly setSelectedSkeletonId: (value: string) => void;
  readonly setSelectionMode: (value: CandidateSelectionMode) => void;
  readonly setSkeletonEndingHook: (value: string) => void;
  readonly setSkeletonTendency: (value: string) => void;
}

export function CandidateReviewDisplay(props: CandidateReviewDisplayProps) {
  const {
    apply,
    cancel,
    candidateId,
    conflicts,
    discard,
    loadCandidate,
    onClose,
    pending,
    preview,
    previewRequest,
    providerId,
    providers,
    readOnly,
    reviewGroups,
    saveSkeletonEdit,
    sceneBeats,
    selectedBeats,
    selectedBlocks,
    selectedDocument,
    selectedRun,
    selection,
    selectionMode,
    skeletonEndingHook,
    skeletonTendency,
    startGeneration,
    status,
    undo,
    undoPreview,
    setAcknowledgeStaleSkeleton,
    setCandidateId,
    setChapterSource,
    setGenerationMode,
    setSelectedBeats,
    setSelectedBlocks,
    setSelectedSkeletonId,
    setSelectionMode,
    setSkeletonEndingHook,
    setSkeletonTendency,
  } = props;

  return (
    <>
      <div className="filter-bar">
        <select
          aria-label="选择建议稿"
          data-candidate-preview-select
          value={candidateId}
          onChange={(event) => {
            setCandidateId(event.target.value);
            void loadCandidate(event.target.value);
          }}
        >
          {reviewGroups.map((group) => (
            <optgroup key={group.id} label={group.label}>
              {group.candidates.map((candidate) => (
                <option
                  data-status={candidate.status}
                  key={candidate.candidateId}
                  value={candidate.candidateId}
                >
                  {candidate.title} · {candidateTypeLabel(candidate.candidateType)} ·{' '}
                  {candidateCompletenessLabel(candidate.completeness)} ·{' '}
                  {candidateStatusLabel(candidate.status)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          data-cancel-candidate-preview
          type="button"
          disabled={!previewRequest.current}
          onClick={() => void cancel()}
        >
          取消计算
        </button>
        <button
          data-discard-candidate
          type="button"
          disabled={readOnly || !selectedDocument || selectedDocument.status !== 'pending'}
          onClick={() => void discard()}
        >
          丢弃建议稿
        </button>
      </div>
      <p
        className="feature-status"
        data-candidate-preview-status
        data-candidate-apply-status
        role="status"
      >
        {status}
      </p>
      {selectedRun ? (
        <dl className="generation-provenance" data-selected-candidate-provenance>
          <div>
            <dt>来源任务</dt>
            <dd>{selectedRun.runId}</dd>
          </div>
          <div>
            <dt>智能连接 / 模型</dt>
            <dd>
              {providers.find((provider) => provider.id === selectedRun.providerId)?.name ??
                selectedRun.providerId}{' '}
              / {selectedRun.actualModel}
            </dd>
          </div>
          <div>
            <dt>生成指令版本</dt>
            <dd>
              {selectedRun.promptId} · 第 {selectedRun.promptVersion} 版
            </dd>
          </div>
          <div>
            <dt>输出方式</dt>
            <dd>
              {generationOutputModeLabel(selectedRun.outputMode)} ·{' '}
              {generationSupportLabel(selectedRun.supportStatus)}
            </dd>
          </div>
        </dl>
      ) : null}
      {selectedDocument?.candidateType === 'skeleton' ? (
        <CandidateSkeletonReview
          candidate={selectedDocument}
          discard={discard}
          endingHook={skeletonEndingHook}
          readOnly={readOnly}
          save={saveSkeletonEdit}
          setAcknowledgeStaleSkeleton={setAcknowledgeStaleSkeleton}
          setChapterSource={setChapterSource}
          setEndingHook={setSkeletonEndingHook}
          setGenerationMode={setGenerationMode}
          setSelectedSkeletonId={setSelectedSkeletonId}
          setTendency={setSkeletonTendency}
          tendency={skeletonTendency}
        />
      ) : null}
      {preview?.candidate.completeness === 'partial' ? (
        <div className="safety-inline partial-candidate-actions" data-candidate-preview-warning>
          <span>不完整建议稿只能按正文段落或场景采用，不能整稿替换。</span>
          {preview.candidate.generationRunId ? (
            <button
              data-continue-partial-candidate
              type="button"
              disabled={pending || readOnly || !providerId}
              onClick={() => void startGeneration(preview.candidate.generationRunId)}
            >
              继续生成
            </button>
          ) : null}
          <button type="button" onClick={onClose}>
            返回编辑器手动补全
          </button>
        </div>
      ) : null}
      {preview ? (
        <>
          <div className="candidate-summary">
            <span>结构差异 {preview.structure.length}</span>
            <span>字符差异块 {preview.characterDiffs.length}</span>
            <span>{preview.execution.chapterCharacters}字符</span>
          </div>
          <ReviewDiffPanel
            comparisonText={preview.candidate.blocks.map((block) => block.text).join('\n\n')}
            comparisonTitle={preview.candidate.title}
            currentText={preview.draft.blocks.map((block) => block.text).join('\n\n')}
            currentTitle="当前已保存稿"
            marker="candidate"
          />
          <div className="candidate-apply-panel" data-candidate-apply-panel>
            <label>
              采用范围
              <select
                data-candidate-apply-mode
                value={selectionMode}
                onChange={(event) => setSelectionMode(event.target.value as typeof selectionMode)}
              >
                <option value="all" disabled={preview.candidate.completeness === 'partial'}>
                  整稿
                </option>
                <option value="blocks">按正文段落</option>
                <option value="scene-beats">按场景</option>
              </select>
            </label>
            {selectionMode === 'blocks' ? (
              <div className="candidate-choice-list">
                {preview.candidate.blocks.map((block, index) => (
                  <label key={block.candidateBlockId}>
                    <input
                      type="checkbox"
                      checked={selectedBlocks.has(block.candidateBlockId)}
                      onChange={(event) =>
                        setSelectedBlocks(
                          toggleSelectionSet(
                            selectedBlocks,
                            block.candidateBlockId,
                            event.target.checked,
                          ),
                        )
                      }
                    />
                    正文段落 {index + 1} · {block.text.slice(0, 80)}
                  </label>
                ))}
              </div>
            ) : null}
            {selectionMode === 'scene-beats' ? (
              <div className="candidate-choice-list">
                {[
                  ...new Set(
                    preview.candidate.blocks.flatMap((block) =>
                      block.beatId ? [block.beatId] : [],
                    ),
                  ),
                ].map((beatId) => (
                  <label key={beatId}>
                    <input
                      type="checkbox"
                      checked={selectedBeats.has(beatId)}
                      onChange={(event) =>
                        setSelectedBeats(
                          toggleSelectionSet(selectedBeats, beatId, event.target.checked),
                        )
                      }
                    />
                    {sceneBeatReviewLabel(sceneBeats, beatId)}
                  </label>
                ))}
              </div>
            ) : null}
            <div className="inline-actions">
              <button
                className="primary-button"
                data-apply-candidate
                disabled={
                  !selection || pending || readOnly || preview.candidate.status !== 'pending'
                }
                type="button"
                onClick={() => void apply()}
              >
                采用所选内容
              </button>
              <button
                data-undo-candidate-apply
                disabled={!undoPreview?.canUndo || readOnly}
                type="button"
                onClick={() => void undo()}
              >
                撤销本次应用
              </button>
            </div>
          </div>
        </>
      ) : null}
      {conflicts.length ? (
        <ul className="candidate-conflicts" data-candidate-conflict-list aria-label="候选内容冲突">
          {conflicts.map((conflict, index) => (
            <li key={`${conflict.kind}-${index}`}>
              {candidateConflictLabel(conflict.kind)}
              <details>
                <summary>技术详情</summary>
                <p>
                  {conflict.kind} · {conflict.message}
                </p>
              </details>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function generationOutputModeLabel(mode: string): string {
  const labels: Readonly<Record<string, string>> = {
    structured: '结构化结果',
    text: '文本结果',
    stream: '逐步生成',
    streaming: '逐步生成',
  };
  return labels[mode] ?? '已记录';
}

function generationSupportLabel(status: string): string {
  const labels: Readonly<Record<string, string>> = {
    supported: '完全支持',
    partial: '部分支持',
    degraded: '兼容模式',
    unsupported: '不支持',
  };
  return labels[status] ?? '兼容状态已记录';
}
