export interface PersistedDraftFeedbackInput {
  readonly revision: number;
  readonly editorChanged: boolean;
  readonly saveContinuation: () => Promise<boolean>;
  readonly setStatus: (message: string, failure?: boolean) => void;
  readonly savedStatus: (label: string, revision: number) => string;
}

export async function reportPersistedDraft(
  input: PersistedDraftFeedbackInput,
): Promise<boolean> {
  const continuationSaved = await input.saveContinuation();
  const base = input.savedStatus('已保存', input.revision);
  const changed = input.editorChanged ? ' · 编辑器仍有新输入' : '';
  input.setStatus(
    continuationSaved ? `${base}${changed}` : `${base}${changed} · 续写位置待重试`,
    !continuationSaved,
  );
  return continuationSaved;
}
