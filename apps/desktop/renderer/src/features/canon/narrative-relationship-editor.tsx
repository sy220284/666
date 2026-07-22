import { useCallback, useState, type FormEvent } from 'react';

import type {
  ForeshadowingSaveInput,
  NarrativePlanningCatalog,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeCommand, useBridgeQuery } from '../../bridge/use-bridge-resource.js';

export function NarrativeRelationshipEditor({
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

type ChapterLink = ForeshadowingSaveInput['chapterLinks'][number];
type ForeshadowingRelation = ForeshadowingSaveInput['relations'][number];

function parseChapterLinks(value: string): ChapterLink[] | null {
  const allowed = new Set(['plant', 'reinforce', 'partial_reveal', 'reveal', 'reference']);
  const result: ChapterLink[] = [];
  for (const line of nonEmptyLines(value)) {
    const [chapterId, role] = line.split('|').map((item) => item.trim());
    if (!chapterId || !role || !allowed.has(role)) return null;
    result.push({ chapterId, role: role as ChapterLink['role'] });
  }
  return uniqueBy(result, (item) => `${item.chapterId}:${item.role}`);
}

function parseForeshadowingRelations(value: string): ForeshadowingRelation[] | null {
  const allowed = new Set(['depends_on', 'blocks', 'mutually_exclusive', 'reinforces']);
  const result: ForeshadowingRelation[] = [];
  for (const line of nonEmptyLines(value)) {
    const [targetForeshadowingId, kind] = line.split('|').map((item) => item.trim());
    if (!targetForeshadowingId || !kind || !allowed.has(kind)) return null;
    result.push({
      targetForeshadowingId,
      kind: kind as ForeshadowingRelation['kind'],
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
