import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface RendererErrorDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly diagnosticId: string | null;
  readonly userAction: string | null;
  readonly details: Readonly<Record<string, unknown>> | null;
}

interface RendererErrorBoundaryProps {
  readonly children: ReactNode;
  readonly onError?:
    ((diagnostic: RendererErrorDiagnostic, componentStack: string | null) => void) | undefined;
}

interface RendererErrorBoundaryState {
  readonly diagnostic: RendererErrorDiagnostic | null;
}

export class RendererErrorBoundary extends Component<
  RendererErrorBoundaryProps,
  RendererErrorBoundaryState
> {
  state: RendererErrorBoundaryState = { diagnostic: null };

  static getDerivedStateFromError(error: unknown): RendererErrorBoundaryState {
    return { diagnostic: normalizeRendererError(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.props.onError?.(normalizeRendererError(error), info.componentStack ?? null);
  }

  render(): ReactNode {
    const { diagnostic } = this.state;
    if (!diagnostic) return this.props.children;

    return (
      <section
        className="react-foundation-status"
        data-react-error-boundary="failed"
        data-state="failed"
        role="alert"
      >
        <strong>界面加载失败 · {diagnostic.code}</strong>
        <span className="react-foundation-status__details">
          {diagnostic.message}
          {diagnostic.diagnosticId ? ` · 诊断ID ${diagnostic.diagnosticId}` : ''}
          {diagnostic.userAction ? ` · ${diagnostic.userAction}` : ''}
        </span>
      </section>
    );
  }
}

export function normalizeRendererError(error: unknown): RendererErrorDiagnostic {
  const record = isRecord(error) ? error : null;
  const nestedDiagnostic = record && isRecord(record.diagnostic) ? record.diagnostic : null;
  const source = nestedDiagnostic ?? record;

  return {
    code: stringValue(source?.code) ?? 'RENDERER_REACT_ROOT_FAILED',
    message:
      stringValue(source?.message) ??
      (error instanceof Error ? error.message : 'React界面发生未知错误。'),
    retryable: booleanValue(source?.retryable) ?? false,
    diagnosticId: stringValue(source?.diagnosticId),
    userAction: stringValue(source?.userAction),
    details: isRecord(source?.details) ? source.details : null,
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}
