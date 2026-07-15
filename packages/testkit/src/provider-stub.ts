import { createHash } from 'node:crypto';

import type { ErrorCode } from '@worldforge/contracts';

export interface ProviderStubRequest {
  readonly requestId: string;
  readonly prompt: string;
  readonly signal?: AbortSignal;
}

export interface ProviderStubCall {
  readonly requestId: string;
  readonly promptCharacters: number;
  readonly promptSha256: string;
  readonly startedAt: string;
  readonly scenario: ProviderStubScenario['kind'];
}

export type ProviderStubScenario =
  | { readonly kind: 'normal'; readonly text: string }
  | {
      readonly kind: 'token-stream';
      readonly tokens: readonly string[];
      readonly tokenDelayMilliseconds?: number;
    }
  | {
      readonly kind: 'disconnect';
      readonly tokens: readonly string[];
      readonly afterTokens: number;
    }
  | { readonly kind: 'timeout'; readonly timeoutMilliseconds: number }
  | { readonly kind: 'rate-limit'; readonly retryAfterMilliseconds: number }
  | { readonly kind: 'invalid-json'; readonly payload?: string }
  | { readonly kind: 'cancellation'; readonly tokensBeforeWait?: readonly string[] };

export type ProviderStubDelay = (
  durationMilliseconds: number,
  signal: AbortSignal | undefined,
) => Promise<void>;

export interface ProviderStubOptions {
  readonly clock?: { now(): Date };
  readonly delay?: ProviderStubDelay;
}

export class ProviderStubError extends Error {
  readonly code: ErrorCode;
  readonly retryAfterMilliseconds: number | null;

  constructor(code: ErrorCode, message: string, retryAfterMilliseconds: number | null = null) {
    super(message);
    this.name = 'ProviderStubError';
    this.code = code;
    this.retryAfterMilliseconds = retryAfterMilliseconds;
  }
}

const immediateDelay: ProviderStubDelay = async (_durationMilliseconds, signal) => {
  throwIfCancelled(signal);
  await Promise.resolve();
  throwIfCancelled(signal);
};

function cancelledError(): ProviderStubError {
  return new ProviderStubError(
    'COMMON_CANCELLED_004',
    'The deterministic provider call was cancelled.',
  );
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw cancelledError();
}

function requireNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer.`);
  }
}

async function waitForCancellation(signal: AbortSignal | undefined): Promise<never> {
  if (!signal) {
    throw new ProviderStubError(
      'COMMON_INVALID_INPUT_001',
      'The cancellation scenario requires an AbortSignal.',
    );
  }
  throwIfCancelled(signal);
  return new Promise<never>((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(cancelledError()), { once: true });
  });
}

export class DeterministicProviderStub {
  readonly #scenario: ProviderStubScenario;
  readonly #clock: { now(): Date };
  readonly #delay: ProviderStubDelay;
  readonly #calls: ProviderStubCall[] = [];

  constructor(scenario: ProviderStubScenario, options: ProviderStubOptions = {}) {
    this.#scenario = scenario;
    this.#clock = options.clock ?? { now: () => new Date('2026-01-01T00:00:00.000Z') };
    this.#delay = options.delay ?? immediateDelay;
  }

  get calls(): readonly ProviderStubCall[] {
    return this.#calls.map((call) => ({ ...call }));
  }

  async *stream(request: ProviderStubRequest): AsyncGenerator<string, void, void> {
    throwIfCancelled(request.signal);
    this.#calls.push({
      requestId: request.requestId,
      promptCharacters: request.prompt.length,
      promptSha256: createHash('sha256').update(request.prompt, 'utf8').digest('hex'),
      startedAt: this.#clock.now().toISOString(),
      scenario: this.#scenario.kind,
    });

    switch (this.#scenario.kind) {
      case 'normal':
        throwIfCancelled(request.signal);
        yield this.#scenario.text;
        return;
      case 'token-stream':
        requireNonNegativeInteger(
          this.#scenario.tokenDelayMilliseconds ?? 0,
          'tokenDelayMilliseconds',
        );
        for (const token of this.#scenario.tokens) {
          await this.#delay(this.#scenario.tokenDelayMilliseconds ?? 0, request.signal);
          throwIfCancelled(request.signal);
          yield token;
        }
        return;
      case 'disconnect':
        requireNonNegativeInteger(this.#scenario.afterTokens, 'afterTokens');
        for (const [index, token] of this.#scenario.tokens.entries()) {
          if (index >= this.#scenario.afterTokens) break;
          throwIfCancelled(request.signal);
          yield token;
        }
        throw new ProviderStubError(
          'AI_STREAM_INTERRUPTED_009',
          'The deterministic provider stream was interrupted.',
        );
      case 'timeout':
        requireNonNegativeInteger(this.#scenario.timeoutMilliseconds, 'timeoutMilliseconds');
        await this.#delay(this.#scenario.timeoutMilliseconds, request.signal);
        throw new ProviderStubError(
          'AI_REQUEST_TIMEOUT_006',
          'The deterministic provider request timed out.',
        );
      case 'rate-limit':
        requireNonNegativeInteger(this.#scenario.retryAfterMilliseconds, 'retryAfterMilliseconds');
        throw new ProviderStubError(
          'AI_RATE_LIMITED_005',
          'The deterministic provider request was rate limited.',
          this.#scenario.retryAfterMilliseconds,
        );
      case 'invalid-json':
        throwIfCancelled(request.signal);
        yield this.#scenario.payload ?? '{"result":';
        return;
      case 'cancellation':
        for (const token of this.#scenario.tokensBeforeWait ?? []) {
          throwIfCancelled(request.signal);
          yield token;
        }
        await waitForCancellation(request.signal);
    }
  }

  async collect(request: ProviderStubRequest): Promise<string> {
    let result = '';
    for await (const chunk of this.stream(request)) result += chunk;
    return result;
  }
}
