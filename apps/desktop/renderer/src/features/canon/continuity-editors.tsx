import { useState, type FormEvent } from 'react';

import type { ContinuityCatalog } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeCommand } from '../../bridge/use-bridge-resource.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import { useDraftBlockPicker } from '../writing/draft-block-picker.js';
import {
  ChapterNameSelect,
  COMMON_STATE_FIELDS,
  EntityNameSelect,
  FinalVersionSelect,
  knowledgeStatusLabel,
  parseAuthorValue,
  timelinePrecisionLabel,
  type AuthorValueType,
  type CanonAuthorReferences,
} from './canon-author-fields.js';
import { nullableString } from './canon-panel-shared.js';

export function ContinuityEditors({
  bridge,
  catalog,
  projectId,
  readOnly,
  references,
  onRefresh,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly catalog: ContinuityCatalog | null;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly references: CanonAuthorReferences;
  readonly onRefresh: () => Promise<void>;
}) {
  const command = useBridgeCommand(onRefresh);
  const sourceCommand = useBridgeCommand();
  const { pickBlockAnchor, picker } = useDraftBlockPicker();
  const [knowledgeSourceBlockId, setKnowledgeSourceBlockId] = useState<string | null>(null);
  const [knowledgeSourceBlockLabel, setKnowledgeSourceBlockLabel] = useState<string | null>(null);

  const setEntityState = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const selectedStateKey = String(values.get('stateKey') ?? '');
    const stateKey =
      selectedStateKey === 'custom'
        ? String(values.get('customStateKey') ?? '').trim()
        : selectedStateKey;
    if (!stateKey) return;
    let value: Parameters<RendererBridgeAdapter['continuity']['setEntityState']>[0]['value'];
    try {
      value = parseAuthorValue(
        String(values.get('valueType') ?? 'text') as AuthorValueType,
        String(values.get('value') ?? ''),
      ) as typeof value;
    } catch {
      return;
    }
    await command.run(() =>
      bridge.continuity.setEntityState({
        projectId,
        authority: 'author',
        entityId: String(values.get('entityId')),
        stateKey,
        value,
        validFromChapterId: String(values.get('validFromChapterId')),
        validUntilChapterId: nullableString(values.get('validUntilChapterId')),
        sourceVersionId: String(values.get('sourceVersionId')),
        evidence: [],
      }),
    );
  };

  const saveTimeline = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await command.run(() =>
      bridge.continuity.saveTimelineEvent({
        projectId,
        authority: 'author',
        eventId: null,
        title: String(values.get('title')),
        startValue: String(values.get('startValue')),
        endValue: nullableString(values.get('endValue')),
        precision: String(values.get('precision')) as Parameters<
          RendererBridgeAdapter['continuity']['saveTimelineEvent']
        >[0]['precision'],
        chapterId: nullableString(values.get('chapterId')),
        locationId: nullableString(values.get('locationId')),
        description: String(values.get('description') ?? ''),
        participantIds: values.getAll('participantIds').map(String).filter(Boolean),
        witnessIds: [],
        subjectIds: [],
        dependencyIds: [],
      }),
    );
  };

  const setKnowledge = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await command.run(() =>
      bridge.continuity.setKnowledgeState({
        projectId,
        authority: 'author',
        informationKey: String(values.get('informationKey')),
        characterId: String(values.get('characterId')),
        knowledgeStatus: String(values.get('knowledgeStatus')) as Parameters<
          RendererBridgeAdapter['continuity']['setKnowledgeState']
        >[0]['knowledgeStatus'],
        validFromChapterId: String(values.get('validFromChapterId')),
        validUntilChapterId: nullableString(values.get('validUntilChapterId')),
        sourceVersionId: nullableString(values.get('sourceVersionId')),
        sourceLogicalBlockId: knowledgeSourceBlockId,
        notes: String(values.get('notes') ?? ''),
      }),
    );
  };

  const selectKnowledgeSourceBlock = async (form: HTMLFormElement | null): Promise<void> => {
    if (!form) return;
    const sourceVersionId = String(new FormData(form).get('sourceVersionId') ?? '');
    const reference = references.versions.find((version) => version.id === sourceVersionId);
    if (!reference) return;
    const version = await sourceCommand.run(() =>
      bridge.version.get(
        {
          projectId,
          chapterId: reference.chapterId,
          versionId: reference.id,
        },
        { mode: 'replace' },
      ),
    );
    if (!version) return;
    const selectedId = await pickBlockAnchor({
      title: '选择知情状态的来源正文',
      description: '直接选择人物获得、相信或误解这条信息的原文段落。内部标识由系统保存。',
      blocks: version.blocks.map((block) => ({
        logicalBlockId: block.logicalBlockId,
        text: block.text,
        locked: false,
      })),
      initialId: knowledgeSourceBlockId,
      labelMode: 'select',
    });
    if (!selectedId) return;
    const selectedIndex = version.blocks.findIndex((block) => block.logicalBlockId === selectedId);
    setKnowledgeSourceBlockId(selectedId);
    setKnowledgeSourceBlockLabel(selectedIndex >= 0 ? `第 ${selectedIndex + 1} 段` : '已选择原文段落');
  };

  return (
    <div className="ledger-editor-grid">
      <details className="feature-card">
        <summary>记录动态状态</summary>
        <form className="stacked-form" onSubmit={(event) => void setEntityState(event)}>
          <label>
            人物或设定
            <EntityNameSelect name="entityId" references={references} required />
          </label>
          <label>
            状态类型
            <select name="stateKey" defaultValue="location">
              {COMMON_STATE_FIELDS.map((field) => (
                <option key={field.key} value={field.key}>
                  {field.label}
                </option>
              ))}
              <option value="custom">其他自定义状态</option>
            </select>
          </label>
          <label>
            内容形式
            <select name="valueType" defaultValue="text">
              <option value="text">文字</option>
              <option value="number">数字</option>
              <option value="boolean">是 / 否</option>
              <option value="list">多项内容</option>
            </select>
          </label>
          <label>
            当前内容
            <textarea name="value" required />
          </label>
          <label>
            从哪一章开始生效
            <ChapterNameSelect name="validFromChapterId" references={references} required />
          </label>
          <label>
            到哪一章结束
            <ChapterNameSelect name="validUntilChapterId" references={references} />
          </label>
          <label>
            依据的定稿
            <FinalVersionSelect name="sourceVersionId" references={references} required />
          </label>
          <details>
            <summary>高级自定义状态</summary>
            <label>
              自定义状态名称
              <input name="customStateKey" />
            </label>
          </details>
          <button disabled={readOnly || command.pending} type="submit">
            确认动态状态
          </button>
        </form>
        <div className="compact-list">
          {catalog?.entityStates
            .filter((item) => item.recordStatus === 'current')
            .map((item) => (
              <button
                disabled={readOnly || command.pending}
                key={item.id}
                type="button"
                onClick={() =>
                  void command.run(() =>
                    bridge.continuity.invalidateEntityState({
                      projectId,
                      authority: 'author',
                      entityId: item.entityId,
                      stateKey: item.stateKey,
                    }),
                  )
                }
              >
                失效：{item.stateKey}
              </button>
            ))}
        </div>
      </details>
      <details className="feature-card">
        <summary>新增时间线事件</summary>
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
                  {timelinePrecisionLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            对应章节
            <ChapterNameSelect name="chapterId" references={references} />
          </label>
          <label>
            发生地点
            <EntityNameSelect name="locationId" entityType="location" references={references} />
          </label>
          <label>
            参与人物
            <EntityNameSelect
              name="participantIds"
              entityType="character"
              references={references}
              multiple
            />
          </label>
          <label>
            说明
            <textarea name="description" />
          </label>
          <button disabled={readOnly || command.pending} type="submit">
            保存事件
          </button>
        </form>
        <div className="compact-list">
          {catalog?.timelineEvents
            .filter((item) => item.status === 'active')
            .map((item) => (
              <button
                disabled={readOnly || command.pending}
                key={item.id}
                type="button"
                onClick={() =>
                  void command.run(() =>
                    bridge.continuity.archiveTimelineEvent({
                      projectId,
                      authority: 'author',
                      eventId: item.id,
                    }),
                  )
                }
              >
                归档：{item.title}
              </button>
            ))}
        </div>
      </details>
      <details className="feature-card">
        <summary>记录知情状态</summary>
        <form className="stacked-form" onSubmit={(event) => void setKnowledge(event)}>
          <label>
            知情内容
            <input name="informationKey" placeholder="人物知道或误解了什么" required />
          </label>
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
            状态
            <select name="knowledgeStatus" defaultValue="knows">
              {['knows', 'believes', 'suspects', 'misunderstands', 'unknown'].map((value) => (
                <option key={value} value={value}>
                  {knowledgeStatusLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            从哪一章开始生效
            <ChapterNameSelect name="validFromChapterId" references={references} required />
          </label>
          <label>
            到哪一章结束
            <ChapterNameSelect name="validUntilChapterId" references={references} />
          </label>
          <label>
            依据的定稿
            <FinalVersionSelect
              name="sourceVersionId"
              references={references}
              onChange={() => {
                setKnowledgeSourceBlockId(null);
                setKnowledgeSourceBlockLabel(null);
              }}
            />
          </label>
          <div className="inline-actions">
            <button
              data-select-knowledge-source-block
              disabled={readOnly || sourceCommand.pending}
              type="button"
              onClick={(event) => void selectKnowledgeSourceBlock(event.currentTarget.form)}
            >
              选择来源正文段落
            </button>
            {knowledgeSourceBlockId ? (
              <button
                type="button"
                onClick={() => {
                  setKnowledgeSourceBlockId(null);
                  setKnowledgeSourceBlockLabel(null);
                }}
              >
                清除来源段落
              </button>
            ) : null}
            <span>{knowledgeSourceBlockLabel ?? '可选：尚未指定原文段落'}</span>
          </div>
          <label>
            备注
            <textarea name="notes" />
          </label>
          <button disabled={readOnly || command.pending} type="submit">
            确认知情状态
          </button>
        </form>
        <div className="compact-list">
          {catalog?.knowledgeStates
            .filter((item) => item.recordStatus === 'current')
            .map((item) => (
              <button
                disabled={readOnly || command.pending}
                key={item.id}
                type="button"
                onClick={() =>
                  void command.run(() =>
                    bridge.continuity.invalidateKnowledgeState({
                      projectId,
                      authority: 'author',
                      characterId: item.characterId,
                      informationKey: item.informationKey,
                    }),
                  )
                }
              >
                失效：{item.informationKey}
              </button>
            ))}
        </div>
      </details>
      {command.error ? <p className="form-error">{authorErrorSummary(command.error)}</p> : null}
      {sourceCommand.error ? (
        <p className="form-error">{authorErrorSummary(sourceCommand.error)}</p>
      ) : null}
      {picker}
    </div>
  );
}
