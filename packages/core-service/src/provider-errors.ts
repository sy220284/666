import type { ErrorCode } from '@worldforge/contracts';

export class ProviderRuntimeError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;

  constructor(code: ErrorCode, message: string, retryable = false) {
    super(message);
    this.name = 'ProviderRuntimeError';
    this.code = code;
    this.retryable = retryable;
  }
}

export function providerErrorCode(error: unknown): ErrorCode {
  return error instanceof ProviderRuntimeError ? error.code : 'AI_CONNECTION_FAILED_003';
}
