export const MAX_GENERATION_POLL_FAILURES = 5;

export function generationPollingDelay(failureCount: number): number {
  return Math.min(5_000, 1_000 * 2 ** Math.min(Math.max(0, failureCount), 2));
}

export function registerGenerationPollingFailure(failureCount: number): {
  readonly failureCount: number;
  readonly terminal: boolean;
  readonly delayMs: number;
} {
  const nextFailureCount = failureCount + 1;
  return {
    failureCount: nextFailureCount,
    terminal: nextFailureCount >= MAX_GENERATION_POLL_FAILURES,
    delayMs: generationPollingDelay(nextFailureCount),
  };
}
