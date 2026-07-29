import { authorErrorMessage } from '../presentation/author-error-message.js';

interface AuthorErrorNoticeProps {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
  readonly className?: string;
}

export function AuthorErrorNotice({ error, className = 'form-error' }: AuthorErrorNoticeProps) {
  const content = authorErrorMessage(error.code, error.message);
  return (
    <div className={className} role="alert">
      <strong>{content.title}</strong>
      <p>{content.message}</p>
      {content.suggestedAction ? <p>{content.suggestedAction}</p> : null}
      <details>
        <summary>技术详情</summary>
        <dl>
          <dt>错误码</dt>
          <dd>{error.code}</dd>
        </dl>
      </details>
    </div>
  );
}
