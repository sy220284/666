import type { CandidateDocument } from '@worldforge/contracts';

import type { ChapterGenerationSource, GenerationMode } from './generation-studio.js';

type SkeletonCandidate = Extract<CandidateDocument, { candidateType: 'skeleton' }>;

interface CandidateSkeletonReviewProps {
  readonly candidate: SkeletonCandidate;
  readonly readOnly: boolean;
  readonly tendency: string;
  readonly endingHook: string;
  readonly save: () => Promise<void>;
  readonly discard: () => Promise<void>;
  readonly setAcknowledgeStaleSkeleton: (value: boolean) => void;
  readonly setChapterSource: (value: ChapterGenerationSource) => void;
  readonly setGenerationMode: (value: GenerationMode) => void;
  readonly setSelectedSkeletonId: (value: string) => void;
  readonly setEndingHook: (value: string) => void;
  readonly setTendency: (value: string) => void;
}

export function CandidateSkeletonReview({
  candidate,
  readOnly,
  tendency,
  endingHook,
  save,
  discard,
  setAcknowledgeStaleSkeleton,
  setChapterSource,
  setGenerationMode,
  setSelectedSkeletonId,
  setEndingHook,
  setTendency,
}: CandidateSkeletonReviewProps) {
  return (
    <section className="skeleton-review" data-skeleton-review>
      <header>
        <div>
          <h3>{candidate.title}</h3>
          <p>
            修订 {candidate.skeletonRevision} ·{' '}
            {candidate.editedBy === 'author' ? '作者修订' : 'AI 初稿'} · 来源
            {candidate.sourceState === 'stale' ? '已变化' : '有效'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setGenerationMode('chapter');
            setChapterSource('skeleton_candidate');
            setSelectedSkeletonId(candidate.candidateId);
            setAcknowledgeStaleSkeleton(false);
          }}
        >
          用于生成正文
        </button>
      </header>
      <div className="generation-grid">
        <label>
          叙事倾向
          <input
            data-edit-skeleton-tendency
            value={tendency}
            onChange={(event) => setTendency(event.target.value)}
          />
        </label>
        <label>
          收尾钩子
          <textarea
            data-edit-skeleton-ending-hook
            rows={3}
            value={endingHook}
            onChange={(event) => setEndingHook(event.target.value)}
          />
        </label>
      </div>
      <ol className="skeleton-beat-list">
        {[...candidate.structuredPayload.beats]
          .sort((left, right) => left.order - right.order)
          .map((beat) => (
            <li key={beat.beatId}>
              <strong>
                {beat.order}. {beat.event}
              </strong>
              <span>因：{beat.cause}</span>
              <span>果：{beat.consequence}</span>
            </li>
          ))}
      </ol>
      {candidate.structuredPayload.risks.length ? (
        <ul className="candidate-conflicts">
          {candidate.structuredPayload.risks.map((risk) => (
            <li key={risk}>{risk}</li>
          ))}
        </ul>
      ) : null}
      <div className="inline-actions">
        <button
          className="primary-button"
          data-save-skeleton-revision
          type="button"
          disabled={readOnly || !tendency.trim() || !endingHook.trim()}
          onClick={() => void save()}
        >
          保存作者修订
        </button>
        <button
          data-discard-candidate
          type="button"
          disabled={candidate.status !== 'pending'}
          onClick={() => void discard()}
        >
          丢弃骨架
        </button>
      </div>
      <p className="safety-inline">
        情节骨架不会直接进入正文差异、采用、历史版本或定稿；请先用它生成正文建议稿。
      </p>
    </section>
  );
}
