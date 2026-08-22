import { useCallback, useState } from 'react';

import type { TrashEntry } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeCommand, useBridgeQuery } from '../../bridge/use-bridge-resource.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import { authorConfirmName } from '../../runtime/author-dialog.js';

interface TrashPanelProps {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly onClose: () => void;
  readonly onStructureRefresh: () => Promise<void>;
}

export function TrashPanel({
  bridge,
  projectId,
  readOnly,
  onClose,
  onStructureRefresh,
}: TrashPanelProps) {
  const load = useCallback(
    () => bridge.trash.list(projectId, { mode: 'replace' }),
    [bridge, projectId],
  );
  const resource = useBridgeQuery(`trash:${projectId}`, load);
  const [status, setStatus] = useState('恢复保留原始排序；永久删除先由本地服务计算影响。');
  const command = useBridgeCommand(async () => {
    await Promise.all([resource.refresh(), onStructureRefresh()]);
  });

  const permanentlyDelete = async (entry: TrashEntry): Promise<void> => {
    const preview = await command.run(() =>
      bridge.trash.previewPermanentDelete({ projectId, trashEntryId: entry.id }),
    );
    if (!preview) return;
    if (!preview.canDelete) {
      setStatus(
        `永久删除已阻止 · ${preview.blockers
          .map(
            (blocker) =>
              `${blocker.source ?? blocker.kind} ${blocker.deleteAction ?? ''} ×${blocker.count}`,
          )
          .join('；')}`,
      );
      return;
    }
    const confirmed = await authorConfirmName({
      title: '永久删除',
      message: '永久删除不可撤销；确认后仍会创建恢复点并由本地服务校验影响。',
      expectedName: entry.title,
      confirmLabel: '永久删除',
      danger: true,
    });
    if (!confirmed) {
      setStatus('标题确认不匹配或已取消永久删除；未创建恢复点。');
      return;
    }
    const result = await command.run(() =>
      bridge.trash.permanentDelete({
        projectId,
        trashEntryId: entry.id,
        planHash: preview.planHash,
        confirmationTitle: entry.title,
      }),
    );
    if (result)
      setStatus(`已永久删除 · 恢复点 ${result.backupId.slice(0, 8)}… · 影响已由本地服务校验。`);
  };

  return (
    <dialog className="react-dialog" data-trash-dialog open>
      <header>
        <h2>回收站</h2>
        <button data-close-trash type="button" onClick={onClose}>
          关闭
        </button>
      </header>
      <p className="feature-status" data-trash-status role="status">
        {command.error ? authorErrorSummary(command.error) : status}
      </p>
      <div className="trash-list" data-trash-list>
        {resource.data?.entries.length === 0 ? <p data-trash-empty>回收站为空。</p> : null}
        {resource.data?.entries.map((entry) => (
          <article className="feature-row" data-trash-entry-id={entry.id} key={entry.id}>
            <div>
              <strong>{entry.title}</strong>
              <span>{entry.entityType}</span>
            </div>
            <div className="inline-actions">
              <button
                data-restore-original
                disabled={readOnly || command.pending}
                type="button"
                onClick={() =>
                  void command.run(() =>
                    bridge.trash.restore({
                      projectId,
                      trashEntryId: entry.id,
                      placement: 'original',
                    }),
                  )
                }
              >
                恢复原位
              </button>
              <button
                data-permanent-delete
                disabled={readOnly || command.pending}
                type="button"
                onClick={() => void permanentlyDelete(entry)}
              >
                永久删除
              </button>
            </div>
          </article>
        ))}
      </div>
    </dialog>
  );
}
