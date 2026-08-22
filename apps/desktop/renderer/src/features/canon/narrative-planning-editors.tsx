import type { FormEvent } from 'react';

import type { NarrativePlanningCatalog } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeCommand } from '../../bridge/use-bridge-resource.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import {
  authorCharacterArcStatusLabel,
  authorForeshadowingStatusLabel,
} from '../../presentation/author-value-format.js';
import {
  arcTypeLabel,
  ChapterNameSelect,
  EntityNameSelect,
  promptChapterId,
  type CanonAuthorReferences,
} from './canon-author-fields.js';
import { nullableString } from './canon-panel-shared.js';

export function NarrativePlanningEditors({
  bridge,
  catalog,
  projectId,
  readOnly,
  references,
  onRefresh,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly catalog: NarrativePlanningCatalog | null;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly references: CanonAuthorReferences;
  readonly onRefresh: () => Promise<void>;
}) {
  const command = useBridgeCommand(onRefresh);

  const saveForeshadowing = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await command.run(() =>
      bridge.narrativePlanning.saveForeshadowing({
        projectId,
        authority: 'author',
        foreshadowingId: null,
        title: String(values.get('title')),
        description: String(values.get('description') ?? ''),
        revealFromChapterId: nullableString(values.get('revealFromChapterId')),
        revealByChapterId: nullableString(values.get('revealByChapterId')),
        chapterLinks: [],
        relations: [],
      }),
    );
  };

  const saveArc = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const arcType = String(values.get('arcType')) as Parameters<
      RendererBridgeAdapter['narrativePlanning']['saveCharacterArc']
    >[0]['arcType'];
    await command.run(() =>
      bridge.narrativePlanning.saveCharacterArc({
        projectId,
        authority: 'author',
        arcId: null,
        characterId: String(values.get('characterId')),
        title: String(values.get('title')),
        arcType,
        customType: arcType === 'custom' ? String(values.get('customType')) : null,
        status: String(values.get('status')) as Parameters<
          RendererBridgeAdapter['narrativePlanning']['saveCharacterArc']
        >[0]['status'],
        authorIntent: String(values.get('authorIntent') ?? ''),
      }),
    );
  };

  const saveMilestone = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const arc = catalog?.characterArcs.find((item) => item.id === values.get('arcId'));
    await command.run(() =>
      bridge.narrativePlanning.saveArcMilestone({
        projectId,
        authority: 'author',
        milestoneId: null,
        arcId: String(values.get('arcId')),
        title: String(values.get('title')),
        description: String(values.get('description') ?? ''),
        sortIndex: arc?.milestones.length ?? 0,
        plannedChapterId: nullableString(values.get('plannedChapterId')),
        dependencyMilestoneIds: [],
        dependencyTimelineEventIds: [],
      }),
    );
  };

  const transitionMilestone = async (
    milestoneId: string,
    status: 'hit' | 'skipped',
  ): Promise<void> => {
    const actualChapterId =
      status === 'hit' ? await promptChapterId(references.chapters, '选择实际命中章节：') : null;
    if (status === 'hit' && !actualChapterId) return;
    await command.run(() =>
      bridge.narrativePlanning.transitionArcMilestone({
        projectId,
        authority: 'author',
        milestoneId,
        status,
        actualChapterId,
      }),
    );
  };

  return (
    <div className="ledger-editor-grid">
      <details className="feature-card">
        <summary>新增伏笔</summary>
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
          <button disabled={readOnly || command.pending} type="submit">
            保存伏笔
          </button>
        </form>
        {catalog?.foreshadowings.map((item) => (
          <label className="feature-row" key={item.id}>
            {item.title}
            <select
              disabled={readOnly || command.pending}
              value={item.status}
              onChange={(event) =>
                void command.run(() =>
                  bridge.narrativePlanning.transitionForeshadowing({
                    projectId,
                    authority: 'author',
                    foreshadowingId: item.id,
                    status: event.target.value as Parameters<
                      RendererBridgeAdapter['narrativePlanning']['transitionForeshadowing']
                    >[0]['status'],
                  }),
                )
              }
            >
              {[
                'planned',
                'planted',
                'reinforced',
                'partially_revealed',
                'revealed',
                'cancelled',
              ].map((status) => (
                <option key={status} value={status}>
                  {authorForeshadowingStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </details>
      <details className="feature-card">
        <summary>新增人物弧光</summary>
        <form className="stacked-form" onSubmit={(event) => void saveArc(event)}>
          <label>
            人物
            <EntityNameSelect
              name="characterId"
              entityType="character"
              references={references}
              required
            />
          </label>
          <label>
            标题
            <input name="title" required />
          </label>
          <label>
            类型
            <select name="arcType" defaultValue="growth">
              {['growth', 'darkening', 'awakening', 'fall', 'redemption', 'custom'].map((value) => (
                <option key={value} value={value}>
                  {arcTypeLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            自定义类型
            <input name="customType" />
          </label>
          <label>
            状态
            <select name="status" defaultValue="planned">
              {['planned', 'active', 'completed', 'abandoned'].map((value) => (
                <option key={value} value={value}>
                  {authorCharacterArcStatusLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            作者意图
            <textarea name="authorIntent" />
          </label>
          <button disabled={readOnly || command.pending} type="submit">
            保存弧光
          </button>
        </form>
      </details>
      <details className="feature-card">
        <summary>新增或确认弧光里程碑</summary>
        <form className="stacked-form" onSubmit={(event) => void saveMilestone(event)}>
          <label>
            人物弧光
            <select name="arcId" required>
              {catalog?.characterArcs.map((arc) => (
                <option key={arc.id} value={arc.id}>
                  {arc.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            标题
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
          <button
            disabled={readOnly || command.pending || !catalog?.characterArcs.length}
            type="submit"
          >
            保存里程碑
          </button>
        </form>
        {catalog?.characterArcs.flatMap((arc) =>
          arc.milestones.map((milestone) => (
            <div className="feature-row" key={milestone.id}>
              <span>
                {arc.title} / {milestone.title} ·{' '}
                {milestone.status === 'hit'
                  ? '已命中'
                  : milestone.status === 'skipped'
                    ? '已跳过'
                    : '待命中'}
              </span>
              <div className="inline-actions">
                <button
                  disabled={readOnly || command.pending}
                  type="button"
                  onClick={() => void transitionMilestone(milestone.id, 'hit')}
                >
                  确认命中
                </button>
                <button
                  disabled={readOnly || command.pending}
                  type="button"
                  onClick={() => void transitionMilestone(milestone.id, 'skipped')}
                >
                  标记跳过
                </button>
              </div>
            </div>
          )),
        )}
      </details>
      {command.error ? <p className="form-error">{authorErrorSummary(command.error)}</p> : null}
    </div>
  );
}
