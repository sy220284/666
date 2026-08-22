import type { FormEvent } from 'react';

import type { LifecycleStatus, Volume } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeCommand } from '../../bridge/use-bridge-resource.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import { useUnsavedChangesGuard } from '../../runtime/unsaved-changes.js';
import { statusLabel } from './structure-formatters.js';

interface VolumeEditorDialogProps {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly volume: Volume | null;
  readonly onClose: () => void;
  readonly onSaved: () => Promise<void>;
}

export function VolumeEditorDialog({
  bridge,
  projectId,
  volume,
  onClose,
  onSaved,
}: VolumeEditorDialogProps) {
  const command = useBridgeCommand();
  const unsaved = useUnsavedChangesGuard('卷信息');

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const title = String(values.get('title') ?? '').trim();
    const status = String(values.get('status') ?? 'pending') as LifecycleStatus;
    const result = volume
      ? await command.run(() =>
          bridge.planning.updateVolume({
            projectId,
            volumeId: volume.id,
            patch: { title, status },
          }),
        )
      : await command.run(() => bridge.planning.createVolume({ projectId, title }));
    if (result) {
      unsaved.clearDirty();
      await onSaved();
    }
  };

  return (
    <dialog className="react-dialog" data-structure-dialog open>
      <form
        data-structure-form
        data-unsaved={unsaved.dirty ? 'true' : 'false'}
        onChange={unsaved.markDirty}
        onSubmit={(event) => void submit(event)}
      >
        <header>
          <h2 data-structure-dialog-title>{volume ? '编辑卷' : '新建卷'}</h2>
          <button
            type="button"
            disabled={command.pending}
            onClick={() => {
              if (!unsaved.dirty) {
                onClose();
                return;
              }
              void (async () => {
                if (await unsaved.confirmDiscard('关闭卷编辑')) onClose();
              })();
            }}
          >
            关闭
          </button>
        </header>
        <label>
          标题
          <input data-structure-title name="title" defaultValue={volume?.title ?? ''} required />
        </label>
        <label data-structure-status-field hidden={!volume}>
          状态
          <select data-structure-status name="status" defaultValue={volume?.status ?? 'pending'}>
            {(['pending', 'outlined', 'writing', 'reviewing', 'finalized'] as const).map(
              (statusValue) => (
                <option key={statusValue} value={statusValue}>
                  {statusLabel(statusValue)}
                </option>
              ),
            )}
          </select>
        </label>
        <p className="feature-status" data-structure-form-status>
          {command.error ? authorErrorSummary(command.error) : ''}
        </p>
        <footer>
          <button
            className="primary-button"
            data-save-structure
            disabled={command.pending}
            type="submit"
          >
            保存
          </button>
        </footer>
      </form>
    </dialog>
  );
}
