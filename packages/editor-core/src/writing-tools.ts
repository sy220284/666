export interface WritingStatistics {
  readonly characterCount: number;
  readonly textCount: number;
  readonly paragraphCount: number;
  readonly progressPercent: number | null;
}

export interface TextRange {
  readonly from: number;
  readonly to: number;
}

export function calculateWritingStatistics(
  text: string,
  paragraphCount: number,
  targetWordMax?: number | null,
): WritingStatistics {
  const compact = text.replace(/\s/gu, '');
  const characterCount = Array.from(compact).length;
  const textCount = Array.from(compact.matchAll(/[\p{L}\p{N}]/gu)).length;
  const maximum = targetWordMax && targetWordMax > 0 ? targetWordMax : null;
  return {
    characterCount,
    textCount,
    paragraphCount: Math.max(0, Math.trunc(paragraphCount)),
    progressPercent:
      maximum === null ? null : Math.min(100, Math.round((textCount / maximum) * 100)),
  };
}

export function findTextRanges(
  text: string,
  query: string,
  caseSensitive = false,
): readonly TextRange[] {
  if (!query) return [];
  const source = caseSensitive ? text : text.toLocaleLowerCase();
  const needle = caseSensitive ? query : query.toLocaleLowerCase();
  if (!needle) return [];
  const ranges: TextRange[] = [];
  let offset = 0;
  while (offset <= source.length - needle.length) {
    const found = source.indexOf(needle, offset);
    if (found < 0) break;
    ranges.push({ from: found, to: found + query.length });
    offset = found + Math.max(1, query.length);
  }
  return ranges;
}

export function replaceTextRanges(
  text: string,
  query: string,
  replacement: string,
  replaceAll: boolean,
  caseSensitive = false,
): string {
  const ranges = findTextRanges(text, query, caseSensitive);
  const selected = replaceAll ? ranges : ranges.slice(0, 1);
  let result = text;
  for (const range of [...selected].reverse()) {
    result = result.slice(0, range.from) + replacement + result.slice(range.to);
  }
  return result;
}
