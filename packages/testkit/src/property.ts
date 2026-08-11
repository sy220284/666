const UINT32_RANGE = 0x1_0000_0000;
const DEFAULT_SEED = 0x5746_5032;
const DEFAULT_RUNS = 100;
const DEFAULT_MAX_SHRINKS = 100;

export interface PropertyRandom {
  nextUint32(): number;
  integer(minimum: number, maximum: number): number;
  boolean(): boolean;
  pick<T>(values: readonly T[]): T;
}

export interface Arbitrary<T> {
  generate(random: PropertyRandom): T;
  shrink(value: T): Iterable<T>;
}

export interface PropertyCheckOptions {
  readonly seed?: number;
  readonly runs?: number;
  readonly maxShrinks?: number;
}

export interface ArrayArbitraryOptions {
  readonly minLength?: number;
  readonly maxLength: number;
}

export interface StringArbitraryOptions {
  readonly alphabet: readonly string[];
  readonly minLength?: number;
  readonly maxLength: number;
}

export class PropertyCheckError<T> extends Error {
  readonly seed: number;
  readonly runIndex: number;
  readonly counterexample: T;
  readonly shrinkCount: number;

  constructor(
    seed: number,
    runIndex: number,
    counterexample: T,
    shrinkCount: number,
    cause: unknown,
  ) {
    super(
      `Property failed with seed=${seed}, run=${runIndex}, shrinks=${shrinkCount}, counterexample=${formatCounterexample(counterexample)}`,
      { cause },
    );
    this.name = 'PropertyCheckError';
    this.seed = seed;
    this.runIndex = runIndex;
    this.counterexample = counterexample;
    this.shrinkCount = shrinkCount;
  }
}

class XorShift32 implements PropertyRandom {
  #state: number;

  constructor(seed: number) {
    this.#state = seed === 0 ? 0x9e37_79b9 : seed >>> 0;
  }

  nextUint32(): number {
    let value = this.#state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.#state = value >>> 0;
    return this.#state;
  }

  integer(minimum: number, maximum: number): number {
    assertIntegerRange(minimum, maximum);
    const span = maximum - minimum + 1;
    const rejectionLimit = UINT32_RANGE - (UINT32_RANGE % span);
    let sample = this.nextUint32();
    while (sample >= rejectionLimit) sample = this.nextUint32();
    return minimum + (sample % span);
  }

  boolean(): boolean {
    return (this.nextUint32() & 1) === 1;
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0)
      throw new RangeError('Property random pick requires at least one value.');
    return values[this.integer(0, values.length - 1)]!;
  }
}

function assertIntegerRange(minimum: number, maximum: number): void {
  if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || minimum > maximum) {
    throw new RangeError('Property integer bounds must be ordered safe integers.');
  }
  if (maximum - minimum + 1 > UINT32_RANGE) {
    throw new RangeError('Property integer ranges cannot exceed the unsigned 32-bit sample space.');
  }
}

function assertLengthRange(minimum: number, maximum: number): void {
  if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || minimum < 0) {
    throw new RangeError('Property lengths must be non-negative safe integers.');
  }
  if (minimum > maximum)
    throw new RangeError('Property minimum length cannot exceed maximum length.');
}

function validatedOptions(options: PropertyCheckOptions): Required<PropertyCheckOptions> {
  const seed = options.seed ?? DEFAULT_SEED;
  const runs = options.runs ?? DEFAULT_RUNS;
  const maxShrinks = options.maxShrinks ?? DEFAULT_MAX_SHRINKS;
  if (!Number.isSafeInteger(seed) || seed < 0 || seed >= UINT32_RANGE) {
    throw new RangeError('Property seed must be an unsigned 32-bit integer.');
  }
  if (!Number.isSafeInteger(runs) || runs <= 0) {
    throw new RangeError('Property runs must be a positive safe integer.');
  }
  if (!Number.isSafeInteger(maxShrinks) || maxShrinks < 0) {
    throw new RangeError('Property maxShrinks must be a non-negative safe integer.');
  }
  return { seed, runs, maxShrinks };
}

function mixSeed(seed: number, runIndex: number): number {
  let value = (seed + Math.imul(runIndex + 1, 0x9e37_79b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x85eb_ca6b) >>> 0;
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2_ae35) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function formatCounterexample(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : serialized;
  } catch {
    return String(value);
  }
}

async function captureFailure<T>(
  predicate: (value: T) => void | Promise<void>,
  value: T,
): Promise<unknown | null> {
  try {
    await predicate(value);
    return null;
  } catch (error) {
    return error;
  }
}

export function integerArbitrary(minimum: number, maximum: number): Arbitrary<number> {
  assertIntegerRange(minimum, maximum);
  return {
    generate: (random) => random.integer(minimum, maximum),
    *shrink(value) {
      if (!Number.isSafeInteger(value) || value < minimum || value > maximum) return;
      const target = minimum <= 0 && maximum >= 0 ? 0 : minimum;
      if (value === target) return;
      yield target;
      let current = value;
      while (Math.abs(current - target) > 1) {
        current = target + Math.trunc((current - target) / 2);
        if (current !== target && current !== value) yield current;
      }
    },
  };
}

export function constantFrom<T>(values: readonly [T, ...T[]]): Arbitrary<T> {
  return {
    generate: (random) => random.pick(values),
    *shrink(value) {
      const target = values[0];
      if (!Object.is(value, target)) yield target;
    },
  };
}

export function arrayArbitrary<T>(
  item: Arbitrary<T>,
  options: ArrayArbitraryOptions,
): Arbitrary<T[]> {
  const minimum = options.minLength ?? 0;
  const maximum = options.maxLength;
  assertLengthRange(minimum, maximum);
  return {
    generate(random) {
      const length = random.integer(minimum, maximum);
      return Array.from({ length }, () => item.generate(random));
    },
    *shrink(value) {
      if (value.length < minimum || value.length > maximum) return;
      if (value.length > minimum) {
        const halfLength = Math.max(minimum, Math.floor(value.length / 2));
        if (halfLength < value.length) yield value.slice(0, halfLength);
        if (minimum === 0 && value.length > 0) yield [];
        for (let index = 0; index < value.length && value.length - 1 >= minimum; index += 1) {
          yield [...value.slice(0, index), ...value.slice(index + 1)];
        }
      }
      for (let index = 0; index < value.length; index += 1) {
        let emitted = 0;
        for (const candidate of item.shrink(value[index]!)) {
          const copy = [...value];
          copy[index] = candidate;
          yield copy;
          emitted += 1;
          if (emitted >= 8) break;
        }
      }
    },
  };
}

export function stringArbitrary(options: StringArbitraryOptions): Arbitrary<string> {
  const minimum = options.minLength ?? 0;
  const maximum = options.maxLength;
  assertLengthRange(minimum, maximum);
  if (options.alphabet.length === 0) {
    throw new RangeError('Property string alphabet requires at least one token.');
  }
  if (options.alphabet.some((token) => Array.from(token).length !== 1)) {
    throw new RangeError(
      'Property string alphabet tokens must each contain one Unicode code point.',
    );
  }
  const tokenArbitrary = constantFrom(options.alphabet as readonly [string, ...string[]]);
  const tokens = arrayArbitrary(tokenArbitrary, { minLength: minimum, maxLength: maximum });
  return {
    generate: (random) => tokens.generate(random).join(''),
    *shrink(value) {
      if (value.length === 0) return;
      if (minimum === 0) yield '';
      const points = Array.from(value);
      if (points.length > minimum) {
        const halfLength = Math.max(minimum, Math.floor(points.length / 2));
        if (halfLength < points.length) yield points.slice(0, halfLength).join('');
      }
      const first = options.alphabet[0]!;
      if (value !== first && minimum <= 1) yield first;
    },
  };
}

export async function assertProperty<T>(
  arbitrary: Arbitrary<T>,
  predicate: (value: T) => void | Promise<void>,
  options: PropertyCheckOptions = {},
): Promise<void> {
  const { seed, runs, maxShrinks } = validatedOptions(options);
  for (let runIndex = 0; runIndex < runs; runIndex += 1) {
    const random = new XorShift32(mixSeed(seed, runIndex));
    const generated = arbitrary.generate(random);
    const failure = await captureFailure(predicate, generated);
    if (failure === null) continue;

    let counterexample = generated;
    let currentFailure = failure;
    let shrinkCount = 0;
    while (shrinkCount < maxShrinks) {
      let reduced = false;
      for (const candidate of arbitrary.shrink(counterexample)) {
        const candidateFailure = await captureFailure(predicate, candidate);
        if (candidateFailure === null) continue;
        counterexample = candidate;
        currentFailure = candidateFailure;
        shrinkCount += 1;
        reduced = true;
        break;
      }
      if (!reduced) break;
    }
    throw new PropertyCheckError(seed, runIndex, counterexample, shrinkCount, currentFailure);
  }
}
