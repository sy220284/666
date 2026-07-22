import { useCallback, useState, type FormEvent } from 'react';

import type {
  EvidenceAnchor,
  ForeshadowingChapterRole,
  ForeshadowingRelationKind,
  NarrativePlanningCatalog,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeCommand, useBridgeQuery } from '../../bridge/use-bridge-resource.js';
import {
  CanonWorkbench as CanonCoreWorkbench,
  type CanonSection,
} from './canon-core-workbench.js';

export type { CanonSection };

interface CanonWorkbenchProps {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly projectName: string;
  readonly readOnly: boolean;
  readonly section: CanonSection;
  readonly onSectionChange: (section: CanonSection) => void;
}

export function CanonWorkbench(props: CanonWorkbenchProps) {
  const loadHealth = useCallback(
    () =>
      props.bridge.canon.list(
        { projectId: props.projectId, includeArchived: true },
        { mode: 'replace' },
      ),
    [props.bridge, props.projectId],
  );
  const health = useBridgeQuery(`canon-health:${props.projectId}`, loadHealth);

  return (
    <section className="canon-complete-workbench">
      {health.error ? (
        <div className="safety-inline is-error" data-canon-read-error role="alert">
          实体与Canon读取失败 · {health.error.code} · {health.error.message}
          <button type="button" onClick={() => void health.refresh()}>
            重试
          </button>
        </div>
      ) : health.state === 'cancelled' ? (
        <div className="safety-inline" role="status">
          实体与Canon读取已取消。
        </div>
      ) : null}

      <CanonCoreWorkbench {...props} />

      {props.section === 'continuity' ? (
        <ContinuityRelationshipEditor
          bridge={props.bridge}
          projectId={props.projectId}
          readOnly={props.readOnly}
        />
      ) : null}
      {props.section === 'narrative' ? (
        <NarrativeRelationshipEditor
          bridge={props.bridge}
          projectId={props.projectId}
          readOnly={props.readOnly}
        />
      ) : null}
    </section>
  );
}

function ContinuityRelationshipEditor({
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
    let value: unknown;
    try {
      value = JSON.parse(String(values.get('value') ?? 'null'));
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

function NarrativeRelationshipEditor({
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
      bridge.narrativePlanning.list(
        { projectId, query: '', includeResolved: true, referenceChapterId: null },
        { mode: 'replace' },
      ),
    [bridge, projectId],
  );
  const resource = useBridgeQuery(`narrative-relations:${projectId}`, load);
  const command = useBridgeCommand(resource.refresh);
  const [status, setStatus] = useState(
    '完整叙事关系编辑会保存章节锚点、伏笔关系和弧光依赖。',
  );

  const saveForeshadowing = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const chapterLinks = parseChapterLinks(String(values.get('chapterLinks') ?? ''));
    const relations = parseForeshadowingRelations(String(values.get('relations') ?? ''));
    if (!chapterLinks || !relations) {
      setStatus('章节锚点或关系格式无效，请按提示逐行填写。');
      return;
    }
    const result = await command.run(() =>
      bridge.narrativePlanning.saveForeshadowing({
        projectId,
        authority: 'author',
        foreshadowingId: null,
        title: String(values.get('title') ?? '').trim(),
        description: String(values.get('description') ?? ''),
        revealFromChapterId: nullableString(values.get('revealFromChapterId')),
        revealByChapterId: nullableString(values.get('revealByChapterId')),
        chapterLinks,
        relations,
      }),
    );
    if (result) {
      event.currentTarget.reset();
      setStatus(`伏笔已保存：章节锚点 ${chapterLinks.length}、关系 ${relations.length}。`);
    }
  };

  const saveMilestone = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const arcId = String(values.get('arcId') ?? '').trim();
    const arc = resource.data?.characterArcs.find((item) => item.id === arcId);
    const dependencyMilestoneIds = uniqueLines(values.get('dependencyMilestoneIds'));
    const dependencyTimelineEventIds = uniqueLines(values.get('dependencyTimelineEventIds'));
    const result = await command.run(() =>
      bridge.narrativePlanning.saveArcMilestone({
        projectId,
        authority: 'author',
        milestoneId: null,
        arcId,
        title: String(values.get('title') ?? '').trim(),
        description: String(values.get('description') ?? ''),
        sortIndex: arc?.milestones.length ?? 0,
        plannedChapterId: nullableString(values.get('plannedChapterId')),
        dependencyMilestoneIds,
        dependencyTimelineEventIds,
      }),
    );
    if (result) {
      event.currentTarget.reset();
      setStatus(
        `弧光节点已保存：节点依赖 ${dependencyMilestoneIds.length}、时间线依赖 ${dependencyTimelineEventIds.length}。`,
      );
    }
  };

  return (
    <section className="relationship-editor feature-card" data-narrative-relationship-editor>
      <header className="feature-card__heading">
        <div>
          <h2>完整伏笔与弧光关系编辑</h2>
          <p>用于章节锚定、伏笔依赖/互斥和弧光节点依赖。</p>
        </div>
      </header>
      <p className="feature-status" role="status">
        {resource.error
          ? `叙事规划读取失败 · ${resource.error.code}`
          : command.error
            ? `写入失败 · ${command.error.code} · ${command.error.message}`
            : status}
      </p>
      <div className="relationship-editor-grid">
        <details open>
          <summary>伏笔章节锚点与关系</summary>
          <form className="stacked-form" onSubmit={(event) => void saveForeshadowing(event)}>
            <label>
              标题
              <input name="title" required />
            </label>
            <label>
              说明
              <textarea name="description" />
            </label>
            <label>
              最早回收章节UUID
              <input name="revealFromChapterId" />
            </label>
            <label>
              最晚回收章节UUID
              <input name="revealByChapterId" />
            </label>
            <label>
              章节锚点（每行 chapterId | role）
              <textarea
                name="chapterLinks"
                placeholder="UUID | plant\nUUID | reinforce\nUUID | reveal"
              />
            </label>
            <label>
              伏笔关系（每行 targetForeshadowingId | kind）
              <textarea
                name="relations"
                placeholder="UUID | depends_on\nUUID | mutually_exclusive"
              />
            </label>
            <button disabled={readOnly || command.pending} type="submit">
              保存完整伏笔
            </button>
          </form>
        </details>

        <details open>
          <summary>弧光节点依赖</summary>
          <form className="stacked-form" onSubmit={(event) => void saveMilestone(event)}>
            <label>
              所属弧光
              <select name="arcId" required defaultValue="">
                <option value="" disabled>
                  选择弧光
                </option>
                {resource.data?.characterArcs.map((arc) => (
                  <option key={arc.id} value={arc.id}>
                    {arc.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              节点标题
              <input name="title" required />
            </label>
            <label>
              说明
              <textarea name="description" />
            </label>
            <label>
              计划章节UUID
              <input name="plannedChapterId" />
            </label>
            <label>
              前置弧光节点UUID（每行一个）
              <textarea name="dependencyMilestoneIds" />
            </label>
            <label>
              前置时间线事件UUID（每行一个）
              <textarea name="dependencyTimelineEventIds" />
            </label>
            <button disabled={readOnly || command.pending} type="submit">
              保存完整弧光节点
            </button>
          </form>
        </details>
      </div>
      <NarrativeRelationshipSummary catalog={resource.data} />
    </section>
  );
}

function NarrativeRelationshipSummary({
  catalog,
}: {
  readonly catalog: NarrativePlanningCatalog | null;
}) {
  return (
    <div className="relationship-summary">
      <strong>当前关系概览</strong>
      <span>
        伏笔章节锚点{' '}
        {catalog?.foreshadowings.reduce((sum, item) => sum + item.chapterLinks.length, 0) ?? 0}
      </span>
      <span>
        伏笔关系{' '}
        {catalog?.foreshadowings.reduce((sum, item) => sum + item.relations.length, 0) ?? 0}
      </span>
      <span>
        弧光节点依赖{' '}
        {catalog?.characterArcs.reduce(
          (sum, arc) =>
            sum +
            arc.milestones.reduce(
              (milestoneSum, milestone) =>
                milestoneSum +
                milestone.dependencyMilestoneIds.length +
                milestone.dependencyTimelineEventIds.length,
              0,
            ),
          0,
        ) ?? 0}
      </span>
    </div>
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

function parseChapterLinks(
  value: string,
): Array<{ readonly chapterId: string; readonly role: ForeshadowingChapterRole }> | null {
  const allowed = new Set(['plant', 'reinforce', 'partial_reveal', 'reveal', 'reference']);
  const result: Array<{ readonly chapterId: string; readonly role: ForeshadowingChapterRole }> = [];
  for (const line of nonEmptyLines(value)) {
    const [chapterId, role] = line.split('|').map((item) => item.trim());
    if (!chapterId || !role || !allowed.has(role)) return null;
    result.push({ chapterId, role: role as ForeshadowingChapterRole });
  }
  return uniqueBy(result, (item) => `${item.chapterId}:${item.role}`);
}

function parseForeshadowingRelations(
  value: string,
): Array<{
  readonly targetForeshadowingId: string;
  readonly kind: ForeshadowingRelationKind;
}> | null {
  const allowed = new Set(['depends_on', 'blocks', 'mutually_exclusive', 'reinforces']);
  const result: Array<{
    readonly targetForeshadowingId: string;
    readonly kind: ForeshadowingRelationKind;
  }> = [];
  for (const line of nonEmptyLines(value)) {
    const [targetForeshadowingId, kind] = line.split('|').map((item) => item.trim());
    if (!targetForeshadowingId || !kind || !allowed.has(kind)) return null;
    result.push({
      targetForeshadowingId,
      kind: kind as ForeshadowingRelationKind,
    });
  }
  return uniqueBy(result, (item) => `${item.targetForeshadowingId}:${item.kind}`);
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

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const current = key(value);
    if (seen.has(current)) return false;
    seen.add(current);
    return true;
  });
}
