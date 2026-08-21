import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  ResearchAttachment,
  ResearchAttachmentPreview,
  ResearchCatalog,
  ResearchLink,
  ResearchReference,
  ResearchTargetType,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import {
  listResearchReferenceSelection,
  removeResearchReferenceSelection,
  researchReferenceKey,
  setResearchReferenceSelected,
} from '../../bridge/research-reference-selection.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import { useUnsavedChangesGuard } from '../../runtime/unsaved-changes.js';
import type { AuthorNavigationTarget } from '../../shell/navigation-target.js';
import { useRendererUiStore } from '../../state/ui-store.js';
import { useResearchTargetOptions } from './research-target-options.js';

interface ResearchEditingSnapshot {
  readonly note: ResearchCatalog['notes'][number];
  readonly attachments: readonly ResearchAttachment[];
  readonly links: readonly ResearchLink[];
}

interface ResearchWorkbenchProps {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly selectedNoteId: string | null;
  readonly navigationQuery: string | null;
  readonly onNavigate: (target: AuthorNavigationTarget) => void;
  readonly onSelectNote: (noteId: string | null) => void;
  readonly onReturn?: () => void;
  readonly onClose: () => void;
}

const TARGET_OPTIONS: readonly [ResearchTargetType, string][] = [
  ['chapter', '章节'],
  ['volume', '卷'],
  ['entity', '人物或设定'],
  ['relationship', '人物关系'],
  ['timeline', '时间线事件'],
  ['foreshadowing', '伏笔'],
  ['arc', '人物成长线'],
  ['milestone', '成长里程碑'],
  ['idea', '灵感'],
];
const PREVIEW_MEDIA_TYPES = new Set(['text/plain', 'text/markdown', 'application/json']);

function splitTags(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[，,、\s]+/u)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ].slice(0, 50);
}

function attachmentLabel(attachment: ResearchAttachment): string {
  const size =
    attachment.sizeBytes < 1024 * 1024
      ? `${Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB`
      : `${(attachment.sizeBytes / 1024 / 1024).toFixed(1)} MB`;
  return `${attachment.displayName} · ${size} · ${attachment.mediaType}`;
}

function linkNavigation(projectId: string, link: ResearchLink): AuthorNavigationTarget {
  return {
    type: 'research-link-target',
    projectId,
    targetType: link.targetType,
    targetId: link.targetId,
  };
}

function selectedReferenceKeys(projectId: string): ReadonlySet<string> {
  return new Set(listResearchReferenceSelection(projectId).map(researchReferenceKey));
}

export function ResearchWorkbench({
  bridge,
  projectId,
  readOnly,
  selectedNoteId,
  navigationQuery,
  onNavigate,
  onSelectNote,
  onReturn,
  onClose,
}: ResearchWorkbenchProps) {
  const returnLocation = useRendererUiStore((state) => state.returnLocation);
  const [catalog, setCatalog] = useState<ResearchCatalog | null>(null);
  const [editingSnapshot, setEditingSnapshot] = useState<ResearchEditingSnapshot | null>(
    null,
  );
  const [refreshVersion, setRefreshVersion] = useState(0);
  const knownNoteIds = useRef<Set<string>>(new Set());
  const filterChangePending = useRef(false);
  const [query, setQuery] = useState(navigationQuery ?? '');
  const [showArchived, setShowArchived] = useState(false);
  const [tagFilter, setTagFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [targetFilterType, setTargetFilterType] = useState<ResearchTargetType | 'all'>('all');
  const [targetFilterId, setTargetFilterId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const [sourceUri, setSourceUri] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [targetType, setTargetType] = useState<ResearchTargetType>('chapter');
  const [targetId, setTargetId] = useState('');
  const [preview, setPreview] = useState<ResearchAttachmentPreview | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const { dirty, markDirty, clearDirty, confirmDiscard } = useUnsavedChangesGuard('研究笔记');
  const loadedNoteIdentity = useRef<string | null>(null);
  const [notice, setNotice] = useState(
    '研究资料不会自动写入人物与世界，也不会自动进入智能上下文。',
  );
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<ReadonlySet<string>>(() =>
    selectedReferenceKeys(projectId),
  );
  const targetOptions = useResearchTargetOptions(bridge, projectId);
  const linkTargetOptions = useMemo(
    () => targetOptions.filter((option) => option.type === targetType),
    [targetOptions, targetType],
  );
  const filterTargetOptions = useMemo(
    () =>
      targetFilterType === 'all'
        ? []
        : targetOptions.filter((option) => option.type === targetFilterType),
    [targetFilterType, targetOptions],
  );
  const availableTags = useMemo(
    () =>
      [
        ...new Set(
          [...(catalog?.notes.flatMap((note) => note.tags) ?? []), tagFilter].filter(Boolean),
        ),
      ].sort((left, right) => left.localeCompare(right, 'zh-CN')),
    [catalog?.notes, tagFilter],
  );
  const availableSources = useMemo(
    () =>
      [
        ...new Set(
          [
            ...(catalog?.notes.map((note) => note.sourceType).filter(Boolean) ?? []),
            sourceFilter || null,
          ].filter((value): value is string => Boolean(value)),
        ),
      ].sort((left, right) => left.localeCompare(right, 'zh-CN')),
    [catalog?.notes, sourceFilter],
  );

  const filteredSelected = useMemo(
    () => catalog?.notes.find((note) => note.id === selectedNoteId) ?? null,
    [catalog?.notes, selectedNoteId],
  );
  const selected =
    filteredSelected ??
    (editingSnapshot?.note.id === selectedNoteId ? editingSnapshot.note : null);
  const selectedAttachments = filteredSelected
    ? (catalog?.attachments.filter(
        (attachment) => attachment.noteId === selectedNoteId,
      ) ?? [])
    : editingSnapshot?.note.id === selectedNoteId
      ? editingSnapshot.attachments
      : [];
  const selectedLinks = filteredSelected
    ? (catalog?.links.filter(
        (link) => link.sourceType === 'note' && link.sourceId === selectedNoteId,
      ) ?? [])
    : editingSnapshot?.note.id === selectedNoteId
      ? editingSnapshot.links
      : [];
  const selectedOutsideCurrentFilter = Boolean(selected && !filteredSelected);

  const restrictiveFiltersActive =
    Boolean(query.trim()) ||
    Boolean(tagFilter) ||
    Boolean(sourceFilter) ||
    targetFilterType !== 'all' ||
    Boolean(targetFilterId);

  const load = useCallback(async (): Promise<void> => {
    const outcome = await bridge.research.list(
      {
        projectId,
        includeArchived: showArchived,
        ...(query.trim() ? { query: query.trim() } : {}),
        ...(tagFilter ? { tags: [tagFilter] } : {}),
        ...(sourceFilter ? { noteSourceType: sourceFilter } : {}),
        ...(targetFilterType !== 'all' ? { targetType: targetFilterType } : {}),
        ...(targetFilterId ? { targetId: targetFilterId } : {}),
      },
      {
        mode: 'replace',
        laneKey: `research.list:${projectId}`,
      },
    );
    if (outcome.state !== 'success') {
      if (outcome.state === 'failure') {
        setNotice(`研究资料读取失败：${authorErrorSummary(outcome.error)}`);
      }
      return;
    }
    setCatalog(outcome.data);
    for (const note of outcome.data.notes) knownNoteIds.current.add(note.id);
    if (selectedNoteId && !outcome.data.notes.some((note) => note.id === selectedNoteId)) {
      const hasLoadedEditingContext = loadedNoteIdentity.current?.startsWith(
        `${selectedNoteId}:`,
      );
      const preserveSelection = restrictiveFiltersActive || filterChangePending.current;
      if (!preserveSelection || !hasLoadedEditingContext) {
        onSelectNote(outcome.data.notes[0]?.id ?? null);
      }
    } else if (!selectedNoteId && outcome.data.notes[0]) {
      onSelectNote(outcome.data.notes[0].id);
    }
    filterChangePending.current = false;
  }, [
    bridge.research,
    restrictiveFiltersActive,
    onSelectNote,
    projectId,
    query,
    refreshVersion,
    selectedNoteId,
    showArchived,
    sourceFilter,
    tagFilter,
    targetFilterId,
    targetFilterType,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelectedReferenceIds(selectedReferenceKeys(projectId));
  }, [projectId]);

  useEffect(() => {
    if (!selectedNoteId) {
      setEditingSnapshot(null);
      loadedNoteIdentity.current = null;
      return;
    }
    const note = catalog?.notes.find((item) => item.id === selectedNoteId);
    if (!note) return;
    setEditingSnapshot({
      note,
      attachments:
        catalog?.attachments.filter((attachment) => attachment.noteId === note.id) ?? [],
      links:
        catalog?.links.filter(
          (link) => link.sourceType === 'note' && link.sourceId === note.id,
        ) ?? [],
    });
  }, [catalog, selectedNoteId]);

  const restoreSelectedDraft = useCallback((): void => {
    setPreview(null);
    if (!selected) {
      setTitle('');
      setBody('');
      setSourceType('');
      setSourceLabel('');
      setSourceUri('');
      setTagsText('');
      clearDirty();
      return;
    }
    setTitle(selected.title);
    setBody(selected.body);
    setSourceType(selected.sourceType ?? '');
    setSourceLabel(selected.sourceLabel ?? '');
    setSourceUri(selected.sourceUri ?? '');
    setTagsText(selected.tags.join('，'));
    clearDirty();
  }, [clearDirty, selected]);

  useEffect(() => {
    const identity = selected ? `${selected.id}:${selected.updatedAt}` : null;
    if (loadedNoteIdentity.current === identity) return;
    loadedNoteIdentity.current = identity;
    restoreSelectedDraft();
  }, [restoreSelectedDraft, selected]);

  const markFilterChange = (): void => {
    filterChangePending.current = true;
  };

  const confirmDiscardUnsaved = (action: string): boolean => {
    if (!dirty) return true;
    if (!confirmDiscard(action)) {
      setNotice('已保留当前研究笔记的未保存修改。');
      return false;
    }
    restoreSelectedDraft();
    return true;
  };

  const applyCatalog = (next: ResearchCatalog, preferredId?: string): void => {
    knownNoteIds.current = new Set(next.notes.map((note) => note.id));
    const visibleFallbackId = catalog?.notes.find((note) =>
      next.notes.some((candidate) => candidate.id === note.id),
    )?.id;
    const nextSelectedId =
      preferredId ??
      (selectedNoteId && next.notes.some((note) => note.id === selectedNoteId)
        ? selectedNoteId
        : (visibleFallbackId ?? null));
    setCatalog(next);
    if (nextSelectedId) {
      const note = next.notes.find((item) => item.id === nextSelectedId);
      if (note) {
        setEditingSnapshot({
          note,
          attachments: next.attachments.filter(
            (attachment) => attachment.noteId === note.id,
          ),
          links: next.links.filter(
            (link) => link.sourceType === 'note' && link.sourceId === note.id,
          ),
        });
      }
    } else {
      setEditingSnapshot(null);
      loadedNoteIdentity.current = null;
    }
    onSelectNote(nextSelectedId);
    setRefreshVersion((version) => version + 1);
  };

  const createNote = async (): Promise<void> => {
    if (readOnly || pending || !catalog || !confirmDiscardUnsaved('新建笔记')) return;
    const existingNoteIds = new Set(knownNoteIds.current);
    setPending('create');
    const outcome = await bridge.research.createNote(
      {
        projectId,
        title: '未命名研究笔记',
        body: '',
        sourceType: null,
        sourceLabel: null,
        sourceUri: null,
        tags: [],
      },
      { mode: 'reject', requestKey: `research.create:${projectId}` },
    );
    setPending(null);
    if (outcome.state === 'success') {
      const created = outcome.data.notes
        .filter((note) => !existingNoteIds.has(note.id))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
      applyCatalog(outcome.data, created?.id);
      setNotice('研究笔记已创建。');
    } else if (outcome.state === 'failure') {
      setNotice(`创建失败：${authorErrorSummary(outcome.error)}`);
    }
  };

  const saveNote = async (): Promise<void> => {
    if (!selected || readOnly || pending || !title.trim()) return;
    setPending('save');
    const outcome = await bridge.research.updateNote(
      {
        projectId,
        noteId: selected.id,
        expectedUpdatedAt: selected.updatedAt,
        title: title.trim(),
        body,
        sourceType: sourceType.trim() || null,
        sourceLabel: sourceLabel.trim() || null,
        sourceUri: sourceUri.trim() || null,
        tags: splitTags(tagsText),
      },
      { mode: 'reject', requestKey: `research.save:${selected.id}` },
    );
    setPending(null);
    if (outcome.state === 'success') {
      clearDirty();
      applyCatalog(outcome.data, selected.id);
      setNotice('研究笔记已保存。');
    } else if (outcome.state === 'failure') {
      setNotice(`保存失败：${authorErrorSummary(outcome.error)}`);
    }
  };

  const toggleArchived = async (): Promise<void> => {
    if (!selected || readOnly || pending || !confirmDiscardUnsaved('切换归档状态')) return;
    setPending('status');
    const outcome = await bridge.research.setNoteStatus(
      {
        projectId,
        noteId: selected.id,
        expectedUpdatedAt: selected.updatedAt,
        status: selected.status === 'active' ? 'archived' : 'active',
      },
      { mode: 'reject', requestKey: `research.status:${selected.id}` },
    );
    setPending(null);
    if (outcome.state === 'success') {
      applyCatalog(outcome.data, selected.id);
      setNotice(selected.status === 'active' ? '研究笔记已归档。' : '研究笔记已恢复。');
    } else if (outcome.state === 'failure') {
      setNotice(`状态更新失败：${authorErrorSummary(outcome.error)}`);
    }
  };

  const deleteNote = async (): Promise<void> => {
    if (!selected || readOnly || pending || !confirmDiscardUnsaved('删除笔记')) return;
    setPending('delete-note');
    const outcome = await bridge.research.deleteNote(
      {
        projectId,
        noteId: selected.id,
        expectedUpdatedAt: selected.updatedAt,
      },
      { mode: 'reject', requestKey: `research.deleteNote:${selected.id}` },
    );
    setPending(null);
    if (outcome.state === 'success') {
      removeResearchReferenceSelection(projectId, { sourceType: 'note', sourceId: selected.id });
      setSelectedReferenceIds(selectedReferenceKeys(projectId));
      applyCatalog(outcome.data);
      setNotice('研究笔记已删除；受管附件保留为独立资料。');
    } else if (outcome.state === 'failure') {
      setNotice(`删除失败：${authorErrorSummary(outcome.error)}`);
    }
  };

  const importAttachment = async (): Promise<void> => {
    if (!selected || readOnly || pending) return;
    setPending('attachment');
    const outcome = await bridge.research.importAttachment(
      { projectId, noteId: selected.id },
      { mode: 'reject', requestKey: `research.attachment:${selected.id}` },
    );
    setPending(null);
    if (outcome.state === 'success') {
      applyCatalog(outcome.data, selected.id);
      setNotice('附件已复制到当前作品的受管资料目录。');
    } else if (outcome.state === 'failure') {
      setNotice(
        outcome.error.code === 'COMMON_CANCELLED_004'
          ? '已取消选择附件。'
          : `附件导入失败：${authorErrorSummary(outcome.error)}`,
      );
    }
  };

  const previewAttachment = async (attachmentId: string): Promise<void> => {
    if (pending) return;
    setPending(`preview:${attachmentId}`);
    const outcome = await bridge.research.previewAttachment(
      { projectId, attachmentId },
      { mode: 'replace', laneKey: `research.preview:${projectId}` },
    );
    setPending(null);
    if (outcome.state === 'success') {
      setPreview(outcome.data);
      setNotice(outcome.data.truncated ? '预览已按 256 KiB 安全上限截断。' : '附件预览已校验。');
    } else if (outcome.state === 'failure') {
      setPreview(null);
      setNotice(`预览失败：${authorErrorSummary(outcome.error)}`);
    }
  };

  const deleteAttachment = async (attachmentId: string): Promise<void> => {
    if (readOnly || pending) return;
    setPending(`delete:${attachmentId}`);
    const outcome = await bridge.research.deleteAttachment(
      { projectId, attachmentId },
      {
        mode: 'reject',
        requestKey: `research.deleteAttachment:${attachmentId}`,
      },
    );
    setPending(null);
    if (outcome.state === 'success') {
      applyCatalog(outcome.data, selected?.id);
      removeResearchReferenceSelection(projectId, {
        sourceType: 'attachment',
        sourceId: attachmentId,
      });
      if (preview?.attachmentId === attachmentId) setPreview(null);
      setSelectedReferenceIds(selectedReferenceKeys(projectId));
      setNotice('附件已从作品资料库移除。');
    } else if (outcome.state === 'failure') {
      setNotice(`附件删除失败：${authorErrorSummary(outcome.error)}`);
    }
  };

  const addLink = async (): Promise<void> => {
    if (!selected || readOnly || pending || !targetId.trim()) return;
    setPending('link');
    const outcome = await bridge.research.addLink(
      {
        projectId,
        sourceType: 'note',
        sourceId: selected.id,
        targetType,
        targetId: targetId.trim(),
      },
      {
        mode: 'reject',
        requestKey: `research.link:${selected.id}:${targetType}:${targetId.trim()}`,
      },
    );
    setPending(null);
    if (outcome.state === 'success') {
      applyCatalog(outcome.data, selected.id);
      setTargetId('');
      setNotice('关联已保存；研究资料仍保持独立，不会改写权威设定。');
    } else if (outcome.state === 'failure') {
      setNotice(`关联失败：${authorErrorSummary(outcome.error)}`);
    }
  };

  const removeLink = async (linkId: string): Promise<void> => {
    if (readOnly || pending) return;
    setPending(`unlink:${linkId}`);
    const outcome = await bridge.research.removeLink(
      { projectId, linkId },
      { mode: 'reject', requestKey: `research.unlink:${linkId}` },
    );
    setPending(null);
    if (outcome.state === 'success') applyCatalog(outcome.data, selected?.id);
    else if (outcome.state === 'failure') {
      setNotice(`移除关联失败：${authorErrorSummary(outcome.error)}`);
    }
  };

  const toggleReference = (reference: ResearchReference): void => {
    const key = researchReferenceKey(reference);
    const next = setResearchReferenceSelected(projectId, reference, !selectedReferenceIds.has(key));
    setSelectedReferenceIds(new Set(next.map(researchReferenceKey)));
  };

  return (
    <main className="workspace-page research-workbench" data-testid="research-workbench">
      {returnLocation && onReturn ? (
        <section className="feature-card navigation-return" data-navigation-return role="status">
          <span>已从来源页面打开研究资料。</span>
          <button
            type="button"
            onClick={() => {
              if (confirmDiscardUnsaved('返回来源页面')) onReturn();
            }}
          >
            返回来源页面
          </button>
        </section>
      ) : null}
      <header className="workspace-page__header">
        <div>
          <p className="eyebrow">本地研究资料</p>
          <h1>研究资料</h1>
          <p>笔记与附件只作为作者资料；只有你明确勾选后，才允许进入一次智能生成请求。</p>
        </div>
        <div className="button-row">
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              if (confirmDiscardUnsaved('离开研究资料')) onClose();
            }}
          >
            返回写作
          </button>
          <button
            type="button"
            className="button primary"
            disabled={readOnly || pending !== null || catalog === null}
            onClick={() => void createNote()}
          >
            新建笔记
          </button>
        </div>
      </header>

      <p className="status-line" role="status">
        {readOnly ? `只读作品 · ${notice}` : dirty ? `有未保存修改 · ${notice}` : notice}
      </p>

      <section className="workspace-grid research-workbench__grid">
        <aside className="panel research-workbench__list" aria-label="研究笔记列表">
          <label className="field">
            <span>搜索资料</span>
            <input
              value={query}
              onChange={(event) => {
                markFilterChange();
                setQuery(event.target.value);
              }}
              placeholder="标题、正文、标签或来源"
            />
          </label>
          <label className="inline-control">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => {
                markFilterChange();
                setShowArchived(event.target.checked);
              }}
            />
            显示已归档
          </label>
          <label className="field">
            <span>按标签筛选</span>
            <select
              value={tagFilter}
              onChange={(event) => {
                markFilterChange();
                setTagFilter(event.target.value);
              }}
            >
              <option value="">全部标签</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>按来源筛选</span>
            <select
              value={sourceFilter}
              onChange={(event) => {
                markFilterChange();
                setSourceFilter(event.target.value);
              }}
            >
              <option value="">全部来源</option>
              {availableSources.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>故事对象筛选</span>
            <select
              value={targetFilterType}
              onChange={(event) => {
                markFilterChange();
                setTargetFilterType(
                  event.target.value as ResearchTargetType | 'all',
                );
                setTargetFilterId('');
              }}
            >
              <option value="all">全部对象</option>
              {TARGET_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {targetFilterType !== 'all' ? (
            <label className="field">
              <span>具体对象</span>
              <select
                value={targetFilterId}
                onChange={(event) => {
                  markFilterChange();
                  setTargetFilterId(event.target.value);
                }}
              >
                <option value="">该类型全部对象</option>
                {filterTargetOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="stack-list">
            {catalog?.notes.map((note) => (
              <button
                key={note.id}
                type="button"
                className={note.id === selectedNoteId ? 'list-card is-active' : 'list-card'}
                onClick={() => {
                  if (note.id === selectedNoteId || confirmDiscardUnsaved('切换研究笔记')) {
                    onSelectNote(note.id);
                  }
                }}
              >
                <strong>{note.title}</strong>
                <span>
                  {note.tags.length ? note.tags.join(' · ') : '无标签'}
                  {note.status === 'archived' ? ' · 已归档' : ''}
                </span>
              </button>
            ))}
            {catalog && catalog.notes.length === 0 ? (
              <p className="empty-copy">还没有符合条件的研究笔记。</p>
            ) : null}
          </div>
        </aside>

        <section className="panel research-workbench__editor">
          {selectedOutsideCurrentFilter ? (
            <p
              className="feature-status"
              data-research-selection-outside-filter
              role="status"
            >
              当前编辑的笔记不在本次筛选结果中；未保存修改仍保留在右侧。
            </p>
          ) : null}
          {selected ? (
            <>
              <div className="button-row button-row--end">
                <button
                  type="button"
                  className="text-button danger"
                  disabled={readOnly || pending !== null}
                  onClick={() => void deleteNote()}
                >
                  删除笔记
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={readOnly || pending !== null}
                  onClick={() => void toggleArchived()}
                >
                  {selected.status === 'active' ? '归档' : '恢复'}
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={readOnly || pending !== null || !title.trim()}
                  onClick={() => void saveNote()}
                >
                  保存笔记
                </button>
              </div>
              <label className="field">
                <span>标题</span>
                <input
                  value={title}
                  disabled={readOnly}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    markDirty();
                  }}
                />
              </label>
              <label className="field">
                <span>标签</span>
                <input
                  value={tagsText}
                  disabled={readOnly}
                  onChange={(event) => {
                    setTagsText(event.target.value);
                    markDirty();
                  }}
                  placeholder="历史，地理，服饰"
                />
              </label>
              <label className="field">
                <span>来源类型</span>
                <input
                  value={sourceType}
                  disabled={readOnly}
                  onChange={(event) => {
                    setSourceType(event.target.value);
                    markDirty();
                  }}
                  placeholder="档案、网页、书籍、访谈……"
                />
              </label>
              <label className="field">
                <span>来源名称</span>
                <input
                  value={sourceLabel}
                  disabled={readOnly}
                  onChange={(event) => {
                    setSourceLabel(event.target.value);
                    markDirty();
                  }}
                  placeholder="书名、档案名称或资料来源"
                />
              </label>
              <label className="field">
                <span>来源地址</span>
                <input
                  value={sourceUri}
                  disabled={readOnly}
                  onChange={(event) => {
                    setSourceUri(event.target.value);
                    markDirty();
                  }}
                  placeholder="网址、档案号或其他定位符"
                />
              </label>
              <label className="field field--grow">
                <span>笔记正文</span>
                <textarea
                  value={body}
                  disabled={readOnly}
                  onChange={(event) => {
                    setBody(event.target.value);
                    markDirty();
                  }}
                  rows={16}
                />
              </label>
            </>
          ) : (
            <p className="empty-copy">选择一条研究笔记，或新建第一条。</p>
          )}
        </section>

        <aside className="panel research-workbench__relations">
          <h2>附件与关联</h2>
          {selected ? (
            <>
              <div className="button-row">
                <button
                  type="button"
                  className="button secondary"
                  disabled={readOnly || pending !== null}
                  onClick={() => void importAttachment()}
                >
                  加入本地附件
                </button>
              </div>
              <div className="stack-list compact-list">
                {selectedAttachments.map((attachment) => {
                  const reference: ResearchReference = {
                    sourceType: 'attachment',
                    sourceId: attachment.id,
                  };
                  return (
                    <div key={attachment.id} className="list-card list-card--static">
                      <label className="inline-control">
                        <input
                          type="checkbox"
                          checked={selectedReferenceIds.has(researchReferenceKey(reference))}
                          onChange={() => toggleReference(reference)}
                        />
                        本次智能参考
                      </label>
                      <strong>{attachmentLabel(attachment)}</strong>
                      <span>SHA-256 {attachment.contentHash.slice(0, 12)}… · 受管本地副本</span>
                      <div className="button-row">
                        {PREVIEW_MEDIA_TYPES.has(attachment.mediaType) ? (
                          <button
                            type="button"
                            className="text-button"
                            disabled={pending !== null}
                            onClick={() => void previewAttachment(attachment.id)}
                          >
                            安全预览
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="text-button danger"
                          disabled={readOnly || pending !== null}
                          onClick={() => void deleteAttachment(attachment.id)}
                        >
                          删除附件
                        </button>
                      </div>
                    </div>
                  );
                })}
                {selectedAttachments.length === 0 ? <p className="empty-copy">暂无附件。</p> : null}
              </div>
              {preview ? (
                <section className="research-attachment-preview" aria-label="附件安全预览">
                  <strong>{preview.displayName}</strong>
                  <pre>{preview.text}</pre>
                  {preview.truncated ? <p className="muted-copy">预览内容已截断。</p> : null}
                </section>
              ) : null}

              <label className="inline-control research-reference-note">
                <input
                  type="checkbox"
                  checked={selectedReferenceIds.has(
                    researchReferenceKey({ sourceType: 'note', sourceId: selected.id }),
                  )}
                  onChange={() => toggleReference({ sourceType: 'note', sourceId: selected.id })}
                />
                将当前笔记列入本次智能参考
              </label>
              <p className="muted-copy">
                已选择 {selectedReferenceIds.size}/20
                项。选择只在当前界面会话保留，生成时仍由本地服务重新校验项目归属。
              </p>

              <div className="research-link-form">
                <label className="field">
                  <span>关联类型</span>
                  <select
                    value={targetType}
                    disabled={readOnly}
                    onChange={(event) => {
                      setTargetType(event.target.value as ResearchTargetType);
                      setTargetId('');
                    }}
                  >
                    {TARGET_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>选择故事对象</span>
                  <select
                    value={targetId}
                    disabled={readOnly}
                    onChange={(event) => setTargetId(event.target.value)}
                  >
                    <option value="">
                      请选择{TARGET_OPTIONS.find(([value]) => value === targetType)?.[1]}
                    </option>
                    {linkTargetOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <details>
                  <summary>高级：使用内部对象标识</summary>
                  <label className="field">
                    <span>内部对象标识</span>
                    <input
                      value={targetId}
                      disabled={readOnly}
                      onChange={(event) => setTargetId(event.target.value)}
                      placeholder="粘贴当前作品内对象 ID"
                    />
                  </label>
                </details>
                <button
                  type="button"
                  className="button secondary"
                  disabled={readOnly || pending !== null || !targetId.trim()}
                  onClick={() => void addLink()}
                >
                  建立关联
                </button>
              </div>

              <div className="stack-list compact-list">
                {selectedLinks.map((link) => {
                  const navigation = linkNavigation(projectId, link);
                  return (
                    <div key={link.id} className="list-card list-card--static">
                      <strong>
                        {TARGET_OPTIONS.find(([type]) => type === link.targetType)?.[1] ??
                          link.targetType}
                      </strong>
                      <span>{link.targetId}</span>
                      <div className="button-row">
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => onNavigate(navigation)}
                        >
                          打开
                        </button>
                        <button
                          type="button"
                          className="text-button danger"
                          disabled={readOnly || pending !== null}
                          onClick={() => void removeLink(link.id)}
                        >
                          移除
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
