export interface DraftDiffBlock {
  readonly logicalBlockId: string;
  readonly content: string;
}

export interface CandidateDiffBlock {
  readonly temporaryId: string;
  readonly logicalBlockId?: string;
  readonly sourceLogicalBlockIds?: readonly string[];
  readonly content: string;
}

export type StructureDiffEntry =
  | {
      readonly kind: 'unchanged' | 'modified';
      readonly logicalBlockId: string;
      readonly currentIndex: number;
      readonly candidateIndex: number;
    }
  | {
      readonly kind: 'moved';
      readonly logicalBlockId: string;
      readonly currentIndex: number;
      readonly candidateIndex: number;
      readonly contentChanged: boolean;
    }
  | { readonly kind: 'added'; readonly temporaryId: string; readonly candidateIndex: number }
  | { readonly kind: 'deleted'; readonly logicalBlockId: string; readonly currentIndex: number }
  | {
      readonly kind: 'split';
      readonly sourceLogicalBlockId: string;
      readonly candidateBlockIds: readonly string[];
      readonly candidateIndexes: readonly number[];
    }
  | {
      readonly kind: 'merged';
      readonly sourceLogicalBlockIds: readonly string[];
      readonly candidateBlockId: string;
      readonly candidateIndex: number;
    };

interface CharacterDiffSegment {
  readonly type: 'equal' | 'insert' | 'delete';
  readonly text: string;
}

interface CharacterDiffResult {
  readonly segments: readonly CharacterDiffSegment[];
  readonly coarse: boolean;
}

interface CharacterJob {
  readonly key: string;
  readonly before: string;
  readonly after: string;
}

interface DirectMatch {
  readonly logicalBlockId: string;
  readonly currentIndex: number;
  readonly candidateIndex: number;
}

function candidateIdentity(block: CandidateDiffBlock): string {
  return block.logicalBlockId ?? block.temporaryId;
}

function validateInputs(
  current: readonly DraftDiffBlock[],
  candidate: readonly CandidateDiffBlock[],
): void {
  const currentIds = new Set<string>();
  for (const block of current) {
    if (currentIds.has(block.logicalBlockId)) {
      throw new RangeError(`Duplicate current logicalBlockId: ${block.logicalBlockId}`);
    }
    currentIds.add(block.logicalBlockId);
  }

  const temporaryIds = new Set<string>();
  const candidateIds = new Set<string>();
  for (const block of candidate) {
    if (temporaryIds.has(block.temporaryId)) {
      throw new RangeError(`Duplicate candidate temporaryId: ${block.temporaryId}`);
    }
    temporaryIds.add(block.temporaryId);
    if (block.logicalBlockId) {
      if (candidateIds.has(block.logicalBlockId)) {
        throw new RangeError(`Duplicate candidate logicalBlockId: ${block.logicalBlockId}`);
      }
      candidateIds.add(block.logicalBlockId);
    }
    const sources = block.sourceLogicalBlockIds ?? [];
    if (new Set(sources).size !== sources.length) {
      throw new RangeError(`Duplicate source logicalBlockId on ${block.temporaryId}`);
    }
    for (const source of sources) {
      if (!currentIds.has(source)) throw new RangeError(`Unknown source logicalBlockId: ${source}`);
    }
  }
}

function stableMatchPositions(matches: readonly DirectMatch[]): ReadonlySet<number> {
  const tails: number[] = [];
  const tailPositions: number[] = [];
  const previous = new Array<number>(matches.length).fill(-1);
  for (const [position, match] of matches.entries()) {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const value = tails[middle];
      if (value !== undefined && value < match.currentIndex) low = middle + 1;
      else high = middle;
    }
    tails[low] = match.currentIndex;
    if (low > 0) previous[position] = tailPositions[low - 1] ?? -1;
    tailPositions[low] = position;
  }
  const result = new Set<number>();
  let cursor = tailPositions[tails.length - 1] ?? -1;
  while (cursor >= 0) {
    result.add(cursor);
    cursor = previous[cursor] ?? -1;
  }
  return result;
}

function characterDiff(before: string, after: string): CharacterDiffResult {
  if (before === after) return { segments: [{ type: 'equal', text: before }], coarse: false };
  const left = Array.from(before);
  const right = Array.from(after);
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix])
    prefix += 1;
  let suffix = 0;
  while (
    suffix < left.length - prefix &&
    suffix < right.length - prefix &&
    left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const segments: CharacterDiffSegment[] = [];
  const equalPrefix = left.slice(0, prefix).join('');
  const deleted = left.slice(prefix, left.length - suffix).join('');
  const inserted = right.slice(prefix, right.length - suffix).join('');
  const equalSuffix = suffix === 0 ? '' : left.slice(left.length - suffix).join('');
  if (equalPrefix) segments.push({ type: 'equal', text: equalPrefix });
  if (deleted) segments.push({ type: 'delete', text: deleted });
  if (inserted) segments.push({ type: 'insert', text: inserted });
  if (equalSuffix) segments.push({ type: 'equal', text: equalSuffix });
  return { segments, coarse: false };
}

function executionPlan(
  current: readonly DraftDiffBlock[],
  candidate: readonly CandidateDiffBlock[],
) {
  const currentCharacters = current.reduce(
    (sum, block) => sum + Array.from(block.content).length,
    0,
  );
  const candidateCharacters = candidate.reduce(
    (sum, block) => sum + Array.from(block.content).length,
    0,
  );
  const chapterCharacters = Math.max(currentCharacters, candidateCharacters);
  if (chapterCharacters <= 5_000) {
    return {
      strategy: 'main-thread' as const,
      chapterCharacters,
      continuousBlockingBudgetMilliseconds: 100 as const,
      rationale: '常规章节先计算结构，再执行有复杂度上限的字符差异。',
    };
  }
  if (chapterCharacters <= 20_000) {
    return {
      strategy: 'cooperative-slices' as const,
      chapterCharacters,
      continuousBlockingBudgetMilliseconds: 100 as const,
      rationale: '长章节按块切片计算，调用层可在块间让出执行权。',
    };
  }
  return {
    strategy: 'worker' as const,
    chapterCharacters,
    continuousBlockingBudgetMilliseconds: 100 as const,
    rationale: '超长章节使用工作线程执行，主线程仅接收结果。',
  };
}

export function computeCandidateDiff(
  current: readonly DraftDiffBlock[],
  candidate: readonly CandidateDiffBlock[],
) {
  validateInputs(current, candidate);
  const currentById = new Map(
    current.map((block, index) => [block.logicalBlockId, { block, index }]),
  );
  const consumedCurrent = new Set<number>();
  const consumedCandidate = new Set<number>();
  const structure: StructureDiffEntry[] = [];
  const jobs: CharacterJob[] = [];

  for (const [candidateIndex, block] of candidate.entries()) {
    const sources = block.sourceLogicalBlockIds ?? [];
    if (sources.length <= 1) continue;
    const records = sources.map((source) => currentById.get(source));
    if (records.some((record) => !record)) continue;
    if (records.some((record) => record && consumedCurrent.has(record.index))) {
      throw new RangeError('Source logicalBlockId participates in multiple structural groups.');
    }
    structure.push({
      kind: 'merged',
      sourceLogicalBlockIds: [...sources],
      candidateBlockId: candidateIdentity(block),
      candidateIndex,
    });
    consumedCandidate.add(candidateIndex);
    for (const record of records) if (record) consumedCurrent.add(record.index);
    jobs.push({
      key: `merge:${sources.join('+')}`,
      before: records.map((record) => record?.block.content ?? '').join(''),
      after: block.content,
    });
  }

  const bySingleSource = new Map<string, number[]>();
  for (const [candidateIndex, block] of candidate.entries()) {
    if (consumedCandidate.has(candidateIndex)) continue;
    const sources = block.sourceLogicalBlockIds ?? [];
    if (sources.length !== 1 || !sources[0] || !currentById.has(sources[0])) continue;
    const indexes = bySingleSource.get(sources[0]) ?? [];
    indexes.push(candidateIndex);
    bySingleSource.set(sources[0], indexes);
  }
  for (const [source, indexes] of bySingleSource) {
    if (indexes.length <= 1) continue;
    const record = currentById.get(source);
    if (!record) continue;
    const blocks = indexes.flatMap((index) => (candidate[index] ? [candidate[index]] : []));
    structure.push({
      kind: 'split',
      sourceLogicalBlockId: source,
      candidateBlockIds: blocks.map(candidateIdentity),
      candidateIndexes: [...indexes],
    });
    consumedCurrent.add(record.index);
    for (const index of indexes) consumedCandidate.add(index);
    jobs.push({
      key: `split:${source}`,
      before: record.block.content,
      after: blocks.map((block) => block.content).join(''),
    });
  }

  const matches: DirectMatch[] = [];
  for (const [candidateIndex, block] of candidate.entries()) {
    if (consumedCandidate.has(candidateIndex)) continue;
    const source =
      block.sourceLogicalBlockIds?.length === 1 ? block.sourceLogicalBlockIds[0] : undefined;
    const logicalBlockId = block.logicalBlockId ?? source;
    if (!logicalBlockId) continue;
    const record = currentById.get(logicalBlockId);
    if (!record || consumedCurrent.has(record.index)) continue;
    matches.push({ logicalBlockId, currentIndex: record.index, candidateIndex });
  }
  const stable = stableMatchPositions(matches);
  for (const [position, match] of matches.entries()) {
    const currentBlock = current[match.currentIndex];
    const candidateBlock = candidate[match.candidateIndex];
    if (!currentBlock || !candidateBlock) continue;
    const contentChanged = currentBlock.content !== candidateBlock.content;
    structure.push(
      stable.has(position)
        ? { kind: contentChanged ? 'modified' : 'unchanged', ...match }
        : { kind: 'moved', ...match, contentChanged },
    );
    if (contentChanged) {
      jobs.push({
        key: `block:${match.logicalBlockId}`,
        before: currentBlock.content,
        after: candidateBlock.content,
      });
    }
    consumedCurrent.add(match.currentIndex);
    consumedCandidate.add(match.candidateIndex);
  }

  for (const [currentIndex, block] of current.entries()) {
    if (!consumedCurrent.has(currentIndex)) {
      structure.push({ kind: 'deleted', logicalBlockId: block.logicalBlockId, currentIndex });
    }
  }
  for (const [candidateIndex, block] of candidate.entries()) {
    if (!consumedCandidate.has(candidateIndex)) {
      structure.push({ kind: 'added', temporaryId: block.temporaryId, candidateIndex });
    }
  }

  return {
    structure,
    characterDiffs: jobs.map((job) => ({ ...job, diff: characterDiff(job.before, job.after) })),
    execution: executionPlan(current, candidate),
  };
}
