import { useCallback, useState, type FormEvent } from 'react';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeCommand, useBridgeQuery } from '../../bridge/use-bridge-resource.js';
import {
  ChapterNameSelect,
  COMMON_STATE_FIELDS,
  EntityNameSelect,
  FinalVersionSelect,
  parseAuthorValue,
  timelinePrecisionLabel,
  useCanonAuthorReferences,
} from './canon-author-fields.js';

import { authorErrorSummary } from '../../presentation/author-error-message.js';
export function ContinuityRelationshipEditor({
  bridge,
  projectId,
  readOnly,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
}) {
  const load = useCallback(
    () =>
      bridge.continuity.list(
        {
          projectId,
          query: '',
          includeHistory: true,
          includeArchivedEvents: true,
          effectiveAtChapterId: null,
        },
        { mode: 'replace' },
      ),
    [bridge, projectId],
  );
  const resource = useBridgeQuery(`continuity-relations:${projectId}`, load);
  const command = useBridgeCommand(resource.refresh);
  const references = useCanonAuthorReferences(bridge, projectId);
  const [editingTimelineEventId, setEditingTimelineEventId] = useState<string | null>(null);
  const [status, setStatus] = useState(
    '完整关系编辑会保留证据锚点、人物角色和事件依赖，不再固定为空数组。',
  );
  const editingTimelineEvent =
    resource.data?.timelineEvents.find((item) => item.id === editingTimelineEventId) ?? null;

  const saveState = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const stateKey = String(values.get('stateKey') ?? '');
    const field = COMMON_STATE_FIELDS.find((item) => item.key === stateKey);
    if (!field) {
      setStatus('请选择要记录的动态状态。');
      return;
    }
    let value: Parameters<RendererBridgeAdapter['continuity']['setEntityState']>[0]['value'];
    try {
      value = parseAuthorValue(field.valueType, String(values.get('value') ?? '')) as typeof value;
    } catch {
      setStatus('动态状态内容格式不正确，请根据字段提示修改。');
      return;
    }
    const sourceVersionId = String(values.get('sourceVersionId') ?? '');
    const result = await command.run(() =>
      bridge.continuity.setEntityState({
        projectId,
        authority: 'author',
        entityId: String(values.get('entityId') ?? '').trim(),
        stateKey,
        value,
        validFromChapterId: String(values.get('validFromChapterId') ?? '').trim(),
        validUntilChapterId: nullableString(values.get('validUntilChapterId')),
        sourceVersionId,
        evidence: [
          {
            kind: 'version',
            targetId: sourceVersionId,
            note: String(values.get('evidenceNote') ?? '').trim(),
          },
        ],
      }),
    );
    if (result) {
      event.currentTarget.reset();
      setStatus('动态状态已保存，并绑定所选定稿版本作为依据。');
    }
  };

  const saveTimeline = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const participantIds = selectedValues(values, 'participantIds');
    const witnessIds = selectedValues(values, 'witnessIds');
    const subjectIds = selectedValues(values, 'subjectIds');
    const dependencyIds = selectedValues(values, 'dependencyIds');
    const eventId = editingTimelineEvent?.id ?? null;
    const result = await command.run(() =>
      bridge.continuity.saveTimelineEvent({
        projectId,
        authority: 'author',
        eventId,
        title: String(values.get('title') ?? '').trim(),
        startValue: String(values.get('startValue') ?? '').trim(),
        endValue: nullableString(values.get('endValue')),
        precision: String(values.get('precision') ?? 'unknown') as Parameters<
          RendererBridgeAdapter['continuity']['saveTimelineEvent']
        >[0]['precision'],
        chapterId: nullableString(values.get('chapterId')),
        locationId: nullableString(values.get('locationId')),
        description: String(values.get('description') ?? ''),
        participantIds,
        witnessIds,
        subjectIds,
        dependencyIds,
      }),
    );
    if (result) {
      setEditingTimelineEventId(null);
      setStatus(
        `${eventId ? '时间线事件已更新' : '时间线事件已创建'}：参与者 ${participantIds.length}、见证者 ${witnessIds.length}、主体 ${subjectIds.length}、依赖 ${dependencyIds.length}。`,
      );
    }
  };

  return (
    <section className="relationship-editor feature-card" data-continuity-relationship-editor>
      <header className="feature-card__heading">
        <div>
          <h2>完整连续性关系编辑</h2>
          <p>用于需要证据锚点、人物角色和事件依赖的专业录入。</p>
        </div>
      </header>
      <p className="feature-status" role="status">
        {resource.error
          ? `连续性读取失败 · ${authorErrorSummary(resource.error)}`
          : command.error
            ? `写入失败 · ${authorErrorSummary(command.error)} · ${command.error.message}`
            : status}
      </p>
      <div className="relationship-editor-grid">
        <details open>
          <summary>动态状态与证据锚点</summary>
          <form className="stacked-form" onSubmit={(event) => void saveState(event)}>
            <label>
              人物或设定
              <EntityNameSelect name="entityId" references={references} required />
            </label>
            <label>
              状态字段
              <select name="stateKey" defaultValue="" required>
                <option value="" disabled>
                  请选择
                </option>
                {COMMON_STATE_FIELDS.map((field) => (
                  <option key={field.key} value={field.key}>
                    {field.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              状态内容
              <textarea name="value" placeholder="按字段填写文字、数字或多行清单" required />
            </label>
            <label>
              从哪一章开始有效
              <ChapterNameSelect name="validFromChapterId" references={references} required />
            </label>
            <label>
              到哪一章结束（可选）
              <ChapterNameSelect name="validUntilChapterId" references={references} />
            </label>
            <label>
              依据的定稿版本
              <FinalVersionSelect name="sourceVersionId" references={references} required />
            </label>
            <label>
              依据说明
              <textarea name="evidenceNote" placeholder="例如：本章结尾已明确人物负伤" />
            </label>
            <button disabled={readOnly || command.pending} type="submit">
              保存完整动态状态
            </button>
          </form>
        </details>

        <details open>
          <summary>时间线人物角色与依赖</summary>
          <label>
            编辑已有事件
            <select
              data-timeline-event-editor-selector
              value={editingTimelineEventId ?? ''}
              onChange={(event) => setEditingTimelineEventId(event.currentTarget.value || null)}
            >
              <option value="">新建事件</option>
              {resource.data?.timelineEvents
                .filter((item) => item.status === 'active')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
            </select>
          </label>
          <form
            key={editingTimelineEvent?.id ?? 'new'}
            className="stacked-form"
            data-timeline-event-editor={editingTimelineEvent?.id ?? 'new'}
            onSubmit={(event) => void saveTimeline(event)}
          >
            <label>
              标题
              <input name="title" defaultValue={editingTimelineEvent?.title ?? ''} required />
            </label>
            <label>
              起始值
              <input
                name="startValue"
                defaultValue={editingTimelineEvent?.startValue ?? ''}
                required
              />
            </label>
            <label>
              结束值
              <input name="endValue" defaultValue={editingTimelineEvent?.endValue ?? ''} />
            </label>
            <label>
              精度
              <select name="precision" defaultValue={editingTimelineEvent?.precision ?? 'unknown'}>
                {['exact', 'day', 'month', 'year', 'approximate', 'unknown'].map((value) => (
                  <option key={value} value={value}>
                    {timelinePrecisionLabel(value)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              关联章节
              <ChapterNameSelect
                name="chapterId"
                references={references}
                defaultValue={editingTimelineEvent?.chapterId ?? ''}
              />
            </label>
            <label>
              发生地点
              <EntityNameSelect
                entityType="location"
                name="locationId"
                references={references}
                defaultValue={editingTimelineEvent?.locationId ?? ''}
              />
            </label>
            <label>
              说明
              <textarea name="description" defaultValue={editingTimelineEvent?.description ?? ''} />
            </label>
            <label>
              参与者
              <EntityMultiSelect
                name="participantIds"
                references={references}
                defaultValue={editingTimelineEvent?.participantIds}
              />
            </label>
            <label>
              见证者
              <EntityMultiSelect
                name="witnessIds"
                references={references}
                defaultValue={editingTimelineEvent?.witnessIds}
              />
            </label>
            <label>
              事件主体
              <EntityMultiSelect
                name="subjectIds"
                references={references}
                defaultValue={editingTimelineEvent?.subjectIds}
              />
            </label>
            <label>
              前置事件
              <select
                multiple
                name="dependencyIds"
                defaultValue={editingTimelineEvent?.dependencyIds ?? []}
              >
                {resource.data?.timelineEvents
                  .filter(
                    (item) => item.status === 'active' && item.id !== editingTimelineEvent?.id,
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
              </select>
            </label>
            <button disabled={readOnly || command.pending} type="submit">
              {editingTimelineEvent ? '更新完整时间线事件' : '保存完整时间线事件'}
            </button>
          </form>
        </details>
      </div>

      <div className="relationship-summary">
        <strong>当前关系概览</strong>
        <span>
          状态证据{' '}
          {resource.data?.entityStates.reduce((sum, item) => sum + item.evidence.length, 0) ?? 0}
        </span>
        <span>
          时间线人物关系{' '}
          {resource.data?.timelineEvents.reduce(
            (sum, item) =>
              sum + item.participantIds.length + item.witnessIds.length + item.subjectIds.length,
            0,
          ) ?? 0}
        </span>
        <span>
          事件依赖{' '}
          {resource.data?.timelineEvents.reduce(
            (sum, item) => sum + item.dependencyIds.length,
            0,
          ) ?? 0}
        </span>
      </div>
    </section>
  );
}

function EntityMultiSelect({
  name,
  references,
  defaultValue,
}: {
  readonly name: string;
  readonly references: ReturnType<typeof useCanonAuthorReferences>;
  readonly defaultValue?: readonly string[];
}) {
  return (
    <select multiple name={name} defaultValue={defaultValue ? [...defaultValue] : []}>
      {references.entities.map((entity) => (
        <option key={entity.id} value={entity.id}>
          {entity.name}
        </option>
      ))}
    </select>
  );
}

function selectedValues(values: FormData, name: string): string[] {
  return [...new Set(values.getAll(name).map(String).filter(Boolean))];
}

function nullableString(value: FormDataEntryValue | null): string | null {
  const result = String(value ?? '').trim();
  return result || null;
}
