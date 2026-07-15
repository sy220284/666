const DEFAULT_TEST_TIME = '2026-01-01T00:00:00.000Z';
const UUID_TAIL_LIMIT = 0xffffffffffffn;

function milliseconds(value: Date | string | number): number {
  const result = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(result)) throw new RangeError('The test clock requires a valid timestamp.');
  return result;
}

export class ManualClock {
  #currentMilliseconds: number;

  constructor(initial: Date | string | number = DEFAULT_TEST_TIME) {
    this.#currentMilliseconds = milliseconds(initial);
  }

  now(): Date {
    return new Date(this.#currentMilliseconds);
  }

  set(value: Date | string | number): Date {
    this.#currentMilliseconds = milliseconds(value);
    return this.now();
  }

  advance(durationMilliseconds: number): Date {
    if (!Number.isSafeInteger(durationMilliseconds) || durationMilliseconds < 0) {
      throw new RangeError('Clock advances must be non-negative integer milliseconds.');
    }
    this.#currentMilliseconds += durationMilliseconds;
    return this.now();
  }
}

export class SequenceIdFactory {
  #nextValue: bigint;

  constructor(startAt = 1) {
    if (!Number.isSafeInteger(startAt) || startAt < 0) {
      throw new RangeError('The sequence must start at a non-negative safe integer.');
    }
    this.#nextValue = BigInt(startAt);
  }

  next(label = 'id'): string {
    if (!/^[a-z][a-z0-9-]*$/.test(label)) {
      throw new RangeError('ID labels must use lowercase ASCII letters, digits, and hyphens.');
    }
    const value = this.#take();
    return `${label}-${value.toString().padStart(8, '0')}`;
  }

  nextUuid(): string {
    const value = this.#take();
    if (value > UUID_TAIL_LIMIT) throw new RangeError('The deterministic UUID sequence is full.');
    return `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
  }

  #take(): bigint {
    const value = this.#nextValue;
    this.#nextValue += 1n;
    return value;
  }
}
