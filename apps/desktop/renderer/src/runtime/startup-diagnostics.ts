export interface RendererStartupFailure {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly diagnosticId?: string | undefined;
  readonly userAction?: string | undefined;
}

export interface RendererStartupContext {
  readonly occurredAt: string;
  readonly rendererVersion: string;
  readonly protocolVersion: number;
  readonly phase: 'bridge' | 'react-root' | 'legacy-compatibility';
}

export interface RendererStartupDiagnostic {
  readonly severity: 'P0';
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly diagnosticId: string | null;
  readonly userAction: string | null;
  readonly occurredAt: string;
  readonly rendererVersion: string;
  readonly protocolVersion: number;
  readonly phase: RendererStartupContext['phase'];
  readonly actions: {
    readonly copyDiagnostics: true;
    readonly closeSafely: true;
    readonly restartCore: boolean;
  };
}

export function createRendererStartupDiagnostic(
  failure: RendererStartupFailure,
  context: RendererStartupContext,
): RendererStartupDiagnostic {
  return {
    severity: 'P0',
    code: failure.code,
    message: failure.message,
    retryable: failure.retryable,
    diagnosticId: failure.diagnosticId ?? null,
    userAction: failure.userAction ?? null,
    occurredAt: context.occurredAt,
    rendererVersion: context.rendererVersion,
    protocolVersion: context.protocolVersion,
    phase: context.phase,
    actions: {
      copyDiagnostics: true,
      closeSafely: true,
      restartCore: failure.retryable,
    },
  };
}

export function serializeRendererStartupDiagnostic(diagnostic: RendererStartupDiagnostic): string {
  return JSON.stringify(diagnostic, null, 2);
}
