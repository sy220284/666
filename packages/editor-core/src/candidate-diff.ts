import {
  DiffCancelledError,
  diffChineseCharacters,
  type CharacterDiffResult,
  type DiffCancellationSignal,
} from './character-diff.js';

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

export interface BlockCharacterDiff {
  readonly key: string;
  readonly before: string;
  readonly after: string;
  readonly diff: CharacterDiffResult;
}

export type DiffExecutionStrategy = 'main-thread' | 'cooperative-slices' | 'worker';

export interface DiffExecutionPlan {
  readonly strategy: DiffExecutionStrategy;
  readonly chapterCharacters: number;
  readonly continuousBlockingBudgetMilliseconds: 100;
  readonly rationale: string;
}

export interface CandidateDiffResult {
  readonly structure: readonly StructureDiffEntry[];
  readonly characterDiffs: readonly BlockCharacterDiff[];
  readonly execution: DiffExecutionPlan;
}

interface CharacterJob {
  readonly key: string;
  readonly before: string;
  readonly after: string;
}

interface StructureAnalysis {
  readonly structure: readonly StructureDiffEntry[];
  readonly jobs: readonly CharacterJob[];
}

interface DirectMatch {
  readonly logicalBlockId: string;
  readonly currentIndex: number;
  readonly candidateIndex: number;
}

function candidateIdentity(block: CandidateDiffBlock): string {
  return block.logicalBlockId ?? block.temporaryId;
}

function validateDiffInputs(
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
  const candidateLogicalIds = new Set<string>();
  for (const block of candidate) {
    if (temporaryIds.has(block.temporaryId)) {
      throw new RangeError(`Duplicate candidate temporaryId: ${block.temporaryId}`);
    }
    temporaryIds.add(block.temporaryId);
    if (block.logicalBlockId) {
      if (candidateLogicalIds.has(block.logicalBlockId)) {
        throw new RangeError(`Duplicate candidate logicalBlockId: ${block.logicalBlockId}`);
      }
      candidateLogicalIds.add(block.logicalBlockId);
    }
    const sources = block.sourceLogicalBlockIds ?? [];
    if (new Set(sources).size !== sources.length) {
      throw new RangeError(`Duplicate source logicalBlockId on ${block.temporaryId}`);
    }
    for (const source of sources) {
      if (!currentIds.has(source)) {
        throw new RangeError(`Unknown source logicalBlockId: ${source}`);
      }
    }
    if (block.logicalBlockId && sources.length === 1 && sources[0] !== block.logicalBlockId) {
      throw new RangeError(`Conflicting logicalBlockId provenance on ${block.temporaryId}`);
    }
  }
}

function longestIncreasingSubsequencePositions(
  matches: readonly DirectMatch[],
): ReadonlySet<number> {
  const tails: number[] = [];
  const tailPositions: number[] = [];
  const previousPositions = new Array<number>(matches.length).fill(-1);

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
    if (low > 0) previousPositions[position] = tailPositions[low - 1] ?? -1;
    tailPositions[low] = position;
  }

  const positions = new Set<number>();
  let cursor = tailPositions[tails.length - 1] ?? -1;
  while (cursor >= 0) {
    positions.add(cursor);
    cursor = previousPositions[cursor] ?? -1;
  }
  return positions;
}

function analyzeStructure(
  current: readonly DraftDiffBlock[],
  candidate: readonly CandidateDiffBlock[],
): StructureAnalysis {
  validateDiffInputs(current, candidate);
  const currentById = new Map(
    current.map((block, index) => [block.logicalBlockId, { block, index }]),
  );
  const consumedCurrent = new Set<number>();
  const consumedCandidate = new Set<number>();
  const structure: StructureDiffEntry[] = [];
  const jobs: CharacterJob[] = [];

  for (const [candidateIndex, block] of candidate.entries()) {
    const sources = block.sourceLogicalBlockIds ?? [];
    if (sources.length <= 1 || !sources.every((source) => currentById.has(source))) continue;
    const sourceRecords = sources.map((source) => currentById.get(source));
    if (sourceRecords.some((record) => record === undefined)) continue;
    if (sourceRecords.some((record) => record && consumedCurrent.has(record.index))) {
      throw new RangeError(`Source logicalBlockId participates in multiple structural groups.`);
    }
    structure.push({
      kind: 'merged',
      sourceLogicalBlockIds: [...sources],
      candidateBlockId: candidateIdentity(block),
      candidateIndex,
    });
    consumedCandidate.add(candidateIndex);
    for (const record of sourceRecords) {
      if (record) consumedCurrent.add(record.index);
    }
    jobs.push({
      key: `merge:${sources.join('+')}`,
      before: sourceRecords.map((record) => record?.block.content ?? '').join(''),
      after: block.content,
    });
  }

  const candidatesBySingleSource = new Map<string, number[]>();
  for (const [candidateIndex, block] of candidate.entries()) {
    if (consumedCandidate.has(candidateIndex)) continue;
    const sources = block.sourceLogicalBlockIds ?? [];
    if (sources.length !== 1) continue;
    const source = sources[0];
    if (!source || !currentById.has(source)) continue;
    const indexes = candidatesBySingleSource.get(source) ?? [];
    indexes.push(candidateIndex);
    candidatesBySingleSource.set(source, indexes);
  }
  for (const [source, candidateIndexes] of candidatesBySingleSource) {
    if (candidateIndexes.length <= 1) continue;
    const record = currentById.get(source);
    if (!record) continue;
    if (consumedCurrent.has(record.index)) {
      throw new RangeError(`Source logicalBlockId participates in multiple structural groups.`);
    }
    const blocks: CandidateDiffBlock[] = [];
    for (const index of candidateIndexes) {
      const block = candidate[index];
      if (block) blocks.push(block);
    }
    structure.push({
      kind: 'split',
      sourceLogicalBlockId: source,
      candidateBlockIds: blocks.map(candidateIdentity),
      candidateIndexes: [...candidateIndexes],
    });
    consumedCurrent.add(record.index);
    for (const index of candidateIndexes) consumedCandidate.add(index);
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
    if (!record) continue;
    if (consumedCurrent.has(record.index)) {
      throw new RangeError(`Source logicalBlockId participates in multiple structural groups.`);
    }
    matches.push({
      logicalBlockId,
      currentIndex: record.index,
      candidateIndex,
    });
  }
  const stableMatchPositions = longestIncreasingSubsequencePositions(matches);
  for (const [matchPosition, match] of matches.entries()) {
    const currentBlock = current[match.currentIndex];
    const candidateBlock = candidate[match.candidateIndex];
    if (!currentBlock || !candidateBlock) continue;
    const contentChanged = currentBlock.content !== candidateBlock.content;
    if (!stableMatchPositions.has(matchPosition)) {
      structure.push({ kind: 'moved', ...match, contentChanged });
    } else {
      structure.push({ kind: contentChanged ? 'modified' : 'unchanged', ...match });
    }
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
  return { structure, jobs };
}

export function planDiffExecution(
  current: readonly DraftDiffBlock[],
  candidate: readonly CandidateDiffBlock[],
): DiffExecutionPlan {
  const currentCharacters = current.reduce(
    (total, block) => total + Array.from(block.content).length,
    0,
  );
  const candidateCharacters = candidate.reduce(
    (total, block) => total + Array.from(block.content).length,
    0,
  );
  const chapterCharacters = Math.max(currentCharacters, candidateCharacters);
  if (chapterCharacters <= 5_000) {
    return {
      strategy: 'main-thread',
      chapterCharacters,
      continuousBlockingBudgetMilliseconds: 100,
      rationale: '常规章节先算结构，再在主线程执行有复杂度上限的字符Diff。',
    };
  }
  if (chapterCharacters <= 20_000) {
    return {
      strategy: 'cooperative-slices',
      chapterCharacters,
      continuousBlockingBudgetMilliseconds: 100,
      rationale: '长章节按块渐进计算并在块间让出执行权，支持取消。',
    };
  }
  return {
    strategy: 'worker',
    chapterCharacters,
    continuousBlockingBudgetMilliseconds: 100,
    rationale: '超过20000字或发布期观测到连续阻塞时转入Worker，主线程只接收分片结果。',
  };
}

function executeCharacterJob(
  job: CharacterJob,
  signal?: DiffCancellationSignal,
): BlockCharacterDiff {
  return {
    ...job,
    diff: diffChineseCharacters(job.before, job.after, signal ? { signal } : {}),
  };
}

export function computeCandidateDiff(
  current: readonly DraftDiffBlock[],
  candidate: readonly CandidateDiffBlock[],
): CandidateDiffResult {
  const analysis = analyzeStructure(current, candidate);
  return {
    structure: analysis.structure,
    characterDiffs: analysis.jobs.map((job) => executeCharacterJob(job)),
    execution: planDiffExecution(current, candidate),
  };
}

export type ProgressiveDiffChunk =
  | {
      readonly phase: 'structure';
      readonly structure: readonly StructureDiffEntry[];
      readonly execution: DiffExecutionPlan;
    }
  | { readonly phase: 'characters'; readonly result: BlockCharacterDiff };

export interface ProgressiveDiffOptions {
  readonly signal?: DiffCancellationSignal;
  readonly yieldControl?: () => Promise<void>;
}

export async function* diffCandidateProgressively(
  current: readonly DraftDiffBlock[],
  candidate: readonly CandidateDiffBlock[],
  options: ProgressiveDiffOptions = {},
): AsyncGenerator<ProgressiveDiffChunk, CandidateDiffResult, void> {
  const analysis = analyzeStructure(current, candidate);
  const execution = planDiffExecution(current, candidate);
  const characterDiffs: BlockCharacterDiff[] = [];
  yield { phase: 'structure', structure: analysis.structure, execution };

  for (const job of analysis.jobs) {
    if (options.signal?.aborted) throw new DiffCancelledError();
    await (options.yieldControl?.() ?? Promise.resolve());
    if (options.signal?.aborted) throw new DiffCancelledError();
    const result = executeCharacterJob(job, options.signal);
    characterDiffs.push(result);
    yield { phase: 'characters', result };
  }
  return { structure: analysis.structure, characterDiffs, execution };
}
