const GLOBAL_ERROR_NOTICE_ID = 'worldforge-global-error-notice';

function diagnosticId(): string {
  return `diag_renderer_${globalThis.crypto.randomUUID()}`;
}

function showGlobalFailure(id: string): void {
  let notice = document.getElementById(GLOBAL_ERROR_NOTICE_ID);
  if (!notice) {
    notice = document.createElement('div');
    notice.id = GLOBAL_ERROR_NOTICE_ID;
    notice.className = 'safety-banner safety-banner--danger';
    notice.setAttribute('role', 'alert');
    document.body.prepend(notice);
  }
  notice.textContent = `界面遇到异常，当前作品数据未被自动修改。请先保存或复制当前正文，再重试操作。诊断编号：${id}`;
}

export function installGlobalRendererErrorBoundary(): () => void {
  const onError = (): void => showGlobalFailure(diagnosticId());
  const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
    event.preventDefault();
    showGlobalFailure(diagnosticId());
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
    document.getElementById(GLOBAL_ERROR_NOTICE_ID)?.remove();
  };
}
