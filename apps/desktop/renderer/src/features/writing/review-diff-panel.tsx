import { useEffect, useMemo, useRef, useState } from 'react';

import {
  changedReviewLineIndexes,
  createReviewDiff,
  type ReviewDiffLine,
  type ReviewInlineSegment,
} from './review-diff.js';

interface ReviewDiffPanelProps {
  readonly baseTitle?: string | undefined;
  readonly baseText?: string | undefined;
  readonly currentTitle: string;
  readonly comparisonTitle: string;
  readonly currentText: string;
  readonly comparisonText: string;
  readonly emptyMessage?: string;
  readonly marker: 'version' | 'candidate';
}

interface VisibleReviewLine {
  readonly line: ReviewDiffLine;
  readonly index: number;
  readonly omittedBefore: number;
}

const LONG_DIFF_LINE_LIMIT = 1_200;
const CHANGE_CONTEXT_LINES = 3;
const EDGE_CONTEXT_LINES = 20;

export function ReviewDiffPanel({
  baseTitle,
  baseText,
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
    () => visibleReviewLines(diff, changedIndexes, changedOnly),
    [changedIndexes, changedOnly, diff],
  );
  const collapsed =
    !changedOnly && diff.length > LONG_DIFF_LINE_LIMIT && visible.length < diff.length;

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
          {collapsed ? <span>长章节已折叠未修改段落</span> : null}
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
            {changedIndexes.length === 0
              ? '没有差异'
              : `${activeChange + 1}/${changedIndexes.length}`}
          </span>
          <button disabled={changedIndexes.length === 0} type="button" onClick={() => move(1)}>
            下一处
          </button>
        </div>
      </header>
      {baseText ? (
        <ThreeWayReview
          baseText={baseText}
          baseTitle={baseTitle ?? '基础版本'}
          comparisonText={comparisonText}
          comparisonTitle={comparisonTitle}
          currentText={currentText}
          currentTitle={currentTitle}
        />
      ) : (
        <div className="review-diff__headings">
          <strong>{currentTitle}</strong>
          <strong>{comparisonTitle}</strong>
        </div>
      )}
      <div className="review-diff__body">
        {visible.map(({ line, index, omittedBefore }) => (
          <div key={line.id}>
            {omittedBefore > 0 ? (
              <div className="review-diff__gap" role="note">
                已折叠 {omittedBefore} 行未修改内容
              </div>
            ) : null}
            <div
              className="review-diff__row"
              data-active={activeLineIndex === index}
              data-diff-kind={line.kind}
              data-review-diff-line
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
          </div>
        ))}
      </div>
    </section>
  );
}

function ThreeWayReview({
  baseTitle,
  baseText,
  currentTitle,
  currentText,
  comparisonTitle,
  comparisonText,
}: {
  readonly baseTitle: string;
  readonly baseText: string;
  readonly currentTitle: string;
  readonly currentText: string;
  readonly comparisonTitle: string;
  readonly comparisonText: string;
}) {
  const baseRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);
  const comparisonRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  const synchronize = (source: HTMLDivElement): void => {
    if (syncing.current) return;
    syncing.current = true;
    const scrollRatio =
      source.scrollHeight > source.clientHeight
        ? source.scrollTop / (source.scrollHeight - source.clientHeight)
        : 0;
    for (const target of [baseRef.current, currentRef.current, comparisonRef.current]) {
      if (!target || target === source) continue;
      target.scrollTop = scrollRatio * Math.max(0, target.scrollHeight - target.clientHeight);
    }
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  };

  return (
    <div className="review-diff__three-way" data-review-three-way>
      {[
        [baseTitle, baseText, baseRef, 'base'],
        [currentTitle, currentText, currentRef, 'current'],
        [comparisonTitle, comparisonText, comparisonRef, 'comparison'],
      ].map(([title, text, ref, side]) => (
        <section
          className="review-diff__three-pane"
          data-side={side as string}
          key={side as string}
        >
          <strong>{title as string}</strong>
          <div
            className="review-diff__three-content"
            ref={ref as typeof baseRef}
            onScroll={(event) => synchronize(event.currentTarget)}
          >
            {(text as string).split('\n').map((line, index) => (
              <div className="review-diff__three-line" key={`${side as string}:${index}`}>
                <span>{index + 1}</span>
                <span>{line || '\u00a0'}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function visibleReviewLines(
  diff: readonly ReviewDiffLine[],
  changedIndexes: readonly number[],
  changedOnly: boolean,
): VisibleReviewLine[] {
  if (changedOnly) {
    return changedIndexes.map((index, position) => ({
      line: diff[index]!,
      index,
      omittedBefore: position === 0 ? index : index - changedIndexes[position - 1]! - 1,
    }));
  }
  if (diff.length <= LONG_DIFF_LINE_LIMIT) {
    return diff.map((line, index) => ({ line, index, omittedBefore: 0 }));
  }

  const included = new Set<number>();
  for (let index = 0; index < Math.min(EDGE_CONTEXT_LINES, diff.length); index += 1) {
    included.add(index);
  }
  for (let index = Math.max(0, diff.length - EDGE_CONTEXT_LINES); index < diff.length; index += 1) {
    included.add(index);
  }
  for (const changedIndex of changedIndexes) {
    for (
      let index = Math.max(0, changedIndex - CHANGE_CONTEXT_LINES);
      index <= Math.min(diff.length - 1, changedIndex + CHANGE_CONTEXT_LINES);
      index += 1
    ) {
      included.add(index);
    }
  }

  const indexes = [...included].sort((left, right) => left - right);
  return indexes.map((index, position) => ({
    line: diff[index]!,
    index,
    omittedBefore: position === 0 ? index : index - indexes[position - 1]! - 1,
  }));
}

function InlineSegments({ segments }: { readonly segments: readonly ReviewInlineSegment[] }) {
  if (segments.length === 0) return <span aria-hidden="true">&nbsp;</span>;
  return segments.map((segment, index) => {
    if (segment.kind === 'added') return <mark key={index}>{segment.text}</mark>;
    if (segment.kind === 'removed') return <del key={index}>{segment.text}</del>;
    return <span key={index}>{segment.text}</span>;
  });
}
