import { RecoveryServiceError, type RecoveryServiceErrorCode } from './backup-manifest.js';

export interface RecoveryCompensationAction {
  readonly label: string;
  run(): Promise<void>;
}

export interface RecoveryCompensationFailure {
  readonly label: string;
  readonly error: unknown;
}

export async function settleRecoveryCompensation(
  actions: readonly RecoveryCompensationAction[],
): Promise<readonly RecoveryCompensationFailure[]> {
  const results = await Promise.allSettled(actions.map((action) => action.run()));
  return results.flatMap((result, index) =>
    result.status === 'rejected'
      ? [{ label: actions[index]?.label ?? 'unknown-artifact', error: result.reason as unknown }]
      : [],
  );
}

function compensationError(failures: readonly RecoveryCompensationFailure[]): AggregateError {
  return new AggregateError(
    failures.map(
      (failure) =>
        new Error(`Recovery compensation failed for ${failure.label}.`, {
          cause: failure.error,
        }),
    ),
    'Recovery compensation left residual artifacts.',
  );
}

export function rethrowRecoveryFailure(
  primary: unknown,
  failures: readonly RecoveryCompensationFailure[],
  fallbackCode: RecoveryServiceErrorCode,
  fallbackMessage: string,
): never {
  if (failures.length === 0) {
    if (primary instanceof RecoveryServiceError) throw primary;
    throw new RecoveryServiceError(fallbackCode, fallbackMessage, { cause: primary });
  }

  const combinedCause = new AggregateError(
    [primary, compensationError(failures)],
    'Recovery operation failed and compensation was incomplete.',
  );
  if (primary instanceof RecoveryServiceError) {
    throw new RecoveryServiceError(primary.code, primary.message, { cause: combinedCause });
  }
  throw new RecoveryServiceError(fallbackCode, fallbackMessage, { cause: combinedCause });
}
