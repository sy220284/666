export interface SafetyBannerProps {
  readonly kind: 'danger' | 'warning' | 'info';
  readonly title: string;
  readonly message: string;
  readonly diagnosticId?: string | null;
  readonly action?: { readonly label: string; readonly run: () => void } | undefined;
}

export function SafetyBanner({ kind, title, message, diagnosticId, action }: SafetyBannerProps) {
  return (
    <section
      className="react-safety-banner"
      data-kind={kind}
      role={kind === 'danger' ? 'alert' : 'status'}
    >
      <div>
        <strong>{title}</strong>
        <span>{message}</span>
        {diagnosticId ? <small>诊断ID：{diagnosticId}</small> : null}
      </div>
      {action ? (
        <button className="quiet-button" type="button" onClick={action.run}>
          {action.label}
        </button>
      ) : null}
    </section>
  );
}
