import type { FormEvent } from 'react';

import type { Chapter, LifecycleStatus, ProjectStructure, Volume } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeCommand } from '../../bridge/use-bridge-resource.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import { useUnsavedChangesGuard } from '../../runtime/unsaved-changes.js';
import { nullableNumber, statusLabel } from './structure-formatters.js';

interface ChapterEditorDialogProps {
  readonly bridge: RendererBridgeAdapter;
  readonly chapter: Chapter | null;
  readonly projectId: string;
  readonly structure: ProjectStructure | null;
  readonly volume: Volume;
  readonly onClose: () => void;
  readonly onSaved: () => Promise<void>;
}

export function ChapterEditorDialog({
  bridge,
  chapter,
  projectId,
  structure,
  volume,
  onClose,
  onSaved,
}: ChapterEditorDialogProps) {
  const command = useBridgeCommand();
  const unsaved = useUnsavedChangesGuard('章节信息');

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const title = String(values.get('title') ?? '').trim();
    const status = String(values.get('status') ?? 'pending') as LifecycleStatus;
    const targetVolumeId = String(values.get('volumeId') ?? volume.id);
    if (!chapter) {
      const result = await command.run(() =>
        bridge.planning.createChapter({ projectId, volumeId: volume.id, title }),
      );
      if (result) {
        unsaved.clearDirty();
        await onSaved();
      }
      return;
    }
    const minimum = nullableNumber(values.get('targetWordMin'));
    const maximum = nullableNumber(values.get('targetWordMax'));
    const result = await command.run(async () => {
      const updated = await bridge.planning.updateChapter({
        projectId,
        chapterId: chapter.id,
        patch: { title, status, targetWordMin: minimum, targetWordMax: maximum },
      });
      if (updated.state !== 'success' || targetVolumeId === volume.id) return updated;
      return bridge.planning.moveChapter({
        projectId,
        chapterId: chapter.id,
        targetVolumeId,
        placement: { kind: 'end' },
      });
    });
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
          <h2 data-structure-dialog-title>{chapter ? '编辑章节' : '新建章节'}</h2>
          <button
            type="button"
            disabled={command.pending}
            onClick={() => {
              if (unsaved.confirmDiscard('关闭章节编辑')) onClose();
            }}
          >
            关闭
          </button>
        </header>
        <label>
          标题
          <input data-structure-title name="title" defaultValue={chapter?.title ?? ''} required />
        </label>
        <label data-structure-status-field hidden={!chapter}>
          状态
          <select data-structure-status name="status" defaultValue={chapter?.status ?? 'pending'}>
            {(['pending', 'outlined', 'writing', 'reviewing', 'finalized'] as const).map(
              (statusValue) => (
                <option key={statusValue} value={statusValue}>
                  {statusLabel(statusValue)}
                </option>
              ),
            )}
          </select>
        </label>
        <label data-structure-volume-field hidden={!chapter}>
          所属卷
          <select data-structure-volume name="volumeId" defaultValue={volume.id}>
            {structure?.volumes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <div className="word-target-grid" data-structure-word-fields hidden={!chapter}>
          <label>
            目标最少字数
            <input
              name="targetWordMin"
              type="number"
              min="0"
              defaultValue={chapter?.targetWordMin ?? ''}
            />
          </label>
          <label>
            目标最多字数
            <input
              name="targetWordMax"
              type="number"
              min="0"
              defaultValue={chapter?.targetWordMax ?? ''}
            />
          </label>
        </div>
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
