export interface PersistedDraftFeedbackInput {
  readonly revision: number;
  readonly editorChanged: boolean;
  readonly saveContinuation: () => Promise<boolean>;
  readonly canCommit?: () => boolean;
  readonly setStatus: (message: string, failure?: boolean) => void;
  readonly savedStatus: (label: string, revision: number) => string;
}

export interface FlushedDraftFeedbackInput {
  readonly draftSaved: boolean;
  readonly revision: number;
  readonly saveContinuation: () => Promise<boolean>;
  readonly canCommit?: () => boolean;
  readonly setStatus: (message: string, failure?: boolean) => void;
  readonly savedStatus: (label: string, revision: number) => string;
}

function mayCommit(input: { readonly canCommit?: () => boolean }): boolean {
  return input.canCommit?.() ?? true;
}

export async function reportPersistedDraft(input: PersistedDraftFeedbackInput): Promise<boolean> {
  const continuationSaved = await input.saveContinuation();
  if (!mayCommit(input)) return true;
  const base = input.savedStatus('已保存', input.revision);
  const changed = input.editorChanged ? ' · 编辑器仍有新输入' : '';
  input.setStatus(
    continuationSaved ? `${base}${changed}` : `${base}${changed} · 续写位置待重试`,
    !continuationSaved,
  );
  return continuationSaved;
}

export async function reportFlushedDraft(input: FlushedDraftFeedbackInput): Promise<boolean> {
  if (!input.draftSaved) {
    if (!mayCommit(input)) return true;
    input.setStatus('正文保存失败；窗口内容仍保留。', true);
    return false;
  }

  const continuationSaved = await input.saveContinuation();
  if (!mayCommit(input)) return true;
  input.setStatus(
    continuationSaved
      ? input.savedStatus('已保存', input.revision)
      : `${input.savedStatus('正文已保存', input.revision)} · 续写位置待重试`,
    !continuationSaved,
  );
  return continuationSaved;
}
