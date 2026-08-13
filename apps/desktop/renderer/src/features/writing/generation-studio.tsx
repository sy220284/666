import type {
  CandidateSummary,
  GenerationIntent,
  GenerationRun,
  ProviderSummary,
  SceneBeat,
} from '@worldforge/contracts';

import { candidateTypeLabel } from './review-diff.js';

export type GenerationMode = 'skeleton' | 'chapter' | 'rewrite' | 'merge';
export type ChapterGenerationSource =
  'direct_chapter_goal' | 'skeleton_candidate' | 'canonical_scene_beats';
export type MergeMappingMode = 'beat' | 'segment';

interface GenerationStudioProps {
  readonly activeRun: GenerationRun | null;
  readonly acknowledgeStaleSkeleton: boolean;
  readonly candidateCount: number;
  readonly chapterGoal: string;
  readonly chapterSource: ChapterGenerationSource;
  readonly generationInstruction: string;
  readonly generationMode: GenerationMode;
  readonly generationStatus: string;
  readonly lastGenerationIntent: GenerationIntent | null;
  readonly mergeBeatSources: Readonly<Record<string, string>>;
  readonly mergeCandidateIds: ReadonlySet<string>;
  readonly mergeMappingMode: MergeMappingMode;
  readonly pending: boolean;
  readonly proseCandidates: readonly CandidateSummary[];
  readonly providers: readonly ProviderSummary[];
  readonly providerId: string;
  readonly readOnly: boolean;
  readonly sceneBeats: readonly SceneBeat[];
  readonly selectedSkeletonId: string;
  readonly skeletonCandidates: readonly Extract<CandidateSummary, { candidateType: 'skeleton' }>[];
  readonly targetCharacters: number;
  readonly tendency: string;
  readonly onAcknowledgeStaleSkeletonChange: (value: boolean) => void;
  readonly onCancelGeneration: () => void;
  readonly onCandidateCountChange: (value: number) => void;
  readonly onChapterGoalChange: (value: string) => void;
  readonly onChapterSourceChange: (value: ChapterGenerationSource) => void;
  readonly onDecidePartial: (decision: 'save' | 'discard') => void;
  readonly onGenerationInstructionChange: (value: string) => void;
  readonly onGenerationModeChange: (value: GenerationMode) => void;
  readonly onMergeBeatSourceChange: (beatId: string, source: string) => void;
  readonly onMergeCandidateChange: (candidateId: string, included: boolean) => void;
  readonly onMergeMappingModeChange: (value: MergeMappingMode) => void;
  readonly onProviderIdChange: (value: string) => void;
  readonly onRetryRewrite: () => void;
  readonly onSelectedSkeletonChange: (value: string) => void;
  readonly onStartGeneration: () => void;
  readonly onTargetCharactersChange: (value: number) => void;
  readonly onTendencyChange: (value: string) => void;
}

export function GenerationStudio(props: GenerationStudioProps) {
  const {
    activeRun,
    acknowledgeStaleSkeleton,
    candidateCount,
    chapterGoal,
    chapterSource,
    generationInstruction,
    generationMode,
    generationStatus,
    lastGenerationIntent,
    mergeBeatSources,
    mergeCandidateIds,
    mergeMappingMode,
    pending,
    proseCandidates,
    providers,
    providerId,
    readOnly,
    sceneBeats,
    selectedSkeletonId,
    skeletonCandidates,
    targetCharacters,
    tendency,
  } = props;

  return (
    <section className="generation-studio" data-generation-studio>
      <header>
        <div>
          <h3>生成任务</h3>
          <p>进度来自已保存的生成记录与任务状态，不使用模拟百分比。</p>
        </div>
        <span
          className="generation-run-state"
          data-generation-run-status
          data-status={activeRun?.status ?? 'idle'}
        >
          {generationStatus}
        </span>
      </header>
      <div className="generation-grid">
        <label>
          任务
          <select
            data-generation-mode
            value={generationMode}
            onChange={(event) => props.onGenerationModeChange(event.target.value as GenerationMode)}
          >
            <option value="skeleton">生成章节骨架</option>
            <option value="chapter">生成正文</option>
            <option value="rewrite">快速改写</option>
            <option value="merge">融合建议稿</option>
          </select>
        </label>
        <label>
          智能连接
          <select
            data-generation-provider
            value={providerId}
            onChange={(event) => props.onProviderIdChange(event.target.value)}
          >
            <option value="">请选择</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name} · {provider.model}
              </option>
            ))}
          </select>
        </label>
        {generationMode === 'chapter' ? (
          <label>
            正文来源
            <select
              data-chapter-generation-source
              value={chapterSource}
              onChange={(event) =>
                props.onChapterSourceChange(event.target.value as ChapterGenerationSource)
              }
            >
              <option value="direct_chapter_goal">直接使用本章目标</option>
              <option value="skeleton_candidate">已选章节骨架</option>
              <option value="canonical_scene_beats">已确认场景</option>
            </select>
          </label>
        ) : null}
        {generationMode === 'skeleton' ? (
          <>
            <label>
              候选数
              <input
                data-skeleton-candidate-count
                type="number"
                min={1}
                max={5}
                value={candidateCount}
                onChange={(event) =>
                  props.onCandidateCountChange(
                    Math.max(1, Math.min(5, Number(event.target.value) || 1)),
                  )
                }
              />
            </label>
            <label>
              叙事倾向
              <input
                data-skeleton-tendency
                value={tendency}
                onChange={(event) => props.onTendencyChange(event.target.value)}
              />
            </label>
          </>
        ) : null}
        {generationMode === 'chapter' && chapterSource === 'skeleton_candidate' ? (
          <label>
            章节骨架
            <select
              data-selected-skeleton
              value={selectedSkeletonId}
              onChange={(event) => props.onSelectedSkeletonChange(event.target.value)}
            >
              <option value="">请选择</option>
              {skeletonCandidates.map((candidate) => (
                <option key={candidate.candidateId} value={candidate.candidateId}>
                  {candidate.title} · 修订 {candidate.skeletonRevision}
                  {candidate.sourceState === 'stale' ? ' · 来源已变化' : ''}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {generationMode === 'chapter' ? (
          <label>
            目标字数
            <input
              data-generation-target-characters
              type="number"
              min={100}
              max={200_000}
              step={100}
              value={targetCharacters}
              onChange={(event) =>
                props.onTargetCharactersChange(
                  Math.max(100, Math.min(200_000, Number(event.target.value) || 100)),
                )
              }
            />
          </label>
        ) : null}
      </div>
      {(generationMode === 'skeleton' ||
        (generationMode === 'chapter' && chapterSource === 'direct_chapter_goal')) && (
        <label className="generation-wide-field">
          本章目标
          <textarea
            data-generation-chapter-goal
            rows={3}
            value={chapterGoal}
            onChange={(event) => props.onChapterGoalChange(event.target.value)}
            placeholder="描述这一章必须推进的事件、冲突与结果。"
          />
        </label>
      )}
      {generationMode === 'rewrite' ||
      generationMode === 'merge' ||
      generationMode === 'chapter' ? (
        <label className="generation-wide-field">
          {generationMode === 'rewrite'
            ? '改写指令'
            : generationMode === 'merge'
              ? '融合偏好（可选）'
              : '风格补充（可选）'}
          <textarea
            data-generation-instruction
            rows={2}
            value={generationInstruction}
            onChange={(event) => props.onGenerationInstructionChange(event.target.value)}
            placeholder={
              generationMode === 'rewrite'
                ? '优先改写编辑器中的单个正文段落选区；没有选区时改写全部未锁定正文段落。'
                : '只填写本次任务需要的额外要求。'
            }
          />
        </label>
      ) : null}
      {generationMode === 'chapter' &&
      chapterSource === 'skeleton_candidate' &&
      skeletonCandidates.some(
        (candidate) =>
          candidate.candidateId === selectedSkeletonId && candidate.sourceState === 'stale',
      ) ? (
        <label className="safety-inline generation-acknowledgement">
          <input
            type="checkbox"
            checked={acknowledgeStaleSkeleton}
            onChange={(event) => props.onAcknowledgeStaleSkeletonChange(event.target.checked)}
          />
          我已知晓已确认场景或基础稿已变化，仍使用此章节骨架生成正文
        </label>
      ) : null}
      {generationMode === 'merge' ? (
        <fieldset className="candidate-choice-list" data-merge-candidate-picker>
          <legend>融合来源映射</legend>
          {sceneBeats.length ? (
            <label>
              映射方式
              <select
                data-merge-mapping-mode
                value={mergeMappingMode}
                onChange={(event) =>
                  props.onMergeMappingModeChange(event.target.value as MergeMappingMode)
                }
              >
                <option value="beat">按已确认场景</option>
                <option value="segment">按建议稿片段</option>
              </select>
            </label>
          ) : null}
          {mergeMappingMode === 'beat' && sceneBeats.length ? (
            sceneBeats.map((beat) => (
              <label key={beat.id}>
                {beat.title}
                <select
                  value={mergeBeatSources[beat.id] ?? ''}
                  onChange={(event) => props.onMergeBeatSourceChange(beat.id, event.target.value)}
                >
                  <option value="">不参与本次融合</option>
                  <option value="current_draft">保留当前稿</option>
                  {proseCandidates.map((candidate) => (
                    <option key={candidate.candidateId} value={candidate.candidateId}>
                      {candidate.title} · {candidateTypeLabel(candidate.candidateType)}
                    </option>
                  ))}
                </select>
              </label>
            ))
          ) : (
            <>
              <p>选择至少两个正文建议稿；建议稿没有关联场景时使用此模式。</p>
              {proseCandidates.map((candidate) => (
                <label key={candidate.candidateId}>
                  <input
                    type="checkbox"
                    checked={mergeCandidateIds.has(candidate.candidateId)}
                    onChange={(event) =>
                      props.onMergeCandidateChange(candidate.candidateId, event.target.checked)
                    }
                  />
                  {candidate.title} · {candidateTypeLabel(candidate.candidateType)} ·{' '}
                  {candidate.completeness}
                </label>
              ))}
            </>
          )}
        </fieldset>
      ) : null}
      {generationMode === 'rewrite' ? (
        <p className="feature-status">
          选择同一正文段落内的文字可精确改写；跨段落、空选区或锁定段落不会作为选区来源。
        </p>
      ) : null}
      <div className="inline-actions">
        <button
          className="primary-button"
          data-start-generation
          type="button"
          disabled={
            pending ||
            readOnly ||
            !providerId ||
            activeRun?.status === 'queued' ||
            activeRun?.status === 'running'
          }
          onClick={props.onStartGeneration}
        >
          开始生成
        </button>
        <button
          data-cancel-generation
          type="button"
          disabled={!activeRun || (activeRun.status !== 'queued' && activeRun.status !== 'running')}
          onClick={props.onCancelGeneration}
        >
          取消生成
        </button>
        {activeRun?.partialStatus === 'available' ? (
          <>
            <button
              type="button"
              data-save-partial-candidate
              onClick={() => props.onDecidePartial('save')}
            >
              保存部分结果
            </button>
            <button
              type="button"
              data-discard-partial-candidate
              onClick={() => props.onDecidePartial('discard')}
            >
              丢弃部分结果
            </button>
          </>
        ) : null}
        {lastGenerationIntent?.runType === 'rewrite' &&
        activeRun?.runType === 'rewrite' &&
        activeRun.status !== 'queued' &&
        activeRun.status !== 'running' ? (
          <button
            data-retry-rewrite
            type="button"
            disabled={pending || readOnly || !providerId}
            onClick={props.onRetryRewrite}
          >
            换一个
          </button>
        ) : null}
      </div>
      {activeRun ? (
        <dl className="generation-provenance" data-active-generation-run>
          <div>
            <dt>生成记录</dt>
            <dd>{activeRun.runId}</dd>
          </div>
          <div>
            <dt>生成指令版本</dt>
            <dd>
              {activeRun.promptId} · 第 {activeRun.promptVersion} 版
            </dd>
          </div>
          <div>
            <dt>模型</dt>
            <dd>{activeRun.actualModel}</dd>
          </div>
          <div>
            <dt>兼容状态</dt>
            <dd>{activeRun.supportStatus}</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
