import type { FormEvent } from 'react';

import type { Entity, PlotNode, SceneBeat, SceneBeatType } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../../bridge/renderer-bridge-adapter.js';
import { useBridgeCommand } from '../../../bridge/use-bridge-resource.js';
import { authorErrorSummary } from '../../../presentation/author-error-message.js';
import { authorSceneBeatTypeLabel } from '../../../presentation/author-value-format.js';
import { nullableString } from '../planning-form-values.js';

export function SceneBeatDialog({
  beat,
  bridge,
  chapterId,
  entities,
  plotNodes,
  projectId,
  convertingLogicalBlockIds,
  onClose,
  onSaved,
}: {
  readonly beat: SceneBeat | null;
  readonly bridge: RendererBridgeAdapter;
  readonly chapterId: string;
  readonly entities: readonly Entity[];
  readonly plotNodes: readonly PlotNode[];
  readonly projectId: string;
  readonly convertingLogicalBlockIds: readonly string[];
  readonly onClose: () => void;
  readonly onSaved: () => Promise<void>;
}) {
  const command = useBridgeCommand();
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const fields = {
      plotNodeId: nullableString(values.get('plotNodeId')),
      title: String(values.get('title') ?? ''),
      goal: String(values.get('goal') ?? ''),
      coreConflict: String(values.get('coreConflict') ?? ''),
      expectedResult: String(values.get('expectedResult') ?? ''),
      beatType: String(values.get('beatType')) as SceneBeatType,
      wordTargetPercent: Number(values.get('wordTargetPercent') ?? 0),
      required: values.get('required') === 'on',
      characterIds: values.getAll('characterChoices').map(String).filter(Boolean),
      locationIds: values.getAll('locationChoices').map(String).filter(Boolean),
    };
    const result = beat
      ? await command.run(() =>
          bridge.planning.updateSceneBeat({ projectId, sceneBeatId: beat.id, patch: fields }),
        )
      : convertingLogicalBlockIds.length
        ? await command.run(() =>
            bridge.planning.convertBlocksToSceneBeat({
              projectId,
              chapterId,
              logicalBlockIds: [...convertingLogicalBlockIds],
              ...fields,
            }),
          )
        : await command.run(() =>
            bridge.planning.createSceneBeat({ projectId, chapterId, ...fields }),
          );
    if (result) await onSaved();
  };
  const characters = entities.filter((entity) => entity.entityType === 'character');
  const locations = entities.filter((entity) => entity.entityType === 'location');

  return (
    <dialog className="react-dialog" data-scene-beat-dialog open>
      <form className="stacked-form" onSubmit={(event) => void submit(event)}>
        <header>
          <h2>
            {beat
              ? '编辑场景'
              : convertingLogicalBlockIds.length
                ? `从 ${convertingLogicalBlockIds.length} 个正文段落转换`
                : '新建场景'}
          </h2>
          <button type="button" disabled={command.pending} onClick={onClose}>
            关闭
          </button>
        </header>
        <label>
          标题
          <input name="title" defaultValue={beat?.title ?? ''} required />
        </label>
        <label>
          类型
          <select name="beatType" defaultValue={beat?.beatType ?? 'development'}>
            {['setup', 'development', 'turn', 'climax', 'resolution', 'custom'].map((type) => (
              <option key={type} value={type}>
                {authorSceneBeatTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <label>
          大纲节点
          <select name="plotNodeId" defaultValue={beat?.plotNodeId ?? ''}>
            <option value="">未关联</option>
            {plotNodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          目标字数占比
          <input
            name="wordTargetPercent"
            type="number"
            min="0"
            max="100"
            defaultValue={beat?.wordTargetPercent ?? 0}
          />
        </label>
        <label>
          人物
          <select
            data-scene-beat-entity-selector="character"
            multiple
            name="characterChoices"
            defaultValue={beat?.characterIds ?? []}
          >
            {characters.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
              </option>
            ))}
          </select>
        </label>
        <textarea
          hidden
          name="characterIds"
          readOnly
          value={(beat?.characterIds ?? []).join('\n')}
          aria-label="人物ID兼容视图"
        />
        <label>
          地点
          <select
            data-scene-beat-entity-selector="location"
            multiple
            name="locationChoices"
            defaultValue={beat?.locationIds ?? []}
          >
            {locations.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
              </option>
            ))}
          </select>
        </label>
        <textarea
          hidden
          name="locationIds"
          readOnly
          value={(beat?.locationIds ?? []).join('\n')}
          aria-label="地点ID兼容视图"
        />
        <label>
          目标
          <textarea name="goal" defaultValue={beat?.goal ?? ''} />
        </label>
        <label>
          核心冲突
          <textarea name="coreConflict" defaultValue={beat?.coreConflict ?? ''} />
        </label>
        <label>
          预期结果
          <textarea name="expectedResult" defaultValue={beat?.expectedResult ?? ''} />
        </label>
        <label className="checkbox-row">
          <input name="required" type="checkbox" defaultChecked={beat?.required ?? false} />
          必须完成
        </label>
        <button
          className="primary-button"
          data-save-scene-beat
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
