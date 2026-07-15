export interface CleanedText {
  readonly text: string;
  readonly changed: boolean;
}

function unwrapFence(source: string, languages: readonly string[]): string | null {
  const languagePattern = languages.join('|');
  const fence = '`'.repeat(3);
  const match = new RegExp(
    `^${fence}(?:${languagePattern})?\\r?\\n([\\s\\S]*?)\\r?\\n${fence}$`,
    'i',
  ).exec(source);
  return match?.[1] ?? null;
}

export function cleanStructuredEnvelope(raw: string): CleanedText {
  const trimmed = raw.trim();
  const unwrapped = unwrapFence(trimmed, ['json']);
  const text = unwrapped ?? trimmed;
  return { text, changed: text !== raw };
}

export function cleanChapterText(raw: string): CleanedText {
  let text = raw.trim();
  const unwrapped = unwrapFence(text, ['text', 'markdown']);
  if (unwrapped !== null) text = unwrapped.trim();

  const lines = text.split(/\r?\n/);
  if (lines[0] === '以下是正文：' || lines[0] === '以下是正文') lines.shift();
  if (lines.at(-1) === '本章完') lines.pop();
  text = lines.join('\n').trim();
  return { text, changed: text !== raw };
}
