import type { AppearancePreferences, ProjectContinuationSnapshot } from '@worldforge/contracts';

import type { BridgeRequestOutcome } from '../bridge/request-lifecycle.js';
import { authorErrorSummary } from '../presentation/author-error-message.js';
import type { RendererRouteId } from '../state/ui-state-boundary.js';

export interface FailureView {
  readonly title: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly diagnosticId: string | null;
}

export function isWritingRoute(route: RendererRouteId): boolean {
  return route === 'writing' || route === 'versions' || route === 'candidates';
}

export function authorReturnFocusKey(element: Element | null): string | null {
  return element instanceof HTMLElement ? (element.dataset.authorReturnKey ?? null) : null;
}

export function focusAuthorReturnTarget(focusKey: string | null): boolean {
  if (!focusKey) return true;
  const target = Array.from(
    document.querySelectorAll<HTMLElement>('[data-author-return-key]'),
  ).find((element) => element.dataset.authorReturnKey === focusKey);
  if (!target) return false;
  target.focus();
  return document.activeElement === target;
}

export function continuationRoute(
  continuation: ProjectContinuationSnapshot | null,
): 'writing' | 'versions' | 'candidates' {
  if (continuation?.status !== 'ready') return 'writing';
  return continuation.panel === 'editor' ? 'writing' : continuation.panel;
}

export function isCancelledOutcome(outcome: BridgeRequestOutcome<unknown>): boolean {
  return (
    outcome.state === 'cancelled' ||
    (outcome.state === 'failure' && outcome.error.code === 'COMMON_CANCELLED_004')
  );
}

export function failureFromOutcome(
  title: string,
  outcome: BridgeRequestOutcome<unknown>,
): FailureView {
  if (outcome.state === 'failure') {
    return {
      title,
      message: authorErrorSummary(outcome.error),
      retryable: outcome.error.retryable,
      diagnosticId: outcome.error.diagnosticId ?? null,
    };
  }
  return {
    title,
    message: outcome.state === 'cancelled' ? '操作已取消。' : '响应已被更新请求替代。',
    retryable: outcome.state !== 'cancelled',
    diagnosticId: null,
  };
}

export function contentWidthPixels(
  preference: AppearancePreferences['contentWidth'],
  viewportWidth: number,
): number {
  if (preference === 'narrow') return Math.min(720, viewportWidth - 48);
  if (preference === 'wide') return Math.min(1280, viewportWidth - 48);
  if (preference === 'adaptive') return Math.min(Math.max(720, viewportWidth * 0.72), 1440);
  return Math.min(960, viewportWidth - 48);
}
