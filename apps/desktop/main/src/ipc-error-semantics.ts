import type { ErrorCode } from '@worldforge/contracts';

export interface CoreOperationFailureSemantics {
  readonly message: string;
  readonly retryable: boolean;
  readonly userAction?: string;
}

export function coreOperationFailureSemantics(
  code: ErrorCode,
  fallbackMessage: string,
): CoreOperationFailureSemantics {
  if (code === 'COMMON_TIMEOUT_005') {
    return {
      message:
        'Core did not return a final result before the timeout; the operation may still have completed.',
      retryable: false,
      userAction: 'Refresh authoritative state before attempting the operation again.',
    };
  }
  return {
    message: fallbackMessage,
    retryable: ['COMMON_INTERNAL_999', 'DB_BUSY_TIMEOUT_002'].includes(code),
  };
}
