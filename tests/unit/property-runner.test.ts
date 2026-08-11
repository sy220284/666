import { describe, expect, it } from 'vitest';

import {
  assertProperty,
  integerArbitrary,
  PropertyCheckError,
  type Arbitrary,
} from '../../packages/testkit/src/index.js';

describe('property test runner', () => {
  it('replays the same generated values for the same seed', async () => {
    const arbitrary = integerArbitrary(-1000, 1000);
    const first: number[] = [];
    const second: number[] = [];

    await assertProperty(arbitrary, (value) => first.push(value), { seed: 42, runs: 12 });
    await assertProperty(arbitrary, (value) => second.push(value), { seed: 42, runs: 12 });

    expect(second).toEqual(first);
    expect(new Set(first).size).toBeGreaterThan(1);
  });

  it('shrinks a failing counterexample and reports replay coordinates', async () => {
    const arbitrary: Arbitrary<number> = {
      generate: () => 100,
      *shrink(value) {
        if (value > 7) {
          yield Math.max(7, Math.floor(value / 2));
          yield 7;
        } else if (value === 7) {
          yield 6;
        }
      },
    };

    let failure: unknown;
    try {
      await assertProperty(
        arbitrary,
        (value) => {
          expect(value).toBeLessThan(7);
        },
        { seed: 99, runs: 1, maxShrinks: 20 },
      );
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(PropertyCheckError);
    expect(failure).toMatchObject({
      seed: 99,
      runIndex: 0,
      counterexample: 7,
    });
    expect((failure as PropertyCheckError<number>).shrinkCount).toBeGreaterThan(0);
    expect((failure as Error).message).toContain('seed=99');
  });

  it('rejects invalid generator budgets before executing the property', async () => {
    await expect(
      assertProperty(integerArbitrary(0, 1), () => undefined, { runs: 0 }),
    ).rejects.toThrow('Property runs must be a positive safe integer.');
  });
});
