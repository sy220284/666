import { describe, expect, it, vi } from 'vitest';

import { strictResultEnvelopeSchema } from '../testkit/strict-result-envelope.js';
import { contractInput, strictTestDouble } from '../testkit/strict-test-doubles.js';

describe('strict test doubles', () => {
  it('preserves getters and defined methods while rejecting undeclared access or mutation', () => {
    let current = 1;
    const increment = vi.fn(() => {
      current += 1;
    });
    const value = strictTestDouble<{
      readonly current: number;
      increment(): void;
      missing(): void;
    }>('Counter', {
      get current() {
        return current;
      },
      increment,
    });

    expect(value.current).toBe(1);
    value.increment();
    expect(value.current).toBe(2);
    expect(increment).toHaveBeenCalledOnce();
    expect(() => value.missing()).toThrow('UNEXPECTED_TEST_DOUBLE_ACCESS:Counter.missing');
    expect(() => {
      (value as { extra?: boolean }).extra = true;
    }).toThrow('UNEXPECTED_TEST_DOUBLE_MUTATION:Counter.extra');
  });

  it('is not treated as a thenable and keeps deliberate contract input identity', () => {
    const value = strictTestDouble<{ readonly marker: string }>('Value', { marker: 'test' });
    expect((value as { then?: unknown }).then).toBeUndefined();
    const invalid = { value: 'invalid' };
    expect(contractInput<{ value: number }>(invalid)).toBe(invalid);
  });
});

describe('strict result envelope schema', () => {
  it('accepts exact success and failure envelopes', () => {
    expect(
      strictResultEnvelopeSchema.parse({ ok: true, operation: 'project.get', data: null }),
    ).toEqual({ ok: true, operation: 'project.get', data: null });
    expect(
      strictResultEnvelopeSchema.parse({
        ok: false,
        operation: 'project.get',
        errorCode: 'COMMON_NOT_FOUND_002',
        details: { field: 'projectId' },
      }),
    ).toEqual({
      ok: false,
      operation: 'project.get',
      errorCode: 'COMMON_NOT_FOUND_002',
      details: { field: 'projectId' },
    });
  });

  it.each([
    null,
    { ok: true, operation: 'project.get' },
    { ok: true, operation: 'project.get', data: null, extra: true },
    { ok: false, operation: 'project.get' },
    { ok: false, operation: '', errorCode: 'COMMON_NOT_FOUND_002' },
    { operation: 'project.get', data: null },
  ])('rejects malformed or widened envelope %#', (input) => {
    expect(() => strictResultEnvelopeSchema.parse(input)).toThrow();
  });
});
