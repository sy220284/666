import { authorErrorSummary } from '../../presentation/author-error-message.js';

export function PlanningInlineError({
  error,
  onRetry,
}: {
  readonly error: { readonly message: string; readonly code: string };
  readonly onRetry: () => Promise<void>;
}) {
  return (
    <div className="inline-error" role="alert">
      <span>{authorErrorSummary(error)}</span>
      <button type="button" onClick={() => void onRetry()}>
        重试
      </button>
    </div>
  );
}
