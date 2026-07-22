import { useCallback, useState, type FormEvent } from 'react';

import type { EvidenceAnchor } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeCommand, useBridgeQuery } from '../../bridge/use-bridge-resource.js';

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
  const [status, setStatus] = useState(
    '完整关系编辑会保留证据锚点、人物角色和事件依赖，不再固定为空数组。',
  );

  const saveState = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    let value: Parameters<RendererBridgeAdapter['continuity']['setEntityState']>[0]['value'];
    try {
      value = JSON.parse(String(values.get('value') ?? 'null')) as typeof value;
    } catch {
      setStatus('动态状态值必须是有效JSON。');
      return;
    }
    const evidence = parseEvidence(String(values.get('evidence') ?? ''));
    if (!evidence) {
      setStatus('证据格式无效。每行使用：kind | targetId | note。');
      return;
    }
    const result = await command.run(() =>
      bridge.continuity.setEntityState({
        projectId,
        authority: 'author',
        entityId: String(values.get('entityId') ?? '').trim(),
        stateKey: String(values.get('stateKey') ?? '').trim(),
        value,
        validFromChapterId: String(values.get('validFromChapterId') ?? '').trim(),
        validUntilChapterId: nullableString(values.get('validUntilChapterId')),
        sourceVersionId: String(values.get('sourceVersionId') ?? '').trim(),
        evidence,
      }),
    );
    if (result) {
      event.currentTarget.reset();
      setStatus(`动态状态已保存，证据锚点 ${evidence.length} 项。`);
    }
  };

  const saveTimeline = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const participantIds = uniqueLines(values.get('participantIds'));
    const witnessIds = uniqueLines(values.get('witnessIds'));
    const subjectIds = uniqueLines(values.get('subjectIds'));
    const dependencyIds = uniqueLines(values.get('dependencyIds'));
    const result = await command.run(() =>
      bridge.continuity.saveTimelineEvent({
        projectId,
        authority: 'author',
        eventId: null,
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
      event.currentTarget.reset();
      setStatus(
        `时间线事件已保存：参与者 ${participantIds.length}、见证者 ${witnessIds.length}、主体 ${subjectIds.length}、依赖 ${dependencyIds.length}。`,
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
          ? `连续性读取失败 · ${resource.error.code}`
          : command.error
            ? `写入失败 · ${command.error.code} · ${command.error.message}`
            : status}
      </p>
      <div className="relationship-editor-grid">
        <details open>
          <summary>动态状态与证据锚点</summary>
          <form className="stacked-form" onSubmit={(event) => void saveState(event)}>
            <label>
              实体UUID
              <input name="entityId" required />
            </label>
            <label>
              状态键
              <input name="stateKey" required />
            </label>
            <label>
              JSON值
              <textarea name="value" defaultValue="null" required />
            </label>
            <label>
              起始章节UUID
              <input name="validFromChapterId" required />
            </label>
            <label>
              结束章节UUID
              <input name="validUntilChapterId" />
            </label>
            <label>
              来源Version UUID
              <input name="sourceVersionId" required />
            </label>
            <label>
              证据锚点（每行 kind | targetId | note）
              <textarea
                name="evidence"
                placeholder="chapter | UUID | 首次明确出现\nlogicalBlock | block-id | 关键原文"
              />
            </label>
            <button disabled={readOnly || command.pending} type="submit">
              保存完整动态状态
            </button>
          </form>
        </details>

        <details open>
          <summary>时间线人物角色与依赖</summary>
          <form className="stacked-form" onSubmit={(event) => void saveTimeline(event)}>
            <label>
              标题
              <input name="title" required />
            </label>
            <label>
              起始值
              <input name="startValue" required />
            </label>
            <label>
              结束值
              <input name="endValue" />
            </label>
            <label>
              精度
              <select name="precision" defaultValue="unknown">
                {['exact', 'day', 'month', 'year', 'approximate', 'unknown'].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              章节UUID
              <input name="chapterId" />
            </label>
            <label>
              地点UUID
              <input name="locationId" />
            </label>
            <label>
              说明
              <textarea name="description" />
            </label>
            <label>
              参与者UUID（每行一个）
              <textarea name="participantIds" />
            </label>
            <label>
              见证者UUID（每行一个）
              <textarea name="witnessIds" />
            </label>
            <label>
              主体UUID（每行一个）
              <textarea name="subjectIds" />
            </label>
            <label>
              前置事件UUID（每行一个）
              <textarea name="dependencyIds" />
            </label>
            <button disabled={readOnly || command.pending} type="submit">
              保存完整时间线事件
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

function parseEvidence(value: string): EvidenceAnchor[] | null {
  const allowed = new Set(['chapter', 'sceneBeat', 'version', 'entity', 'logicalBlock']);
  const result: EvidenceAnchor[] = [];
  for (const line of nonEmptyLines(value)) {
    const [kind, targetId, note = ''] = line.split('|').map((item) => item.trim());
    if (!kind || !targetId || !allowed.has(kind)) return null;
    result.push({ kind: kind as EvidenceAnchor['kind'], targetId, note });
  }
  return result;
}

function uniqueLines(value: FormDataEntryValue | null): string[] {
  return [...new Set(nonEmptyLines(String(value ?? '')))];
}

function nonEmptyLines(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function nullableString(value: FormDataEntryValue | null): string | null {
  const result = String(value ?? '').trim();
  return result || null;
}
