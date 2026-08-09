export interface FileLeaseTiming {
  readonly durationMs: number;
  readonly heartbeatMs: number;
  readonly waitTimeoutMs: number;
  readonly retryDelayMs: number;
}
