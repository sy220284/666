import { useEffect, useState } from 'react';

import { DRAFT_FLUSH_FAILED_EVENT, flushRegisteredDraft } from '../runtime/draft-flush-registry.js';
import { useRendererUiStore } from '../state/ui-store.js';

export function DraftFlushFailureDialogView({
  notice,
  retrying,
  onRetry,
  onReturn,
  onOpenRecovery,
  onCancel,
}: {
  readonly notice: string;
  readonly retrying: boolean;
  readonly onRetry: () => void;
  readonly onReturn: () => void;
  readonly onOpenRecovery: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <div className="react-dialog-backdrop" data-draft-flush-failure-dialog>
      <section
        aria-describedby="draft-flush-failure-description"
        aria-labelledby="draft-flush-failure-title"
        aria-modal="true"
        className="react-dialog"
        role="dialog"
      >
        <h2 id="draft-flush-failure-title">正文尚未安全保存</h2>
        <p id="draft-flush-failure-description">{notice}</p>
        <p>程序不会自动丢弃当前窗口中的修改，也不会继续切换页面、关闭作品或退出。</p>
        <div className="inline-actions">
          <button disabled={retrying} type="button" onClick={onRetry}>
            {retrying ? '正在重试…' : '重试保存'}
          </button>
          <button type="button" onClick={onReturn}>
            返回正文检查
          </button>
          <button disabled={retrying} type="button" onClick={onOpenRecovery}>
            打开恢复中心
          </button>
          <button className="quiet-button" type="button" onClick={onCancel}>
            取消操作
          </button>
        </div>
      </section>
    </div>
  );
}

export function DraftFlushFailureDialog() {
  const dispatch = useRendererUiStore((state) => state.dispatch);
  const [open, setOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [notice, setNotice] = useState('当前稿尚未安全保存，操作已经停止。');

  useEffect(() => {
    const show = (): void => {
      setNotice('当前稿尚未安全保存，操作已经停止。');
      setOpen(true);
    };
    window.addEventListener(DRAFT_FLUSH_FAILED_EVENT, show);
    return () => window.removeEventListener(DRAFT_FLUSH_FAILED_EVENT, show);
  }, []);

  if (!open) return null;

  const retry = async (): Promise<void> => {
    setRetrying(true);
    const saved = await flushRegisteredDraft();
    setRetrying(false);
    if (saved) {
      setOpen(false);
      return;
    }
    setNotice('重试保存仍未成功。正文保留在当前窗口，请检查后再次重试。');
  };

  const openRecovery = async (): Promise<void> => {
    setRetrying(true);
    const saved = await flushRegisteredDraft();
    setRetrying(false);
    if (!saved) {
      setNotice(
        '恢复中心不会在当前稿尚未安全保存时切走写作页面。请先重试保存，或复制当前正文后处理本地服务。',
      );
      return;
    }
    setOpen(false);
    dispatch({ type: 'navigate', route: 'recovery' });
  };

  return (
    <DraftFlushFailureDialogView
      notice={notice}
      retrying={retrying}
      onRetry={() => void retry()}
      onReturn={() => setOpen(false)}
      onOpenRecovery={() => void openRecovery()}
      onCancel={() => setOpen(false)}
    />
  );
}
