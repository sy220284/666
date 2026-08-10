import { useEffect, useState, useSyncExternalStore, type SelectHTMLAttributes } from 'react';

import type { Entity } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';

export type AuthorValueType = 'text' | 'number' | 'boolean' | 'list' | 'json';

export interface CanonChapterReference {
  readonly id: string;
  readonly label: string;
  readonly finalVersionId: string | null;
}

export interface CanonVersionReference {
  readonly id: string;
  readonly chapterId: string;
  readonly label: string;
}

export interface CanonAuthorReferences {
  readonly state: 'loading' | 'ready' | 'partial';
  readonly entities: readonly Entity[];
  readonly chapters: readonly CanonChapterReference[];
  readonly versions: readonly CanonVersionReference[];
}

export const EMPTY_CANON_AUTHOR_REFERENCES: CanonAuthorReferences = {
  state: 'loading',
  entities: [],
  chapters: [],
  versions: [],
};

export const COMMON_FACT_FIELDS = [
  { key: 'appearance', label: '外貌特征', valueType: 'text' },
  { key: 'personality', label: '性格特点', valueType: 'list' },
  { key: 'goal', label: '当前目标', valueType: 'text' },
  { key: 'motivation', label: '核心动机', valueType: 'text' },
  { key: 'ability', label: '能力与特长', valueType: 'list' },
  { key: 'relationship', label: '重要关系', valueType: 'list' },
  { key: 'background', label: '背景经历', valueType: 'text' },
  { key: 'rule', label: '规则与限制', valueType: 'text' },
] as const satisfies readonly {
  readonly key: string;
  readonly label: string;
  readonly valueType: AuthorValueType;
}[];

export const COMMON_STATE_FIELDS = [
  { key: 'location', label: '所在地点', valueType: 'text' },
  { key: 'health', label: '身体状态', valueType: 'text' },
  { key: 'emotion', label: '情绪状态', valueType: 'text' },
  { key: 'goal', label: '当前目标', valueType: 'text' },
  { key: 'relationship', label: '关系变化', valueType: 'text' },
  { key: 'possession', label: '持有物品', valueType: 'list' },
  { key: 'identity', label: '身份状态', valueType: 'text' },
  { key: 'ability', label: '能力状态', valueType: 'text' },
] as const satisfies readonly {
  readonly key: string;
  readonly label: string;
  readonly valueType: AuthorValueType;
}[];

let authorValueError: string | null = null;
const authorValueErrorListeners = new Set<() => void>();

function publishAuthorValueError(message: string | null): void {
  if (authorValueError === message) return;
  authorValueError = message;
  for (const listener of authorValueErrorListeners) listener();
}

function subscribeAuthorValueError(listener: () => void): () => void {
  authorValueErrorListeners.add(listener);
  return () => authorValueErrorListeners.delete(listener);
}

function useAuthorValueError(): string | null {
  return useSyncExternalStore(
    subscribeAuthorValueError,
    () => authorValueError,
    () => null,
  );
}

export function useCanonAuthorReferences(
  bridge: RendererBridgeAdapter,
  projectId: string,
): CanonAuthorReferences {
  const [references, setReferences] = useState<CanonAuthorReferences>(
    EMPTY_CANON_AUTHOR_REFERENCES,
  );

  useEffect(() => {
    let active = true;
    setReferences(EMPTY_CANON_AUTHOR_REFERENCES);
    void Promise.all([
      bridge.canon.list({ projectId, includeArchived: false }, { mode: 'replace' }),
      bridge.planning.listStructure(projectId, { mode: 'replace' }),
    ]).then(([entities, structure]) => {
      if (!active) return;
      const entityValues = entities.state === 'success' ? entities.data.entities : [];
      const chapters =
        structure.state === 'success'
          ? structure.data.volumes.flatMap((volume) =>
              volume.chapters.map((chapter) => ({
                id: chapter.id,
                label: `${volume.title} / ${chapter.title}`,
                finalVersionId: chapter.finalVersionId,
              })),
            )
          : [];
      setReferences({
        state: entities.state === 'success' && structure.state === 'success' ? 'ready' : 'partial',
        entities: entityValues,
        chapters,
        versions: chapters.flatMap((chapter) =>
          chapter.finalVersionId
            ? [
                {
                  id: chapter.finalVersionId,
                  chapterId: chapter.id,
                  label: `${chapter.label} · 定稿`,
                },
              ]
            : [],
        ),
      });
    });
    return () => {
      active = false;
    };
  }, [bridge, projectId]);

  return references;
}

interface ReferenceSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  readonly emptyLabel?: string;
}

export function EntityNameSelect({
  references,
  entityType,
  emptyLabel = '请选择',
  ...props
}: ReferenceSelectProps & {
  readonly references: CanonAuthorReferences;
  readonly entityType?: Entity['entityType'];
}) {
  const valueError = useAuthorValueError();
  const entities = entityType
    ? references.entities.filter((entity) => entity.entityType === entityType)
    : references.entities;
  return (
    <>
      <select {...props}>
        <option value="">{emptyLabel}</option>
        {entities.map((entity) => (
          <option key={entity.id} value={entity.id}>
            {entity.name}
          </option>
        ))}
      </select>
      {props.name === 'entityId' && valueError ? (
        <span className="form-error" data-author-value-error role="alert">
          {valueError}
        </span>
      ) : null}
    </>
  );
}

export function ChapterNameSelect({
  references,
  emptyLabel = '请选择章节',
  ...props
}: ReferenceSelectProps & { readonly references: CanonAuthorReferences }) {
  return (
    <select {...props}>
      <option value="">{emptyLabel}</option>
      {references.chapters.map((chapter) => (
        <option key={chapter.id} value={chapter.id}>
          {chapter.label}
        </option>
      ))}
    </select>
  );
}

export function FinalVersionSelect({
  references,
  emptyLabel = '请选择定稿',
  ...props
}: ReferenceSelectProps & { readonly references: CanonAuthorReferences }) {
  return (
    <select {...props}>
      <option value="">{emptyLabel}</option>
      {references.versions.map((version) => (
        <option key={version.id} value={version.id}>
          {version.label}
        </option>
      ))}
    </select>
  );
}

export function parseAuthorValue(valueType: AuthorValueType, rawValue: string): unknown {
  const value = rawValue.trim();
  try {
    let parsed: unknown;
    if (valueType === 'text') parsed = value;
    else if (valueType === 'number') {
      const number = Number(value);
      if (!Number.isFinite(number)) throw new TypeError('请输入有效数字。');
      parsed = number;
    } else if (valueType === 'boolean') {
      if (value === 'true' || value === '是') parsed = true;
      else if (value === 'false' || value === '否') parsed = false;
      else throw new TypeError('布尔值只能填写“是”或“否”。');
    } else if (valueType === 'list') {
      parsed = value
        .split(/[\n,，、]+/u)
        .map((item) => item.trim())
        .filter(Boolean);
    } else {
      try {
        parsed = JSON.parse(value || 'null') as unknown;
      } catch {
        throw new TypeError('原始JSON格式不正确，请检查括号、引号和逗号。');
      }
    }
    publishAuthorValueError(null);
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : '内容格式不正确。';
    publishAuthorValueError(message);
    throw error;
  }
}

export function authorFactLabel(key: string): string {
  return COMMON_FACT_FIELDS.find((field) => field.key === key)?.label ?? key;
}

export function authorStateLabel(key: string): string {
  return COMMON_STATE_FIELDS.find((field) => field.key === key)?.label ?? key;
}

export function entityName(references: CanonAuthorReferences, entityId: string): string {
  return references.entities.find((entity) => entity.id === entityId)?.name ?? '未知设定条目';
}

export function chapterName(references: CanonAuthorReferences, chapterId: string | null): string {
  if (!chapterId) return '当前';
  return references.chapters.find((chapter) => chapter.id === chapterId)?.label ?? '未知章节';
}

export function knowledgeStatusLabel(status: string): string {
  const labels: Readonly<Record<string, string>> = {
    knows: '已经知晓',
    believes: '相信如此',
    suspects: '有所怀疑',
    misunderstands: '存在误解',
    unknown: '尚不知情',
  };
  return labels[status] ?? '状态未知';
}

export function recordStatusLabel(status: string): string {
  const labels: Readonly<Record<string, string>> = {
    current: '当前有效',
    superseded: '已被更新',
    invalidated: '已失效',
    active: '进行中',
    archived: '已归档',
  };
  return labels[status] ?? status;
}

export function timelinePrecisionLabel(precision: string): string {
  const labels: Readonly<Record<string, string>> = {
    exact: '精确时间',
    day: '精确到日',
    month: '精确到月',
    year: '精确到年',
    approximate: '大致时间',
    unknown: '时间未知',
  };
  return labels[precision] ?? precision;
}

export function arcTypeLabel(type: string): string {
  const labels: Readonly<Record<string, string>> = {
    growth: '成长',
    darkening: '黑化',
    awakening: '觉醒',
    fall: '堕落',
    redemption: '救赎',
    custom: '自定义',
  };
  return labels[type] ?? type;
}

export function promptChapterId(
  chapters: readonly CanonChapterReference[],
  title: string,
): string | null {
  if (!chapters.length) return null;
  const answer = window.prompt(
    `${title}\n${chapters.map((chapter, index) => `${index + 1}. ${chapter.label}`).join('\n')}`,
    '1',
  );
  if (!answer) return null;
  return chapters[Number(answer) - 1]?.id ?? null;
}
