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
  notice.textContent = `界面遇到异常，系统无法确认刚才的操作是否完成。请先重新读取当前状态，避免重复提交重要操作；未保存正文请先复制。诊断编号：${id}`;
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
