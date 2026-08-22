import { useEffect, useRef, useState } from 'react';

import {
  resolveAuthorDialog,
  subscribeAuthorDialog,
  type PendingAuthorDialog,
} from '../runtime/author-dialog.js';

function initialValue(pending: PendingAuthorDialog): string {
  const { request } = pending;
  if (request.kind === 'text' || request.kind === 'select') return request.initialValue ?? '';
  return '';
}

function cancelResult(pending: PendingAuthorDialog): boolean | null {
  return pending.request.kind === 'confirm' || pending.request.kind === 'name' ? false : null;
}

export function AuthorDialogHost() {
  const [pending, setPending] = useState<PendingAuthorDialog | null>(null);
  const [value, setValue] = useState('');
  const primaryInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(
    null,
  );
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(
    () =>
      subscribeAuthorDialog((next) => {
        if (next && !previousFocusRef.current) {
          previousFocusRef.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }
        if (!next) {
          previousFocusRef.current?.focus();
          previousFocusRef.current = null;
        }
        setPending(next);
        if (next) setValue(initialValue(next));
      }),
    [],
  );

  useEffect(() => {
    if (!pending) return;
    (primaryInputRef.current ?? confirmButtonRef.current)?.focus();
  }, [pending]);

  useEffect(() => {
    if (!pending) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      resolveAuthorDialog(pending.id, cancelResult(pending));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pending]);

  if (!pending) return null;

  const { request } = pending;
  const nameMatches = request.kind !== 'name' || value.trim() === request.expectedName;
  const confirmDisabled =
    (request.kind === 'select' && !value) || (request.kind === 'name' && !nameMatches);

  const confirm = (): void => {
    if (confirmDisabled) return;
    if (request.kind === 'confirm' || request.kind === 'name') {
      resolveAuthorDialog(pending.id, true);
      return;
    }
    resolveAuthorDialog(pending.id, value);
  };

  return (
    <div
      className="react-dialog-backdrop"
      data-author-dialog
      data-author-dialog-kind={request.kind}
    >
      <section
        aria-describedby={request.message ? 'author-dialog-description' : undefined}
        aria-labelledby="author-dialog-title"
        aria-modal="true"
        className="react-dialog"
        role="dialog"
      >
        <h2 id="author-dialog-title">{request.title}</h2>
        {request.message ? <p id="author-dialog-description">{request.message}</p> : null}

        {request.kind === 'text' ? (
          <label className="field">
            <span>输入内容</span>
            {request.multiline ? (
              <textarea
                data-author-dialog-input
                ref={(node) => {
                  primaryInputRef.current = node;
                }}
                value={value}
                placeholder={request.placeholder}
                rows={5}
                onChange={(event) => setValue(event.target.value)}
              />
            ) : (
              <input
                data-author-dialog-input
                ref={(node) => {
                  primaryInputRef.current = node;
                }}
                value={value}
                placeholder={request.placeholder}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') confirm();
                }}
              />
            )}
          </label>
        ) : null}

        {request.kind === 'select' ? (
          <label className="field">
            <span>选择一项</span>
            <select
              data-author-dialog-input
              ref={(node) => {
                primaryInputRef.current = node;
              }}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            >
              <option value="">请选择</option>
              {request.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                  {option.description ? ` · ${option.description}` : ''}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {request.kind === 'name' ? (
          <label className="field">
            <span>输入“{request.expectedName}”以确认</span>
            <input
              data-author-dialog-input
              ref={(node) => {
                primaryInputRef.current = node;
              }}
              value={value}
              placeholder={request.placeholder ?? request.expectedName}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') confirm();
              }}
            />
          </label>
        ) : null}

        <div className="inline-actions">
          <button
            className={request.danger ? 'text-button danger' : undefined}
            data-author-dialog-confirm
            type="button"
            disabled={confirmDisabled}
            ref={confirmButtonRef}
            onClick={confirm}
          >
            {request.confirmLabel ?? '确认'}
          </button>
          <button
            className="quiet-button"
            data-author-dialog-cancel
            type="button"
            onClick={() => resolveAuthorDialog(pending.id, cancelResult(pending))}
          >
            {request.cancelLabel ?? '取消'}
          </button>
        </div>
      </section>
    </div>
  );
}
