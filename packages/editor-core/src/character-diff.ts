export type CharacterDiffSegmentType = 'equal' | 'insert' | 'delete';

export interface CharacterDiffSegment {
  readonly type: CharacterDiffSegmentType;
  readonly text: string;
}

export interface DiffCancellationSignal {
  readonly aborted: boolean;
}

export interface CharacterDiffOptions {
  readonly signal?: DiffCancellationSignal;
  readonly maximumEditDistance?: number;
  readonly maximumWorkUnits?: number;
}

export interface CharacterDiffResult {
  readonly segments: readonly CharacterDiffSegment[];
  readonly coarse: boolean;
}

interface AtomicEdit {
  readonly type: CharacterDiffSegmentType;
  readonly character: string;
}

const DEFAULT_MAXIMUM_EDIT_DISTANCE = 2_048;
const DEFAULT_MAXIMUM_WORK_UNITS = 5_000_000;

export class DiffCancelledError extends Error {
  readonly code = 'COMMON_CANCELLED_004' as const;

  constructor() {
    super('The progressive character diff was cancelled.');
    this.name = 'DiffCancelledError';
  }
}

function assertNotCancelled(signal: DiffCancellationSignal | undefined): void {
  if (signal?.aborted) throw new DiffCancelledError();
}

function appendSegment(
  segments: CharacterDiffSegment[],
  type: CharacterDiffSegmentType,
  text: string,
): void {
  if (text.length === 0) return;
  const previous = segments.at(-1);
  if (previous?.type === type) {
    segments[segments.length - 1] = { type, text: previous.text + text };
  } else {
    segments.push({ type, text });
  }
}

function groupAtomicEdits(edits: readonly AtomicEdit[]): CharacterDiffSegment[] {
  const segments: CharacterDiffSegment[] = [];
  for (const edit of edits) appendSegment(segments, edit.type, edit.character);
  return segments;
}

function sharedCharacterRatio(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const character of left) counts.set(character, (counts.get(character) ?? 0) + 1);
  let shared = 0;
  for (const character of right) {
    const available = counts.get(character) ?? 0;
    if (available === 0) continue;
    shared += 1;
    counts.set(character, available - 1);
  }
  return shared / Math.min(left.length, right.length);
}

function backtrack(
  trace: readonly ReadonlyMap<number, number>[],
  left: readonly string[],
  right: readonly string[],
): CharacterDiffSegment[] {
  let x = left.length;
  let y = right.length;
  const edits: AtomicEdit[] = [];

  for (let distance = trace.length - 1; distance > 0; distance -= 1) {
    const previous = trace[distance - 1];
    if (!previous) throw new Error('Character diff trace is incomplete.');
    const diagonal = x - y;
    const previousDelete = previous.get(diagonal - 1) ?? Number.NEGATIVE_INFINITY;
    const previousInsert = previous.get(diagonal + 1) ?? Number.NEGATIVE_INFINITY;
    const previousDiagonal =
      diagonal === -distance || (diagonal !== distance && previousDelete < previousInsert)
        ? diagonal + 1
        : diagonal - 1;
    const previousX = previous.get(previousDiagonal) ?? 0;
    const previousY = previousX - previousDiagonal;

    while (x > previousX && y > previousY) {
      const character = left[x - 1];
      if (character === undefined) throw new Error('Character diff backtrack exceeded input.');
      edits.push({ type: 'equal', character });
      x -= 1;
      y -= 1;
    }
    if (x === previousX) {
      const character = right[y - 1];
      if (character === undefined) throw new Error('Character diff insert exceeded input.');
      edits.push({ type: 'insert', character });
      y -= 1;
    } else {
      const character = left[x - 1];
      if (character === undefined) throw new Error('Character diff delete exceeded input.');
      edits.push({ type: 'delete', character });
      x -= 1;
    }
  }

  while (x > 0 && y > 0) {
    const character = left[x - 1];
    if (character === undefined) throw new Error('Character diff prefix exceeded input.');
    edits.push({ type: 'equal', character });
    x -= 1;
    y -= 1;
  }
  while (x > 0) {
    const character = left[x - 1];
    if (character === undefined) throw new Error('Character diff delete prefix exceeded input.');
    edits.push({ type: 'delete', character });
    x -= 1;
  }
  while (y > 0) {
    const character = right[y - 1];
    if (character === undefined) throw new Error('Character diff insert prefix exceeded input.');
    edits.push({ type: 'insert', character });
    y -= 1;
  }

  edits.reverse();
  return groupAtomicEdits(edits);
}

function exactMiddleDiff(
  left: readonly string[],
  right: readonly string[],
  options: CharacterDiffOptions,
): CharacterDiffSegment[] | null {
  const maximumDistance = options.maximumEditDistance ?? DEFAULT_MAXIMUM_EDIT_DISTANCE;
  const maximumWork = options.maximumWorkUnits ?? DEFAULT_MAXIMUM_WORK_UNITS;
  const maximum = left.length + right.length;
  let previous = new Map<number, number>([[1, 0]]);
  const trace: Map<number, number>[] = [];
  let work = 0;

  for (let distance = 0; distance <= maximum; distance += 1) {
    assertNotCancelled(options.signal);
    if (distance > maximumDistance) return null;
    const current = new Map<number, number>();
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      work += 1;
      if (work > maximumWork) return null;
      if ((work & 1_023) === 0) assertNotCancelled(options.signal);

      const deleteX = previous.get(diagonal - 1) ?? Number.NEGATIVE_INFINITY;
      const insertX = previous.get(diagonal + 1) ?? Number.NEGATIVE_INFINITY;
      let x: number;
      if (diagonal === -distance || (diagonal !== distance && deleteX < insertX)) {
        x = insertX === Number.NEGATIVE_INFINITY ? 0 : insertX;
      } else {
        x = (deleteX === Number.NEGATIVE_INFINITY ? 0 : deleteX) + 1;
      }
      let y = x - diagonal;
      while (x < left.length && y < right.length && left[x] === right[y]) {
        x += 1;
        y += 1;
        work += 1;
        if (work > maximumWork) return null;
        if ((work & 1_023) === 0) assertNotCancelled(options.signal);
      }
      current.set(diagonal, x);
      if (x >= left.length && y >= right.length) {
        trace.push(current);
        return backtrack(trace, left, right);
      }
    }
    trace.push(current);
    previous = current;
  }
  return null;
}

function coarseMiddleDiff(
  left: readonly string[],
  right: readonly string[],
): CharacterDiffSegment[] {
  const segments: CharacterDiffSegment[] = [];
  appendSegment(segments, 'delete', left.join(''));
  appendSegment(segments, 'insert', right.join(''));
  return segments;
}

export function diffChineseCharacters(
  before: string,
  after: string,
  options: CharacterDiffOptions = {},
): CharacterDiffResult {
  assertNotCancelled(options.signal);
  const left = Array.from(before);
  const right = Array.from(after);
  let prefixLength = 0;
  while (
    prefixLength < left.length &&
    prefixLength < right.length &&
    left[prefixLength] === right[prefixLength]
  ) {
    prefixLength += 1;
  }
  let suffixLength = 0;
  while (
    suffixLength < left.length - prefixLength &&
    suffixLength < right.length - prefixLength &&
    left[left.length - suffixLength - 1] === right[right.length - suffixLength - 1]
  ) {
    suffixLength += 1;
  }

  const leftMiddle = left.slice(prefixLength, left.length - suffixLength);
  const rightMiddle = right.slice(prefixLength, right.length - suffixLength);
  const largeUnrelatedReplacement =
    leftMiddle.length * rightMiddle.length >= 250_000 &&
    sharedCharacterRatio(leftMiddle, rightMiddle) < 0.05;
  const exact = largeUnrelatedReplacement
    ? null
    : exactMiddleDiff(leftMiddle, rightMiddle, options);
  const segments: CharacterDiffSegment[] = [];
  appendSegment(segments, 'equal', left.slice(0, prefixLength).join(''));
  for (const segment of exact ?? coarseMiddleDiff(leftMiddle, rightMiddle)) {
    appendSegment(segments, segment.type, segment.text);
  }
  appendSegment(segments, 'equal', left.slice(left.length - suffixLength).join(''));
  return { segments, coarse: exact === null };
}
