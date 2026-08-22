import type { FormEvent } from 'react';

import type { LifecycleStatus, PlotNode, PlotNodeType } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../../bridge/renderer-bridge-adapter.js';
import { useBridgeCommand } from '../../../bridge/use-bridge-resource.js';
import { authorErrorSummary } from '../../../presentation/author-error-message.js';
import { useUnsavedChangesGuard } from '../../../runtime/unsaved-changes.js';
import { lifecycleStatusLabel } from '../planning-form-values.js';

export function PlotNodeDialog({
  bridge,
  editor,
  projectId,
  onClose,
  onSaved,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly editor: { readonly node?: PlotNode; readonly parentId: string | null };
  readonly projectId: string;
  readonly onClose: () => void;
  readonly onSaved: () => Promise<void>;
}) {
  const command = useBridgeCommand();
  const unsaved = useUnsavedChangesGuard('大纲节点');
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const fields = {
      nodeType: String(values.get('nodeType')) as PlotNodeType,
      title: String(values.get('title') ?? ''),
      goal: String(values.get('goal') ?? ''),
      coreConflict: String(values.get('coreConflict') ?? ''),
      expectedResult: String(values.get('expectedResult') ?? ''),
      status: String(values.get('status')) as LifecycleStatus,
    };
    const result = editor.node
      ? await command.run(() =>
          bridge.planning.updatePlotNode({ projectId, nodeId: editor.node!.id, patch: fields }),
        )
      : await command.run(() =>
          bridge.planning.createPlotNode({ projectId, parentId: editor.parentId, ...fields }),
        );
    if (result) {
      unsaved.clearDirty();
      await onSaved();
    }
  };

  return (
    <dialog className="react-dialog" data-plot-node-dialog open>
      <form
        className="stacked-form"
        data-unsaved={unsaved.dirty ? 'true' : 'false'}
        onChange={unsaved.markDirty}
        onSubmit={(event) => void submit(event)}
      >
        <header>
          <h2>{editor.node ? '编辑大纲节点' : '新建大纲节点'}</h2>
          <button
            type="button"
            disabled={command.pending}
            onClick={() => {
              if (!unsaved.dirty) {
                onClose();
                return;
              }
              void (async () => {
                if (await unsaved.confirmDiscard('关闭大纲节点编辑')) onClose();
              })();
            }}
          >
            关闭
          </button>
        </header>
        <label>
          类型
          <select name="nodeType" defaultValue={editor.node?.nodeType ?? 'chapter'}>
            <option value="volume">卷</option>
            <option value="arc">弧光</option>
            <option value="chapter">章节</option>
          </select>
        </label>
        <label>
          标题
          <input name="title" defaultValue={editor.node?.title ?? ''} required />
        </label>
        <label>
          目标
          <textarea name="goal" defaultValue={editor.node?.goal ?? ''} />
        </label>
        <label>
          核心冲突
          <textarea name="coreConflict" defaultValue={editor.node?.coreConflict ?? ''} />
        </label>
        <label>
          预期结果
          <textarea name="expectedResult" defaultValue={editor.node?.expectedResult ?? ''} />
        </label>
        <label>
          状态
          <select name="status" defaultValue={editor.node?.status ?? 'pending'}>
            {['pending', 'outlined', 'writing', 'reviewing', 'finalized'].map((status) => (
              <option key={status} value={status}>
                {lifecycleStatusLabel(status as LifecycleStatus)}
              </option>
            ))}
          </select>
        </label>
        <button
          className="primary-button"
          data-save-plot-node
          disabled={command.pending}
          type="submit"
        >
          保存
        </button>
        {command.error ? <p className="form-error">{authorErrorSummary(command.error)}</p> : null}
      </form>
    </dialog>
  );
}
