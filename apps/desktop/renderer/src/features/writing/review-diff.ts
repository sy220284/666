import type { CandidateSummary, SceneBeat } from '@worldforge/contracts';

export type ReviewDiffKind = 'unchanged' | 'added' | 'removed' | 'changed';
export type ReviewInlineKind = 'unchanged' | 'added' | 'removed';

export interface ReviewInlineSegment {
  readonly kind: ReviewInlineKind;
  readonly text: string;
}

export interface ReviewDiffLine {
  readonly id: string;
  readonly kind: ReviewDiffKind;
  readonly currentLineNumber: number | null;
  readonly comparisonLineNumber: number | null;
  readonly currentText: string;
  readonly comparisonText: string;
  readonly currentSegments: readonly ReviewInlineSegment[];
  readonly comparisonSegments: readonly ReviewInlineSegment[];
}

interface RawLineOperation {
  readonly kind: 'unchanged' | 'added' | 'removed';
  readonly text: string;
  readonly currentLineNumber: number | null;
  readonly comparisonLineNumber: number | null;
}

interface LineAnchor {
  readonly currentIndex: number;
  readonly comparisonIndex: number;
}

const MAX_LCS_CELLS = 360_000;

function lines(value: string): string[] {
  const normalized = value.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  return normalized === '' ? [] : normalized.split('\n');
}

function commonPrefixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) index += 1;
  return index;
}

function commonSuffixLength(left: string, right: string, prefixLength: number): number {
  const limit = Math.min(left.length, right.length) - prefixLength;
  let index = 0;
  while (index < limit && left[left.length - index - 1] === right[right.length - index - 1]) {
    index += 1;
  }
  return index;
}

function inlineSegments(
  currentText: string,
  comparisonText: string,
): {
  readonly currentSegments: readonly ReviewInlineSegment[];
  readonly comparisonSegments: readonly ReviewInlineSegment[];
} {
  if (currentText === comparisonText) {
    const segment = currentText ? [{ kind: 'unchanged' as const, text: currentText }] : [];
    return { currentSegments: segment, comparisonSegments: segment };
  }
  const prefixLength = commonPrefixLength(currentText, comparisonText);
  const suffixLength = commonSuffixLength(currentText, comparisonText, prefixLength);
  const currentMiddleEnd = currentText.length - suffixLength;
  const comparisonMiddleEnd = comparisonText.length - suffixLength;
  const prefix = currentText.slice(0, prefixLength);
  const currentMiddle = currentText.slice(prefixLength, currentMiddleEnd);
  const comparisonMiddle = comparisonText.slice(prefixLength, comparisonMiddleEnd);
  const suffix = suffixLength ? currentText.slice(currentMiddleEnd) : '';
  return {
    currentSegments: [
      ...(prefix ? [{ kind: 'unchanged' as const, text: prefix }] : []),
      ...(currentMiddle ? [{ kind: 'removed' as const, text: currentMiddle }] : []),
      ...(suffix ? [{ kind: 'unchanged' as const, text: suffix }] : []),
    ],
    comparisonSegments: [
      ...(prefix ? [{ kind: 'unchanged' as const, text: prefix }] : []),
      ...(comparisonMiddle ? [{ kind: 'added' as const, text: comparisonMiddle }] : []),
      ...(suffix ? [{ kind: 'unchanged' as const, text: suffix }] : []),
    ],
  };
}

function unchangedOperation(
  text: string,
  currentIndex: number,
  comparisonIndex: number,
): RawLineOperation {
  return {
    kind: 'unchanged',
    text,
    currentLineNumber: currentIndex + 1,
    comparisonLineNumber: comparisonIndex + 1,
  };
}

function offsetOperations(
  operations: readonly RawLineOperation[],
  currentOffset: number,
  comparisonOffset: number,
): RawLineOperation[] {
  return operations.map((operation) => ({
    ...operation,
    currentLineNumber:
      operation.currentLineNumber === null ? null : operation.currentLineNumber + currentOffset,
    comparisonLineNumber:
      operation.comparisonLineNumber === null
        ? null
        : operation.comparisonLineNumber + comparisonOffset,
  }));
}

function uniqueLineAnchor(
  current: readonly string[],
  comparison: readonly string[],
): LineAnchor | null {
  const currentOccurrences = new Map<string, number[]>();
  const comparisonOccurrences = new Map<string, number[]>();
  current.forEach((line, index) => {
    currentOccurrences.set(line, [...(currentOccurrences.get(line) ?? []), index]);
  });
  comparison.forEach((line, index) => {
    comparisonOccurrences.set(line, [...(comparisonOccurrences.get(line) ?? []), index]);
  });

  const candidates: LineAnchor[] = [];
  for (const [line, currentIndexes] of currentOccurrences) {
    const comparisonIndexes = comparisonOccurrences.get(line);
    if (currentIndexes.length !== 1 || comparisonIndexes?.length !== 1) continue;
    candidates.push({ currentIndex: currentIndexes[0]!, comparisonIndex: comparisonIndexes[0]! });
  }
  if (!candidates.length) return null;

  const currentMiddle = (current.length - 1) / 2;
  const comparisonMiddle = (comparison.length - 1) / 2;
  return candidates.reduce((best, candidate) => {
    const bestDistance =
      Math.abs(best.currentIndex - currentMiddle) +
      Math.abs(best.comparisonIndex - comparisonMiddle);
    const candidateDistance =
      Math.abs(candidate.currentIndex - currentMiddle) +
      Math.abs(candidate.comparisonIndex - comparisonMiddle);
    return candidateDistance < bestDistance ? candidate : best;
  });
}

function lineAlignedOperations(
  current: readonly string[],
  comparison: readonly string[],
  currentOffset: number,
  comparisonOffset: number,
): RawLineOperation[] {
  const operations: RawLineOperation[] = [];
  const length = Math.max(current.length, comparison.length);
  for (let index = 0; index < length; index += 1) {
    const currentText = current[index];
    const comparisonText = comparison[index];
    if (
      currentText !== undefined &&
      comparisonText !== undefined &&
      currentText === comparisonText
    ) {
      operations.push(
        unchangedOperation(currentText, currentOffset + index, comparisonOffset + index),
      );
    } else {
      if (currentText !== undefined) {
        operations.push({
          kind: 'removed',
          text: currentText,
          currentLineNumber: currentOffset + index + 1,
          comparisonLineNumber: null,
        });
      }
      if (comparisonText !== undefined) {
        operations.push({
          kind: 'added',
          text: comparisonText,
          currentLineNumber: null,
          comparisonLineNumber: comparisonOffset + index + 1,
        });
      }
    }
  }
  return operations;
}

function fallbackOperations(
  current: readonly string[],
  comparison: readonly string[],
  currentOffset = 0,
  comparisonOffset = 0,
): RawLineOperation[] {
  let prefixLength = 0;
  while (
    prefixLength < current.length &&
    prefixLength < comparison.length &&
    current[prefixLength] === comparison[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < current.length - prefixLength &&
    suffixLength < comparison.length - prefixLength &&
    current[current.length - suffixLength - 1] === comparison[comparison.length - suffixLength - 1]
  ) {
    suffixLength += 1;
  }

  const operations: RawLineOperation[] = [];
  for (let index = 0; index < prefixLength; index += 1) {
    operations.push(
      unchangedOperation(current[index]!, currentOffset + index, comparisonOffset + index),
    );
  }

  const currentMiddleEnd = current.length - suffixLength;
  const comparisonMiddleEnd = comparison.length - suffixLength;
  const currentMiddle = current.slice(prefixLength, currentMiddleEnd);
  const comparisonMiddle = comparison.slice(prefixLength, comparisonMiddleEnd);
  const middleCurrentOffset = currentOffset + prefixLength;
  const middleComparisonOffset = comparisonOffset + prefixLength;

  if (!currentMiddle.length) {
    comparisonMiddle.forEach((text, index) => {
      operations.push({
        kind: 'added',
        text,
        currentLineNumber: null,
        comparisonLineNumber: middleComparisonOffset + index + 1,
      });
    });
  } else if (!comparisonMiddle.length) {
    currentMiddle.forEach((text, index) => {
      operations.push({
        kind: 'removed',
        text,
        currentLineNumber: middleCurrentOffset + index + 1,
        comparisonLineNumber: null,
      });
    });
  } else if (currentMiddle.length * comparisonMiddle.length <= MAX_LCS_CELLS) {
    operations.push(
      ...offsetOperations(
        lcsOperationsWithinLimit(currentMiddle, comparisonMiddle),
        middleCurrentOffset,
        middleComparisonOffset,
      ),
    );
  } else {
    const anchor = uniqueLineAnchor(currentMiddle, comparisonMiddle);
    if (anchor) {
      operations.push(
        ...fallbackOperations(
          currentMiddle.slice(0, anchor.currentIndex),
          comparisonMiddle.slice(0, anchor.comparisonIndex),
          middleCurrentOffset,
          middleComparisonOffset,
        ),
      );
      operations.push(
        unchangedOperation(
          currentMiddle[anchor.currentIndex]!,
          middleCurrentOffset + anchor.currentIndex,
          middleComparisonOffset + anchor.comparisonIndex,
        ),
      );
      operations.push(
        ...fallbackOperations(
          currentMiddle.slice(anchor.currentIndex + 1),
          comparisonMiddle.slice(anchor.comparisonIndex + 1),
          middleCurrentOffset + anchor.currentIndex + 1,
          middleComparisonOffset + anchor.comparisonIndex + 1,
        ),
      );
    } else {
      operations.push(
        ...lineAlignedOperations(
          currentMiddle,
          comparisonMiddle,
          middleCurrentOffset,
          middleComparisonOffset,
        ),
      );
    }
  }

  for (let index = suffixLength; index > 0; index -= 1) {
    const currentIndex = current.length - index;
    const comparisonIndex = comparison.length - index;
    operations.push(
      unchangedOperation(
        current[currentIndex]!,
        currentOffset + currentIndex,
        comparisonOffset + comparisonIndex,
      ),
    );
  }
  return operations;
}

function lcsOperationsWithinLimit(
  current: readonly string[],
  comparison: readonly string[],
): RawLineOperation[] {
  const width = comparison.length + 1;
  const table = Array.from({ length: current.length + 1 }, () => new Uint32Array(width));
  for (let currentIndex = current.length - 1; currentIndex >= 0; currentIndex -= 1) {
    const row = table[currentIndex]!;
    const nextRow = table[currentIndex + 1]!;
    for (let comparisonIndex = comparison.length - 1; comparisonIndex >= 0; comparisonIndex -= 1) {
      row[comparisonIndex] =
        current[currentIndex] === comparison[comparisonIndex]
          ? nextRow[comparisonIndex + 1]! + 1
          : Math.max(nextRow[comparisonIndex]!, row[comparisonIndex + 1]!);
    }
  }

  const operations: RawLineOperation[] = [];
  let currentIndex = 0;
  let comparisonIndex = 0;
  while (currentIndex < current.length || comparisonIndex < comparison.length) {
    const currentText = current[currentIndex];
    const comparisonText = comparison[comparisonIndex];
    if (
      currentText !== undefined &&
      comparisonText !== undefined &&
      currentText === comparisonText
    ) {
      operations.push({
        kind: 'unchanged',
        text: currentText,
        currentLineNumber: currentIndex + 1,
        comparisonLineNumber: comparisonIndex + 1,
      });
      currentIndex += 1;
      comparisonIndex += 1;
      continue;
    }
    const removeScore = table[currentIndex + 1]?.[comparisonIndex] ?? 0;
    const addScore = table[currentIndex]?.[comparisonIndex + 1] ?? 0;
    if (currentText !== undefined && (comparisonText === undefined || removeScore >= addScore)) {
      operations.push({
        kind: 'removed',
        text: currentText,
        currentLineNumber: currentIndex + 1,
        comparisonLineNumber: null,
      });
      currentIndex += 1;
    } else if (comparisonText !== undefined) {
      operations.push({
        kind: 'added',
        text: comparisonText,
        currentLineNumber: null,
        comparisonLineNumber: comparisonIndex + 1,
      });
      comparisonIndex += 1;
    }
  }
  return operations;
}

function lcsOperations(
  current: readonly string[],
  comparison: readonly string[],
): RawLineOperation[] {
  return current.length * comparison.length > MAX_LCS_CELLS
    ? fallbackOperations(current, comparison)
    : lcsOperationsWithinLimit(current, comparison);
}

function unchangedLine(operation: RawLineOperation, index: number): ReviewDiffLine {
  const segments = operation.text ? [{ kind: 'unchanged' as const, text: operation.text }] : [];
  return {
    id: `line-${index}`,
    kind: 'unchanged',
    currentLineNumber: operation.currentLineNumber,
    comparisonLineNumber: operation.comparisonLineNumber,
    currentText: operation.text,
    comparisonText: operation.text,
    currentSegments: segments,
    comparisonSegments: segments,
  };
}

export function createReviewDiff(currentValue: string, comparisonValue: string): ReviewDiffLine[] {
  const operations = lcsOperations(lines(currentValue), lines(comparisonValue));
  const result: ReviewDiffLine[] = [];
  let index = 0;
  while (index < operations.length) {
    const operation = operations[index]!;
    if (operation.kind === 'unchanged') {
      result.push(unchangedLine(operation, result.length));
      index += 1;
      continue;
    }
    const removed: RawLineOperation[] = [];
    const added: RawLineOperation[] = [];
    while (operations[index]?.kind === 'removed') {
      removed.push(operations[index]!);
      index += 1;
    }
    while (operations[index]?.kind === 'added') {
      added.push(operations[index]!);
      index += 1;
    }
    const pairCount = Math.min(removed.length, added.length);
    for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
      const currentLine = removed[pairIndex]!;
      const comparisonLine = added[pairIndex]!;
      const segments = inlineSegments(currentLine.text, comparisonLine.text);
      result.push({
        id: `line-${result.length}`,
        kind: 'changed',
        currentLineNumber: currentLine.currentLineNumber,
        comparisonLineNumber: comparisonLine.comparisonLineNumber,
        currentText: currentLine.text,
        comparisonText: comparisonLine.text,
        ...segments,
      });
    }
    for (const currentLine of removed.slice(pairCount)) {
      result.push({
        id: `line-${result.length}`,
        kind: 'removed',
        currentLineNumber: currentLine.currentLineNumber,
        comparisonLineNumber: null,
        currentText: currentLine.text,
        comparisonText: '',
        currentSegments: currentLine.text ? [{ kind: 'removed', text: currentLine.text }] : [],
        comparisonSegments: [],
      });
    }
    for (const comparisonLine of added.slice(pairCount)) {
      result.push({
        id: `line-${result.length}`,
        kind: 'added',
        currentLineNumber: null,
        comparisonLineNumber: comparisonLine.comparisonLineNumber,
        currentText: '',
        comparisonText: comparisonLine.text,
        currentSegments: [],
        comparisonSegments: comparisonLine.text
          ? [{ kind: 'added', text: comparisonLine.text }]
          : [],
      });
    }
  }
  return result;
}

export function changedReviewLineIndexes(diff: readonly ReviewDiffLine[]): number[] {
  return diff.flatMap((line, index) => (line.kind === 'unchanged' ? [] : [index]));
}

export type CandidateReviewGroupId = 'pending' | 'accepted' | 'discarded' | 'skeleton' | 'partial';

export interface CandidateReviewGroup {
  readonly id: CandidateReviewGroupId;
  readonly label: string;
  readonly candidates: readonly CandidateSummary[];
}

const CANDIDATE_GROUPS: readonly { readonly id: CandidateReviewGroupId; readonly label: string }[] =
  [
    { id: 'pending', label: '待审阅' },
    { id: 'partial', label: '未完成内容' },
    { id: 'skeleton', label: '情节骨架' },
    { id: 'accepted', label: '已采用' },
    { id: 'discarded', label: '已丢弃' },
  ];

export function candidateReviewGroupId(candidate: CandidateSummary): CandidateReviewGroupId {
  if (candidate.status === 'accepted') return 'accepted';
  if (candidate.status === 'discarded') return 'discarded';
  if (candidate.candidateType === 'skeleton') return 'skeleton';
  if (candidate.completeness === 'partial') return 'partial';
  return 'pending';
}

export function groupCandidatesForReview(
  candidates: readonly CandidateSummary[],
): CandidateReviewGroup[] {
  return CANDIDATE_GROUPS.map((group) => ({
    ...group,
    candidates: candidates.filter((candidate) => candidateReviewGroupId(candidate) === group.id),
  })).filter((group) => group.candidates.length > 0);
}

export function candidateTypeLabel(type: CandidateSummary['candidateType']): string {
  switch (type) {
    case 'skeleton':
      return '情节骨架';
    case 'full':
      return '完整正文';
    case 'rewrite':
      return '改写内容';
    case 'merge':
      return '融合内容';
  }
}

export function candidateStatusLabel(status: CandidateSummary['status']): string {
  return status === 'pending' ? '待审阅' : status === 'accepted' ? '已采用' : '已丢弃';
}

export function candidateCompletenessLabel(completeness: CandidateSummary['completeness']): string {
  return completeness === 'complete' ? '内容完整' : '内容未完成';
}

export function sceneBeatReviewLabel(beats: readonly SceneBeat[], beatId: string): string {
  const beat = beats.find((item) => item.id === beatId);
  if (!beat) return '场景已变化';
  return beat.goal ? `${beat.title} · ${beat.goal}` : beat.title;
}
