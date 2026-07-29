import { useEffect, useMemo, useRef, useState } from 'react';

import {
  changedReviewLineIndexes,
  createReviewDiff,
  type ReviewInlineSegment,
} from './review-diff.js';

interface ReviewDiffPanelProps {
  readonly currentTitle: string;
  readonly comparisonTitle: string;
  readonly currentText: string;
  readonly comparisonText: string;
  readonly emptyMessage?: string;
  readonly marker: 'version' | 'candidate';
}

export function ReviewDiffPanel({
  currentTitle,
  comparisonTitle,
  currentText,
  comparisonText,
  emptyMessage = '选择内容后查看差异。',
  marker,
}: ReviewDiffPanelProps) {
  const [changedOnly, setChangedOnly] = useState(false);
  const [activeChange, setActiveChange] = useState(0);
  const lineRefs = useRef(new Map<number, HTMLDivElement>());
  const diff = useMemo(
    () => createReviewDiff(currentText, comparisonText),
    [comparisonText, currentText],
  );
  const changedIndexes = useMemo(() => changedReviewLineIndexes(diff), [diff]);
  const visible = useMemo(
    () => diff.map((line, index) => ({ line, index })).filter(({ line }) => !changedOnly || line.kind !== 'unchanged'),
    [changedOnly, diff],
  );

  useEffect(() => {
    setActiveChange((current) => Math.min(current, Math.max(0, changedIndexes.length - 1)));
  }, [changedIndexes.length]);

  const move = (direction: 1 | -1): void => {
    if (changedIndexes.length === 0) return;
    const next = (activeChange + direction + changedIndexes.length) % changedIndexes.length;
    setActiveChange(next);
    lineRefs.current.get(changedIndexes[next]!)?.scrollIntoView({ block: 'center' });
  };

  if (!comparisonText && diff.length === 0) {
    return <p className="feature-status">{emptyMessage}</p>;
  }

  const activeLineIndex = changedIndexes[activeChange] ?? null;
  return (
    <section className="review-diff" data-review-diff={marker}>
      <header className="review-diff__toolbar">
        <div>
          <strong>差异审阅</strong>
          <span>
            {changedIndexes.length}处修改 · {diff.length}行
          </span>
        </div>
        <div className="inline-actions">
          <label>
            <input
              checked={changedOnly}
              data-review-changed-only
              type="checkbox"
              onChange={(event) => setChangedOnly(event.target.checked)}
            />
            只看修改
          </label>
          <button disabled={changedIndexes.length === 0} type="button" onClick={() => move(-1)}>
            上一处
          </button>
          <span aria-live="polite">
            {changedIndexes.length === 0 ? '没有差异' : `${activeChange + 1}/${changedIndexes.length}`}
          </span>
          <button disabled={changedIndexes.length === 0} type="button" onClick={() => move(1)}>
            下一处
          </button>
        </div>
      </header>
      <div className="review-diff__headings">
        <strong>{currentTitle}</strong>
        <strong>{comparisonTitle}</strong>
      </div>
      <div className="review-diff__body">
        {visible.map(({ line, index }) => (
          <div
            className="review-diff__row"
            data-active={activeLineIndex === index}
            data-diff-kind={line.kind}
            data-review-diff-line
            key={line.id}
            ref={(element) => {
              if (element) lineRefs.current.set(index, element);
              else lineRefs.current.delete(index);
            }}
          >
            <div className="review-diff__line" data-side="current">
              <span className="review-diff__number">{line.currentLineNumber ?? ''}</span>
              <span className="review-diff__text">
                <InlineSegments segments={line.currentSegments} />
              </span>
            </div>
            <div className="review-diff__line" data-side="comparison">
              <span className="review-diff__number">{line.comparisonLineNumber ?? ''}</span>
              <span className="review-diff__text">
                <InlineSegments segments={line.comparisonSegments} />
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function InlineSegments({ segments }: { readonly segments: readonly ReviewInlineSegment[] }) {
  if (segments.length === 0) return <span aria-hidden="true">&nbsp;</span>;
  return segments.map((segment, index) => {
    if (segment.kind === 'added') return <mark key={index}>{segment.text}</mark>;
    if (segment.kind === 'removed') return <del key={index}>{segment.text}</del>;
    return <span key={index}>{segment.text}</span>;
  });
}
