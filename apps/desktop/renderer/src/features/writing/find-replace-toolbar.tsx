interface FindReplaceToolbarProps {
  readonly findText: string;
  readonly replaceText: string;
  readonly findIndex: number;
  readonly findCount: number;
  readonly readOnly: boolean;
  readonly isComposing: boolean;
  readonly onFindTextChange: (value: string) => void;
  readonly onReplaceTextChange: (value: string) => void;
  readonly onSelectMatch: (direction: -1 | 1) => void;
  readonly onReplaceMatches: (all: boolean) => void;
}

export function FindReplaceToolbar({
  findText,
  replaceText,
  findIndex,
  findCount,
  readOnly,
  isComposing,
  onFindTextChange,
  onReplaceTextChange,
  onSelectMatch,
  onReplaceMatches,
}: FindReplaceToolbarProps) {
  return (
    <div className="draft-find" aria-label="当前章节查找替换">
      <input
        data-draft-find
        type="search"
        aria-label="查找文本"
        placeholder="查找当前章节"
        value={findText}
        onChange={(event) => onFindTextChange(event.target.value)}
      />
      <button type="button" disabled={!findCount} onClick={() => onSelectMatch(-1)}>
        上一个
      </button>
      <button
        data-draft-find-next
        type="button"
        disabled={!findCount}
        onClick={() => onSelectMatch(1)}
      >
        下一个
      </button>
      <span data-draft-find-status aria-live="polite">
        {findCount ? `${findIndex + 1}/${findCount}` : findText ? '未找到' : ''}
      </span>
      <input
        data-draft-replace
        type="text"
        aria-label="替换文本"
        placeholder="替换为"
        value={replaceText}
        onChange={(event) => onReplaceTextChange(event.target.value)}
      />
      <button
        data-draft-replace-current
        type="button"
        disabled={!findCount || readOnly || isComposing}
        onClick={() => onReplaceMatches(false)}
      >
        替换
      </button>
      <button
        type="button"
        disabled={!findCount || readOnly || isComposing}
        onClick={() => onReplaceMatches(true)}
      >
        全部替换
      </button>
    </div>
  );
}
