import { useCallback, useEffect, useState, type FormEvent } from 'react';

import type { EntityType } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeCommand, useBridgeQuery } from '../../bridge/use-bridge-resource.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import { authorJsonValue } from '../../presentation/author-value-format.js';
import {
  confirmRegisteredUnsavedChanges,
  useUnsavedChangesGuard,
} from '../../runtime/unsaved-changes.js';
import {
  authorFactLabel,
  COMMON_FACT_FIELDS,
  parseAuthorValue,
  recordStatusLabel,
  type AuthorValueType,
} from './canon-author-fields.js';
import { lineValues } from './canon-panel-shared.js';

const ENTITY_TYPE_OPTIONS: readonly { readonly value: EntityType; readonly label: string }[] = [
  { value: 'character', label: '人物' },
  { value: 'location', label: '地点' },
  { value: 'faction', label: '组织与阵营' },
  { value: 'item', label: '物品' },
  { value: 'ability', label: '能力' },
  { value: 'rule', label: '世界规则' },
  { value: 'event', label: '重要事件' },
  { value: 'custom', label: '其他' },
];

function entityTypeLabel(type: EntityType): string {
  return ENTITY_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

export function EntityCanonPanel({
  bridge,
  projectId,
  readOnly,
  selectedEntityId,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly selectedEntityId?: string | null;
}) {
  const load = useCallback(
    () => bridge.canon.list({ projectId, includeArchived: true }, { mode: 'replace' }),
    [bridge, projectId],
  );
  const resource = useBridgeQuery(`canon:${projectId}`, load);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newEntity, setNewEntity] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const command = useBridgeCommand(resource.refresh);
  const entityUnsaved = useUnsavedChangesGuard('设定条目');
  const factUnsaved = useUnsavedChangesGuard('设定事实');
  const selected = resource.data?.entities.find((entity) => entity.id === selectedId) ?? null;

  const confirmEditorDiscard = (action: string): boolean => {
    if (!entityUnsaved.dirty && !factUnsaved.dirty) return true;
    if (!confirmRegisteredUnsavedChanges(action)) {
      setNotice('已保留当前设定的未保存修改。');
      return false;
    }
    entityUnsaved.clearDirty();
    factUnsaved.clearDirty();
    return true;
  };

  useEffect(() => {
    if (
      selectedEntityId &&
      resource.data?.entities.some((entity) => entity.id === selectedEntityId)
    ) {
      setSelectedId(selectedEntityId);
      setNewEntity(false);
      return;
    }
    if (!selectedId && resource.data?.entities[0]) setSelectedId(resource.data.entities[0].id);
  }, [resource.data, selectedEntityId, selectedId]);

  const saveEntity = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const fields = {
      entityType: String(values.get('entityType')) as EntityType,
      name: String(values.get('name') ?? ''),
      aliases: lineValues(values.get('aliases')),
      summary: String(values.get('summary') ?? ''),
    };
    const result =
      selected && !newEntity
        ? await command.run(() =>
            bridge.canon.update({
              projectId,
              authority: 'author',
              entityId: selected.id,
              patch: fields,
            }),
          )
        : await command.run(() =>
            bridge.canon.create({ projectId, authority: 'author', ...fields }),
          );
    if (result) {
      entityUnsaved.clearDirty();
      const match = result.entities.find((entity) => entity.name === fields.name);
      setSelectedId(match?.id ?? null);
      setNewEntity(false);
      setNotice('设定条目已写入作品数据库。');
    }
  };

  const setFact = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!selected) return;
    const values = new FormData(event.currentTarget);
    const selectedFactKey = String(values.get('factKey') ?? '');
    const factKey =
      selectedFactKey === 'custom'
        ? String(values.get('customFactKey') ?? '').trim()
        : selectedFactKey;
    if (!factKey) {
      setNotice('请填写自定义事实名称。');
      return;
    }
    let value: Parameters<RendererBridgeAdapter['canon']['setFact']>[0]['value'];
    try {
      value = parseAuthorValue(
        String(values.get('valueType') ?? 'text') as AuthorValueType,
        String(values.get('value') ?? ''),
      ) as typeof value;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '事实值格式不正确。');
      return;
    }
    const result = await command.run(() =>
      bridge.canon.setFact({
        projectId,
        authority: 'author',
        entityId: selected.id,
        factKey,
        value,
        description: String(values.get('description') ?? ''),
        sourceType: 'author',
        sourceId: null,
      }),
    );
    if (result) {
      factUnsaved.clearDirty();
      event.currentTarget.reset();
      setNotice('静态事实已确认；同一事实键的旧值保留为历史记录。');
    }
  };

  const archive = async (): Promise<void> => {
    if (!selected || !confirmEditorDiscard('归档当前设定条目')) return;
    if (!window.confirm(`归档“${selected.name}”？`)) return;
    const result = await command.run(() =>
      bridge.canon.archive({ projectId, authority: 'author', entityId: selected.id }),
    );
    if (result) setNotice('设定条目已归档；永久删除仍需通过引用预览与名称确认。');
  };

  const remove = async (): Promise<void> => {
    if (!selected || selected.status !== 'archived' || !confirmEditorDiscard('永久删除当前设定条目')) {
      return;
    }
    const preview = await command.run(() =>
      bridge.canon.previewDelete({ projectId, entityId: selected.id }),
    );
    if (!preview) return;
    if (!preview.canDelete) {
      setNotice(`禁止删除：${preview.blockers.join('；')}`);
      return;
    }
    const confirmation = window.prompt(`输入实体名称“${selected.name}”确认永久删除：`);
    if (confirmation !== selected.name) {
      setNotice('名称确认不匹配，已取消永久删除。');
      return;
    }
    const result = await command.run(() =>
      bridge.canon.delete({
        projectId,
        authority: 'author',
        entityId: selected.id,
        confirmName: selected.name,
      }),
    );
    if (result) {
      setSelectedId(null);
      setNotice('设定条目已永久删除。');
    }
  };

  return (
    <div className="canon-grid">
      <aside className="feature-card">
        <div className="feature-card__heading">
          <h2>设定条目</h2>
          <button
            className="primary-button"
            data-new-entity
            disabled={readOnly}
            type="button"
            onClick={() => {
              if (!confirmEditorDiscard('新建设定条目')) return;
              setNewEntity(true);
              setSelectedId(null);
            }}
          >
            新建
          </button>
        </div>
        <label>
          选择设定条目
          <select
            data-canon-entity-select
            value={selectedId ?? ''}
            onChange={(event) => {
              if (!confirmEditorDiscard('切换设定条目')) return;
              setNewEntity(false);
              setSelectedId(event.target.value || null);
            }}
          >
            <option value="">未选择</option>
            {resource.data?.entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name} · {entityTypeLabel(entity.entityType)}
                {entity.status === 'archived' ? ' · 已归档' : ''}
              </option>
            ))}
          </select>
        </label>
        <p className="feature-status" data-canon-status>
          {command.error
            ? `${command.error.message} · ${authorErrorSummary(command.error)}`
            : notice
              ? notice
              : resource.state === 'loading'
                ? '正在读取人物与设定…'
                : `实体 ${resource.data?.entities.length ?? 0}`}
        </p>
      </aside>
      <main className="feature-card">
        <h2 data-canon-entity-mode>
          {newEntity ? '新建设定条目' : selected ? `编辑：${selected.name}` : '选择一个设定条目'}
        </h2>
        {newEntity || selected ? (
          <form
            className="stacked-form"
            data-canon-entity-form
            data-unsaved={entityUnsaved.dirty ? 'true' : 'false'}
            key={newEntity ? 'new' : selected?.id}
            onChange={entityUnsaved.markDirty}
            onSubmit={(event) => void saveEntity(event)}
          >
            <label>
              类型
              <select name="entityType" defaultValue={selected?.entityType ?? 'character'}>
                {ENTITY_TYPE_OPTIONS.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              名称
              <input name="name" defaultValue={selected?.name ?? ''} required />
            </label>
            <label>
              别名（每行一个）
              <textarea name="aliases" defaultValue={selected?.aliases.join('\n') ?? ''} />
            </label>
            <label>
              摘要
              <textarea name="summary" defaultValue={selected?.summary ?? ''} />
            </label>
            <div className="inline-actions">
              <button
                className="primary-button"
                data-canon-write
                disabled={readOnly || command.pending}
                type="submit"
              >
                保存设定条目
              </button>
              {selected ? (
                <button
                  data-archive-entity
                  disabled={readOnly || command.pending || selected.status === 'archived'}
                  type="button"
                  onClick={() => void archive()}
                >
                  归档
                </button>
              ) : null}
              {selected ? (
                <button
                  data-delete-entity
                  disabled={readOnly || command.pending || selected.status !== 'archived'}
                  type="button"
                  onClick={() => void remove()}
                >
                  永久删除
                </button>
              ) : null}
            </div>
          </form>
        ) : null}
      </main>
      <aside className="feature-card">
        <h2>已确认事实</h2>
        <div data-canon-fact-list>
          {selected?.facts.length ? (
            selected.facts.map((fact) => (
              <article className="feature-row" key={fact.id}>
                <div>
                  <strong>{authorFactLabel(fact.factKey)}</strong>
                  <span>
                    {recordStatusLabel(fact.status)} · {authorJsonValue(fact.value)}
                  </span>
                </div>
                <p>{fact.description}</p>
              </article>
            ))
          ) : (
            <p>暂无事实。</p>
          )}
        </div>
        {selected ? (
          <form
            className="stacked-form"
            data-canon-fact-form
            data-unsaved={factUnsaved.dirty ? 'true' : 'false'}
            onChange={factUnsaved.markDirty}
            onSubmit={(event) => void setFact(event)}
          >
            <label>
              事实类型
              <select name="factKey" defaultValue="appearance">
                {COMMON_FACT_FIELDS.map((field) => (
                  <option key={field.key} value={field.key}>
                    {field.label}
                  </option>
                ))}
                <option value="custom">其他自定义事实</option>
              </select>
            </label>
            <label>
              内容形式
              <select name="valueType" defaultValue="text">
                <option value="text">文字</option>
                <option value="number">数字</option>
                <option value="boolean">是 / 否</option>
                <option value="list">多项内容</option>
                <option value="json">原始JSON（高级）</option>
              </select>
            </label>
            <label>
              内容
              <textarea name="value" placeholder="多项内容可用换行或顿号分隔" required />
            </label>
            <details>
              <summary>高级自定义字段</summary>
              <label>
                自定义事实名称
                <input name="customFactKey" />
              </label>
              <p>复杂结构请选择上方“原始JSON（高级）”，普通作者无需使用。</p>
            </details>
            <label>
              说明
              <textarea name="description" />
            </label>
            <button
              className="primary-button"
              data-canon-write
              disabled={readOnly || command.pending}
              type="submit"
            >
              确认事实
            </button>
          </form>
        ) : null}
      </aside>
    </div>
  );
}
