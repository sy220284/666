import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  ResearchAttachment,
  ResearchCatalog,
  ResearchLink,
  ResearchNote,
  ResearchTargetType,
} from "@worldforge/contracts";

import type { RendererBridgeAdapter } from "../../bridge/renderer-bridge-adapter.js";
import { authorErrorSummary } from "../../presentation/author-error-message.js";
import type { AuthorNavigationTarget } from "../../shell/navigation-target.js";

interface ResearchWorkbenchProps {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly selectedNoteId: string | null;
  readonly navigationQuery: string | null;
  readonly onNavigate: (target: AuthorNavigationTarget) => void;
  readonly onSelectNote: (noteId: string | null) => void;
  readonly onClose: () => void;
}

const TARGET_OPTIONS: readonly [ResearchTargetType, string][] = [
  ["chapter", "章节"],
  ["entity", "人物或设定"],
  ["relationship", "人物关系"],
  ["timeline", "时间线事件"],
  ["foreshadowing", "伏笔"],
  ["arc", "人物成长线"],
  ["idea", "灵感"],
];

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

function linkNavigation(
  projectId: string,
  link: ResearchLink,
): AuthorNavigationTarget | null {
  if (link.targetType === "chapter") {
    return {
      type: "draft-block",
      projectId,
      chapterId: link.targetId,
      logicalBlockId: null,
      query: null,
    };
  }
  if (link.targetType === "entity") {
    return { type: "entity", projectId, entityId: link.targetId, query: null };
  }
  if (link.targetType === "foreshadowing") {
    return {
      type: "foreshadowing",
      projectId,
      foreshadowingId: link.targetId,
      chapterId: null,
      query: null,
    };
  }
  return null;
}

export function ResearchWorkbench({
  bridge,
  projectId,
  readOnly,
  selectedNoteId,
  navigationQuery,
  onNavigate,
  onSelectNote,
  onClose,
}: ResearchWorkbenchProps) {
  const [catalog, setCatalog] = useState<ResearchCatalog | null>(null);
  const [query, setQuery] = useState(navigationQuery ?? "");
  const [showArchived, setShowArchived] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sourceUri, setSourceUri] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [targetType, setTargetType] = useState<ResearchTargetType>("chapter");
  const [targetId, setTargetId] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState(
    "研究资料不会自动写入人物与世界，也不会自动进入智能上下文。",
  );
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<
    ReadonlySet<string>
  >(new Set());

  const selected = useMemo(
    () => catalog?.notes.find((note) => note.id === selectedNoteId) ?? null,
    [catalog?.notes, selectedNoteId],
  );
  const selectedAttachments = useMemo(
    () =>
      catalog?.attachments.filter(
        (attachment) => attachment.noteId === selectedNoteId,
      ) ?? [],
    [catalog?.attachments, selectedNoteId],
  );
  const selectedLinks = useMemo(
    () =>
      catalog?.links.filter(
        (link) =>
          link.sourceType === "note" && link.sourceId === selectedNoteId,
      ) ?? [],
    [catalog?.links, selectedNoteId],
  );

  const load = useCallback(async (): Promise<void> => {
    const outcome = await bridge.research.list(
      {
        projectId,
        includeArchived: showArchived,
        ...(query.trim() ? { query: query.trim() } : {}),
      },
      {
        mode: "share",
        requestKey: `research.list:${projectId}:${showArchived}:${query.trim()}`,
      },
    );
    if (outcome.state !== "success") {
      if (outcome.state === "failure") {
        setNotice(`研究资料读取失败：${authorErrorSummary(outcome.error)}`);
      }
      return;
    }
    setCatalog(outcome.data);
    if (
      selectedNoteId &&
      !outcome.data.notes.some((note) => note.id === selectedNoteId)
    ) {
      onSelectNote(outcome.data.notes[0]?.id ?? null);
    } else if (!selectedNoteId && outcome.data.notes[0]) {
      onSelectNote(outcome.data.notes[0].id);
    }
  }, [
    bridge.research,
    onSelectNote,
    projectId,
    query,
    selectedNoteId,
    showArchived,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) {
      setTitle("");
      setBody("");
      setSourceUri("");
      setTagsText("");
      return;
    }
    setTitle(selected.title);
    setBody(selected.body);
    setSourceUri(selected.sourceUri ?? "");
    setTagsText(selected.tags.join("，"));
  }, [selected]);

  const applyCatalog = (next: ResearchCatalog, preferredId?: string): void => {
    setCatalog(next);
    if (preferredId) onSelectNote(preferredId);
    else if (
      selectedNoteId &&
      next.notes.some((note) => note.id === selectedNoteId)
    ) {
      onSelectNote(selectedNoteId);
    } else onSelectNote(next.notes[0]?.id ?? null);
  };

  const createNote = async (): Promise<void> => {
    if (readOnly || pending) return;
    setPending("create");
    const outcome = await bridge.research.createNote(
      {
        projectId,
        title: "未命名研究笔记",
        body: "",
        sourceUri: null,
        tags: [],
      },
      { mode: "reject", requestKey: `research.create:${projectId}` },
    );
    setPending(null);
    if (outcome.state === "success") {
      const created =
        outcome.data.notes.find((note) => note.title === "未命名研究笔记") ??
        outcome.data.notes[0];
      applyCatalog(outcome.data, created?.id);
      setNotice("研究笔记已创建。");
    } else if (outcome.state === "failure") {
      setNotice(`创建失败：${authorErrorSummary(outcome.error)}`);
    }
  };

  const saveNote = async (): Promise<void> => {
    if (!selected || readOnly || pending || !title.trim()) return;
    setPending("save");
    const outcome = await bridge.research.updateNote(
      {
        projectId,
        noteId: selected.id,
        expectedUpdatedAt: selected.updatedAt,
        title: title.trim(),
        body,
        sourceUri: sourceUri.trim() || null,
        tags: splitTags(tagsText),
      },
      { mode: "reject", requestKey: `research.save:${selected.id}` },
    );
    setPending(null);
    if (outcome.state === "success") {
      applyCatalog(outcome.data, selected.id);
      setNotice("研究笔记已保存。");
    } else if (outcome.state === "failure") {
      setNotice(`保存失败：${authorErrorSummary(outcome.error)}`);
    }
  };

  const toggleArchived = async (): Promise<void> => {
    if (!selected || readOnly || pending) return;
    setPending("status");
    const outcome = await bridge.research.setNoteStatus(
      {
        projectId,
        noteId: selected.id,
        expectedUpdatedAt: selected.updatedAt,
        status: selected.status === "active" ? "archived" : "active",
      },
      { mode: "reject", requestKey: `research.status:${selected.id}` },
    );
    setPending(null);
    if (outcome.state === "success") {
      applyCatalog(outcome.data, selected.id);
      setNotice(
        selected.status === "active" ? "研究笔记已归档。" : "研究笔记已恢复。",
      );
    } else if (outcome.state === "failure") {
      setNotice(`状态更新失败：${authorErrorSummary(outcome.error)}`);
    }
  };

  const importAttachment = async (): Promise<void> => {
    if (!selected || readOnly || pending) return;
    setPending("attachment");
    const outcome = await bridge.research.importAttachment(
      { projectId, noteId: selected.id },
      { mode: "reject", requestKey: `research.attachment:${selected.id}` },
    );
    setPending(null);
    if (outcome.state === "success") {
      applyCatalog(outcome.data, selected.id);
      setNotice("附件已复制到当前作品的受管资料目录。");
    } else if (outcome.state === "failure") {
      setNotice(
        outcome.error.code === "COMMON_CANCELLED_004"
          ? "已取消选择附件。"
          : `附件导入失败：${authorErrorSummary(outcome.error)}`,
      );
    }
  };

  const deleteAttachment = async (attachmentId: string): Promise<void> => {
    if (readOnly || pending) return;
    setPending(`delete:${attachmentId}`);
    const outcome = await bridge.research.deleteAttachment(
      { projectId, attachmentId },
      {
        mode: "reject",
        requestKey: `research.deleteAttachment:${attachmentId}`,
      },
    );
    setPending(null);
    if (outcome.state === "success") {
      applyCatalog(outcome.data, selected?.id);
      setSelectedReferenceIds((current) => {
        const next = new Set(current);
        next.delete(attachmentId);
        return next;
      });
      setNotice("附件已从作品资料库移除。");
    } else if (outcome.state === "failure") {
      setNotice(`附件删除失败：${authorErrorSummary(outcome.error)}`);
    }
  };

  const addLink = async (): Promise<void> => {
    if (!selected || readOnly || pending || !targetId.trim()) return;
    setPending("link");
    const outcome = await bridge.research.addLink(
      {
        projectId,
        sourceType: "note",
        sourceId: selected.id,
        targetType,
        targetId: targetId.trim(),
      },
      {
        mode: "reject",
        requestKey: `research.link:${selected.id}:${targetType}:${targetId.trim()}`,
      },
    );
    setPending(null);
    if (outcome.state === "success") {
      applyCatalog(outcome.data, selected.id);
      setTargetId("");
      setNotice("关联已保存；研究资料仍保持独立，不会改写权威设定。");
    } else if (outcome.state === "failure") {
      setNotice(`关联失败：${authorErrorSummary(outcome.error)}`);
    }
  };

  const removeLink = async (linkId: string): Promise<void> => {
    if (readOnly || pending) return;
    setPending(`unlink:${linkId}`);
    const outcome = await bridge.research.removeLink(
      { projectId, linkId },
      { mode: "reject", requestKey: `research.unlink:${linkId}` },
    );
    setPending(null);
    if (outcome.state === "success") applyCatalog(outcome.data, selected?.id);
    else if (outcome.state === "failure") {
      setNotice(`移除关联失败：${authorErrorSummary(outcome.error)}`);
    }
  };

  const toggleReference = (id: string): void => {
    setSelectedReferenceIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < 20) next.add(id);
      return next;
    });
  };

  return (
    <main
      className="workspace-page research-workbench"
      data-testid="research-workbench"
    >
      <header className="workspace-page__header">
        <div>
          <p className="eyebrow">本地研究资料</p>
          <h1>研究资料</h1>
          <p>
            笔记与附件只作为作者资料；只有你明确勾选后，才允许进入一次智能生成请求。
          </p>
        </div>
        <div className="button-row">
          <button type="button" className="button secondary" onClick={onClose}>
            返回写作
          </button>
          <button
            type="button"
            className="button primary"
            disabled={readOnly || pending !== null}
            onClick={() => void createNote()}
          >
            新建笔记
          </button>
        </div>
      </header>

      <p className="status-line" role="status">
        {readOnly ? `只读作品 · ${notice}` : notice}
      </p>

      <section className="workspace-grid research-workbench__grid">
        <aside
          className="panel research-workbench__list"
          aria-label="研究笔记列表"
        >
          <label className="field">
            <span>搜索资料</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="标题、正文、标签或来源"
            />
          </label>
          <label className="inline-control">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
            显示已归档
          </label>
          <div className="stack-list">
            {catalog?.notes.map((note) => (
              <button
                key={note.id}
                type="button"
                className={
                  note.id === selectedNoteId
                    ? "list-card is-active"
                    : "list-card"
                }
                onClick={() => onSelectNote(note.id)}
              >
                <strong>{note.title}</strong>
                <span>
                  {note.tags.length ? note.tags.join(" · ") : "无标签"}
                  {note.status === "archived" ? " · 已归档" : ""}
                </span>
              </button>
            ))}
            {catalog && catalog.notes.length === 0 ? (
              <p className="empty-copy">还没有符合条件的研究笔记。</p>
            ) : null}
          </div>
        </aside>

        <section className="panel research-workbench__editor">
          {selected ? (
            <>
              <div className="button-row button-row--end">
                <button
                  type="button"
                  className="button secondary"
                  disabled={readOnly || pending !== null}
                  onClick={() => void toggleArchived()}
                >
                  {selected.status === "active" ? "归档" : "恢复"}
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
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label className="field">
                <span>标签</span>
                <input
                  value={tagsText}
                  disabled={readOnly}
                  onChange={(event) => setTagsText(event.target.value)}
                  placeholder="历史，地理，服饰"
                />
              </label>
              <label className="field">
                <span>来源</span>
                <input
                  value={sourceUri}
                  disabled={readOnly}
                  onChange={(event) => setSourceUri(event.target.value)}
                  placeholder="网址、书名、档案号或自己的来源说明"
                />
              </label>
              <label className="field field--grow">
                <span>笔记正文</span>
                <textarea
                  value={body}
                  disabled={readOnly}
                  onChange={(event) => setBody(event.target.value)}
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
                {selectedAttachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="list-card list-card--static"
                  >
                    <label className="inline-control">
                      <input
                        type="checkbox"
                        checked={selectedReferenceIds.has(attachment.id)}
                        onChange={() => toggleReference(attachment.id)}
                      />
                      本次智能参考
                    </label>
                    <strong>{attachmentLabel(attachment)}</strong>
                    <span>
                      SHA-256 {attachment.contentHash.slice(0, 12)}… ·
                      受管本地副本
                    </span>
                    <button
                      type="button"
                      className="text-button danger"
                      disabled={readOnly || pending !== null}
                      onClick={() => void deleteAttachment(attachment.id)}
                    >
                      删除附件
                    </button>
                  </div>
                ))}
                {selectedAttachments.length === 0 ? (
                  <p className="empty-copy">暂无附件。</p>
                ) : null}
              </div>

              <label className="inline-control research-reference-note">
                <input
                  type="checkbox"
                  checked={selectedReferenceIds.has(selected.id)}
                  onChange={() => toggleReference(selected.id)}
                />
                将当前笔记列入本次智能参考
              </label>
              <p className="muted-copy">
                已选择 {selectedReferenceIds.size}/20
                项。选择只在当前界面会话保留，生成时仍由 Core 重新校验项目归属。
              </p>

              <div className="research-link-form">
                <label className="field">
                  <span>关联类型</span>
                  <select
                    value={targetType}
                    disabled={readOnly}
                    onChange={(event) =>
                      setTargetType(event.target.value as ResearchTargetType)
                    }
                  >
                    {TARGET_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>目标 ID</span>
                  <input
                    value={targetId}
                    disabled={readOnly}
                    onChange={(event) => setTargetId(event.target.value)}
                    placeholder="粘贴当前作品内对象 ID"
                  />
                </label>
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
                        {TARGET_OPTIONS.find(
                          ([type]) => type === link.targetType,
                        )?.[1] ?? link.targetType}
                      </strong>
                      <span>{link.targetId}</span>
                      <div className="button-row">
                        {navigation ? (
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => onNavigate(navigation)}
                          >
                            打开
                          </button>
                        ) : null}
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
