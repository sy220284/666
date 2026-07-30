import { useCallback, useState, type FormEvent } from 'react';

import type { ForeshadowingSaveInput, NarrativePlanningCatalog } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeCommand, useBridgeQuery } from '../../bridge/use-bridge-resource.js';
import { ChapterNameSelect, useCanonAuthorReferences } from './canon-author-fields.js';

import { authorErrorSummary } from '../../presentation/author-error-message.js';
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
  const loadContinuity = useCallback(
    () =>
      bridge.continuity.list(
        {
          projectId,
          query: '',
          includeHistory: false,
          includeArchivedEvents: false,
          effectiveAtChapterId: null,
        },
        { mode: 'replace' },
      ),
    [bridge, projectId],
  );
  const continuity = useBridgeQuery(`narrative-continuity:${projectId}`, loadContinuity);
  const command = useBridgeCommand(resource.refresh);
  const references = useCanonAuthorReferences(bridge, projectId);
  const [status, setStatus] = useState('完整叙事关系编辑会保存章节锚点、伏笔关系和弧光依赖。');

  const saveForeshadowing = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const chapterLinks = [
      ...roleChapterLinks(values, 'plantChapterIds', 'plant'),
      ...roleChapterLinks(values, 'reinforceChapterIds', 'reinforce'),
      ...roleChapterLinks(values, 'revealChapterIds', 'reveal'),
    ];
    const relations = [
      ...foreshadowingRelations(values, 'dependencyForeshadowingIds', 'depends_on'),
      ...foreshadowingRelations(values, 'exclusiveForeshadowingIds', 'mutually_exclusive'),
    ];
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
    const dependencyMilestoneIds = selectedValues(values, 'dependencyMilestoneIds');
    const dependencyTimelineEventIds = selectedValues(values, 'dependencyTimelineEventIds');
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
          ? `叙事规划读取失败 · ${authorErrorSummary(resource.error)}`
          : command.error
            ? `写入失败 · ${authorErrorSummary(command.error)} · ${command.error.message}`
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
              最早回收章节
              <ChapterNameSelect name="revealFromChapterId" references={references} />
            </label>
            <label>
              最晚回收章节
              <ChapterNameSelect name="revealByChapterId" references={references} />
            </label>
            <label>
              埋设章节
              <ChapterMultiSelect name="plantChapterIds" references={references} />
            </label>
            <label>
              加强章节
              <ChapterMultiSelect name="reinforceChapterIds" references={references} />
            </label>
            <label>
              回收章节
              <ChapterMultiSelect name="revealChapterIds" references={references} />
            </label>
            <label>
              依赖的伏笔
              <ForeshadowingMultiSelect catalog={resource.data} name="dependencyForeshadowingIds" />
            </label>
            <label>
              互斥的伏笔
              <ForeshadowingMultiSelect catalog={resource.data} name="exclusiveForeshadowingIds" />
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
              计划章节
              <ChapterNameSelect name="plannedChapterId" references={references} />
            </label>
            <label>
              前置弧光节点
              <select multiple name="dependencyMilestoneIds">
                {resource.data?.characterArcs.flatMap((item) =>
                  item.milestones.map((milestone) => (
                    <option key={milestone.id} value={milestone.id}>
                      {item.title} / {milestone.title}
                    </option>
                  )),
                )}
              </select>
            </label>
            <label>
              前置时间线事件
              <select multiple name="dependencyTimelineEventIds">
                {continuity.data?.timelineEvents.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
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

function ChapterMultiSelect({
  name,
  references,
}: {
  readonly name: string;
  readonly references: ReturnType<typeof useCanonAuthorReferences>;
}) {
  return (
    <select multiple name={name}>
      {references.chapters.map((chapter) => (
        <option key={chapter.id} value={chapter.id}>
          {chapter.label}
        </option>
      ))}
    </select>
  );
}

function ForeshadowingMultiSelect({
  catalog,
  name,
}: {
  readonly catalog: NarrativePlanningCatalog | null;
  readonly name: string;
}) {
  return (
    <select multiple name={name}>
      {catalog?.foreshadowings.map((item) => (
        <option key={item.id} value={item.id}>
          {item.title}
        </option>
      ))}
    </select>
  );
}

function roleChapterLinks(
  values: FormData,
  name: string,
  role: ChapterLink['role'],
): ChapterLink[] {
  return selectedValues(values, name).map((chapterId) => ({ chapterId, role }));
}

function foreshadowingRelations(
  values: FormData,
  name: string,
  kind: ForeshadowingRelation['kind'],
): ForeshadowingRelation[] {
  return selectedValues(values, name).map((targetForeshadowingId) => ({
    targetForeshadowingId,
    kind,
  }));
}

function selectedValues(values: FormData, name: string): string[] {
  return [...new Set(values.getAll(name).map(String).filter(Boolean))];
}

function nullableString(value: FormDataEntryValue | null): string | null {
  const result = String(value ?? '').trim();
  return result || null;
}
