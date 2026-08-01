import { useCallback, useEffect, useState, type FormEvent } from 'react';

import type {
  Chapter,
  LifecycleStatus,
  ProjectStructure,
  StructureOperationPreview,
  TrashEntry,
  Volume,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeCommand, useBridgeQuery } from '../../bridge/use-bridge-resource.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';

interface StructureNavigatorProps {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly selectedChapterId?: string | null;
  readonly onSelectChapter?: (chapterId: string) => void;
  readonly onOpenChapter?: (chapter: Chapter) => void;
  readonly onBeforeWrite?: () => Promise<boolean>;
  readonly onStatus?: (status: string) => void;
  readonly compact?: boolean;
}

type StructureEditor =
  | { readonly kind: 'create-volume' }
  | { readonly kind: 'edit-volume'; readonly volume: Volume }
  | { readonly kind: 'create-chapter'; readonly volume: Volume }
  | { readonly kind: 'edit-chapter'; readonly volume: Volume; readonly chapter: Chapter };

export function StructureNavigator({
  bridge,
  projectId,
  readOnly,
  selectedChapterId,
  onSelectChapter,
  onOpenChapter,
  onBeforeWrite,
  onStatus,
  compact = false,
}: StructureNavigatorProps) {
  const load = useCallback(
    () => bridge.planning.listStructure(projectId, { mode: 'replace' }),
    [bridge, projectId],
  );
  const resource = useBridgeQuery(`structure:${projectId}`, load);
  const [editor, setEditor] = useState<StructureEditor | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [internalSelectedChapterId, setInternalSelectedChapterId] = useState<string | null>(null);
  const command = useBridgeCommand(resource.refresh);
  const previewCommand = useBridgeCommand();
  const activeSelectedChapterId =
    selectedChapterId === undefined ? internalSelectedChapterId : selectedChapterId;

  useEffect(() => {
    const chapters = resource.data?.volumes.flatMap((volume) => volume.chapters) ?? [];
    if (
      activeSelectedChapterId &&
      chapters.some((chapter) => chapter.id === activeSelectedChapterId)
    )
      return;
    const first = resource.data?.volumes[0]?.chapters[0];
    if (!first) {
      if (selectedChapterId === undefined) setInternalSelectedChapterId(null);
      return;
    }
    if (onSelectChapter) onSelectChapter(first.id);
    else setInternalSelectedChapterId(first.id);
  }, [activeSelectedChapterId, onSelectChapter, resource.data, selectedChapterId]);

  const removeVolume = async (volume: Volume): Promise<void> => {
    if (!window.confirm(`将“${volume.title}”移入回收站？`)) return;
    if (onBeforeWrite && !(await onBeforeWrite())) return;
    const result = await command.run(() =>
      bridge.planning.deleteVolume({ projectId, volumeId: volume.id }),
    );
    if (result) onStatus?.('卷已移入回收站。');
  };
  const removeChapter = async (chapter: Chapter): Promise<void> => {
    if (!window.confirm(`将“${chapter.title}”移入回收站？`)) return;
    if (onBeforeWrite && !(await onBeforeWrite())) return;
    const result = await command.run(() =>
      bridge.planning.deleteChapter({ projectId, chapterId: chapter.id }),
    );
    if (result) onStatus?.('章节已移入回收站。');
  };

  const splitChapter = async (chapter: Chapter): Promise<void> => {
    const title = window.prompt('新章节标题：', `${chapter.title}（下）`)?.trim();
    if (!title || (onBeforeWrite && !(await onBeforeWrite()))) return;
    const draft = await previewCommand.run(() =>
      bridge.draft.open({ projectId, chapterId: chapter.id }, { mode: 'replace' }),
    );
    if (!draft || draft.blocks.length < 2) {
      onStatus?.('章节至少需要两个正文块才能拆分。');
      return;
    }
    const rawPosition = window.prompt(
      `在第几个正文块后拆分？请输入1—${draft.blocks.length - 1}：`,
      String(Math.max(1, Math.floor(draft.blocks.length / 2))),
    );
    const position = Number(rawPosition);
    const splitAfter = Number.isInteger(position) ? draft.blocks[position - 1] : undefined;
    if (!splitAfter || position < 1 || position >= draft.blocks.length) {
      onStatus?.('拆分位置无效，未修改项目。');
      return;
    }
    const input = {
      projectId,
      chapterId: chapter.id,
      draftId: draft.draftId,
      baseRevision: draft.revision,
      splitAfterLogicalBlockId: splitAfter.logicalBlockId,
      newChapterTitle: title,
    };
    const preview = await previewCommand.run(() => bridge.planning.previewSplitChapter(input));
    if (!preview) return;
    onStatus?.(previewMessage(preview));
    if (
      !preview.canExecute ||
      !window.confirm(`${previewMessage(preview)}\n确认执行并创建恢复点？`)
    )
      return;
    const result = await command.run(() =>
      bridge.planning.splitChapter({ ...input, planHash: preview.planHash }),
    );
    if (result) onStatus?.(`章节已拆分 · 恢复点 ${result.backupId.slice(0, 8)}…`);
  };

  const mergeChapter = async (
    volume: Volume,
    chapter: Chapter,
    chapterIndex: number,
  ): Promise<void> => {
    const target = volume.chapters[chapterIndex + 1] ?? volume.chapters[chapterIndex - 1];
    if (!target || (onBeforeWrite && !(await onBeforeWrite()))) return;
    const [sourceOutcome, targetOutcome] = await Promise.all([
      bridge.draft.open({ projectId, chapterId: chapter.id }, { mode: 'replace' }),
      bridge.draft.open({ projectId, chapterId: target.id }, { mode: 'replace' }),
    ]);
    if (sourceOutcome.state !== 'success' || targetOutcome.state !== 'success') {
      onStatus?.('合并预览读取正文失败，未修改项目。');
      return;
    }
    const sourceDraft = sourceOutcome.data;
    const targetDraft = targetOutcome.data;
    const input = {
      projectId,
      sourceChapterId: chapter.id,
      sourceDraftId: sourceDraft.draftId,
      sourceBaseRevision: sourceDraft.revision,
      targetChapterId: target.id,
      targetDraftId: targetDraft.draftId,
      targetBaseRevision: targetDraft.revision,
    };
    const preview = await previewCommand.run(() => bridge.planning.previewMergeChapters(input));
    if (!preview) return;
    onStatus?.(previewMessage(preview));
    if (
      !preview.canExecute ||
      !window.confirm(`将“${chapter.title}”合并到“${target.title}”？\n${previewMessage(preview)}`)
    )
      return;
    const result = await command.run(() =>
      bridge.planning.mergeChapters({ ...input, planHash: preview.planHash }),
    );
    if (result) onStatus?.(`章节已合并 · 恢复点 ${result.backupId.slice(0, 8)}…`);
  };

  const moveBlocks = async (
    volume: Volume,
    chapter: Chapter,
    chapterIndex: number,
  ): Promise<void> => {
    const target = volume.chapters[chapterIndex + 1] ?? volume.chapters[chapterIndex - 1];
    if (!target || (onBeforeWrite && !(await onBeforeWrite()))) return;
    const [sourceOutcome, targetOutcome] = await Promise.all([
      bridge.draft.open({ projectId, chapterId: chapter.id }, { mode: 'replace' }),
      bridge.draft.open({ projectId, chapterId: target.id }, { mode: 'replace' }),
    ]);
    if (sourceOutcome.state !== 'success' || targetOutcome.state !== 'success') {
      onStatus?.('正文块移动预览读取正文失败，未修改项目。');
      return;
    }
    const sourceDraft = sourceOutcome.data;
    const targetDraft = targetOutcome.data;
    const rawIndices = window.prompt(
      `选择从“${chapter.title}”移动的正文块序号（逗号分隔，1—${sourceDraft.blocks.length}）：`,
      '1',
    );
    if (!rawIndices) return;
    const indices = [...new Set(rawIndices.split(/[,，\s]+/u).map(Number))];
    const logicalBlockIds = indices.flatMap((index) => {
      const block = sourceDraft.blocks[index - 1];
      return block ? [block.logicalBlockId] : [];
    });
    if (logicalBlockIds.length !== indices.length) {
      onStatus?.('正文块序号无效，未修改项目。');
      return;
    }
    const afterRaw = window.prompt(
      `插入到“${target.title}”第几个块之后？0表示开头，最多${targetDraft.blocks.length}：`,
      String(targetDraft.blocks.length),
    );
    const afterIndex = Number(afterRaw);
    if (!Number.isInteger(afterIndex) || afterIndex < 0 || afterIndex > targetDraft.blocks.length)
      return;
    const input = {
      projectId,
      sourceChapterId: chapter.id,
      sourceDraftId: sourceDraft.draftId,
      sourceBaseRevision: sourceDraft.revision,
      targetChapterId: target.id,
      targetDraftId: targetDraft.draftId,
      targetBaseRevision: targetDraft.revision,
      logicalBlockIds,
      afterTargetLogicalBlockId: targetDraft.blocks[afterIndex - 1]?.logicalBlockId ?? null,
    };
    const preview = await previewCommand.run(() => bridge.planning.previewMoveBlocks(input));
    if (!preview) return;
    onStatus?.(previewMessage(preview));
    if (
      !preview.canExecute ||
      !window.confirm(`${previewMessage(preview)}\n确认移动并创建恢复点？`)
    )
      return;
    const result = await command.run(() =>
      bridge.planning.moveBlocks({ ...input, planHash: preview.planHash }),
    );
    if (result) onStatus?.(`正文块已跨章移动 · 恢复点 ${result.backupId.slice(0, 8)}…`);
  };

  return (
    <aside
      className={compact ? 'structure-navigator is-compact' : 'structure-navigator'}
      data-structure-panel
    >
      <div className="feature-card__heading">
        <div>
          <h2>卷章目录</h2>
          {!compact ? <p>生命周期与目标字数由本地服务维护。</p> : null}
        </div>
        <div className="inline-actions">
          <button
            className="quiet-button"
            data-create-volume
            disabled={readOnly || command.pending}
            type="button"
            onClick={() => setEditor({ kind: 'create-volume' })}
          >
            新建卷
          </button>
          <button
            className="quiet-button"
            data-open-trash
            type="button"
            onClick={() => setTrashOpen(true)}
          >
            回收站
          </button>
        </div>
      </div>
      <p className="feature-status" data-structure-state role="status">
        {command.error ? `${authorErrorSummary(command.error)}` : ''}
      </p>
      <div className="structure-tree" data-structure-tree>
        {resource.state === 'loading' ? <p>正在读取卷章…</p> : null}
        {resource.error ? <InlineError error={resource.error} onRetry={resource.refresh} /> : null}
        {resource.data?.volumes.length === 0 ? (
          <p data-structure-empty>专业空白项目：从新建卷开始。</p>
        ) : null}
        {resource.data?.volumes.map((volume, volumeIndex) => (
          <section
            className="structure-volume"
            data-volume-id={volume.id}
            data-volume-title={volume.title}
            key={volume.id}
          >
            <div className="structure-row">
              <strong>{volume.title}</strong>
              <span>{statusLabel(volume.status)}</span>
              <div className="inline-actions">
                <button
                  data-add-chapter
                  title="新建章节"
                  type="button"
                  disabled={readOnly}
                  onClick={() => setEditor({ kind: 'create-chapter', volume })}
                >
                  +章
                </button>
                <button
                  data-edit-volume
                  title="编辑卷"
                  type="button"
                  disabled={readOnly}
                  onClick={() => setEditor({ kind: 'edit-volume', volume })}
                >
                  编辑
                </button>
                <button
                  data-move-volume-up
                  title="上移卷"
                  type="button"
                  disabled={readOnly || volumeIndex === 0}
                  onClick={() => {
                    const previous = resource.data?.volumes[volumeIndex - 1];
                    if (!previous) return;
                    void command
                      .run(() =>
                        bridge.planning.moveVolume({
                          projectId,
                          volumeId: volume.id,
                          placement: { kind: 'before', siblingId: previous.id },
                        }),
                      )
                      .then((result) => result && onStatus?.('卷顺序已更新。'));
                  }}
                >
                  ↑
                </button>
                <button
                  data-delete-volume
                  title="删除卷"
                  type="button"
                  disabled={readOnly}
                  onClick={() => void removeVolume(volume)}
                >
                  删除
                </button>
              </div>
            </div>
            <div className="structure-chapters">
              {volume.chapters.map((chapter, chapterIndex) => (
                <div
                  className={
                    activeSelectedChapterId === chapter.id
                      ? 'structure-row chapter-node is-selected is-active'
                      : 'structure-row chapter-node'
                  }
                  data-chapter-id={chapter.id}
                  data-chapter-title={chapter.title}
                  key={chapter.id}
                >
                  <button
                    className="structure-chapter-title"
                    data-open-chapter
                    type="button"
                    onClick={() => {
                      if (selectedChapterId === undefined) setInternalSelectedChapterId(chapter.id);
                      onSelectChapter?.(chapter.id);
                      onOpenChapter?.(chapter);
                    }}
                  >
                    <strong>{chapter.title}</strong>
                    <span>{chapterMeta(chapter)}</span>
                  </button>
                  <div className="inline-actions">
                    <button
                      data-edit-chapter
                      title="编辑章节"
                      type="button"
                      disabled={readOnly}
                      onClick={() => setEditor({ kind: 'edit-chapter', volume, chapter })}
                    >
                      编辑
                    </button>
                    <button
                      data-split-chapter
                      title="预览并拆分章节"
                      type="button"
                      disabled={readOnly || command.pending || previewCommand.pending}
                      onClick={() => void splitChapter(chapter)}
                    >
                      拆
                    </button>
                    <button
                      data-merge-chapter
                      title="预览并合并章节"
                      type="button"
                      disabled={
                        readOnly ||
                        volume.chapters.length < 2 ||
                        command.pending ||
                        previewCommand.pending
                      }
                      onClick={() => void mergeChapter(volume, chapter, chapterIndex)}
                    >
                      并
                    </button>
                    <button
                      data-move-blocks
                      title="预览并跨章移动正文块"
                      type="button"
                      disabled={
                        readOnly ||
                        volume.chapters.length < 2 ||
                        command.pending ||
                        previewCommand.pending
                      }
                      onClick={() => void moveBlocks(volume, chapter, chapterIndex)}
                    >
                      移
                    </button>
                    <button
                      data-delete-chapter
                      title="删除章节"
                      type="button"
                      disabled={readOnly}
                      onClick={() => void removeChapter(chapter)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      {editor ? (
        <StructureDialog
          bridge={bridge}
          editor={editor}
          projectId={projectId}
          structure={resource.data}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null);
            await resource.refresh();
            onStatus?.('卷章结构已保存。');
          }}
        />
      ) : null}
      {trashOpen ? (
        <TrashDialog
          bridge={bridge}
          projectId={projectId}
          readOnly={readOnly}
          onClose={() => setTrashOpen(false)}
          onStructureRefresh={resource.refresh}
        />
      ) : null}
    </aside>
  );
}

function StructureDialog({
  bridge,
  editor,
  projectId,
  structure,
  onClose,
  onSaved,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly editor: StructureEditor;
  readonly projectId: string;
  readonly structure: ProjectStructure | null;
  readonly onClose: () => void;
  readonly onSaved: () => Promise<void>;
}) {
  const command = useBridgeCommand();
  const chapter = editor.kind === 'edit-chapter' ? editor.chapter : null;
  const volume =
    editor.kind === 'edit-volume'
      ? editor.volume
      : editor.kind === 'create-chapter' || editor.kind === 'edit-chapter'
        ? editor.volume
        : null;

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const title = String(values.get('title') ?? '').trim();
    const status = String(values.get('status') ?? 'pending') as LifecycleStatus;
    const targetVolumeId = String(values.get('volumeId') ?? volume?.id ?? '');
    let result: ProjectStructure | null;
    if (editor.kind === 'create-volume') {
      result = await command.run(() => bridge.planning.createVolume({ projectId, title }));
    } else if (editor.kind === 'edit-volume') {
      result = await command.run(() =>
        bridge.planning.updateVolume({
          projectId,
          volumeId: editor.volume.id,
          patch: { title, status },
        }),
      );
    } else if (editor.kind === 'create-chapter') {
      result = await command.run(() =>
        bridge.planning.createChapter({ projectId, volumeId: editor.volume.id, title }),
      );
    } else {
      const minimum = nullableNumber(values.get('targetWordMin'));
      const maximum = nullableNumber(values.get('targetWordMax'));
      result = await command.run(async () => {
        const updated = await bridge.planning.updateChapter({
          projectId,
          chapterId: editor.chapter.id,
          patch: { title, status, targetWordMin: minimum, targetWordMax: maximum },
        });
        if (updated.state !== 'success' || targetVolumeId === editor.volume.id) return updated;
        return bridge.planning.moveChapter({
          projectId,
          chapterId: editor.chapter.id,
          targetVolumeId,
          placement: { kind: 'end' },
        });
      });
    }
    if (result) await onSaved();
  };

  return (
    <dialog className="react-dialog" data-structure-dialog open>
      <form data-structure-form onSubmit={(event) => void submit(event)}>
        <header>
          <h2 data-structure-dialog-title>{editorTitle(editor)}</h2>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </header>
        <label>
          标题
          <input
            data-structure-title
            name="title"
            defaultValue={chapter?.title ?? volume?.title ?? ''}
            required
          />
        </label>
        <label
          data-structure-status-field
          hidden={editor.kind === 'create-volume' || editor.kind === 'create-chapter'}
        >
          状态
          <select
            data-structure-status
            name="status"
            defaultValue={chapter?.status ?? volume?.status ?? 'pending'}
          >
            {['pending', 'outlined', 'writing', 'reviewing', 'finalized'].map((status) => (
              <option key={status} value={status}>
                {statusLabel(status as LifecycleStatus)}
              </option>
            ))}
          </select>
        </label>
        <label data-structure-volume-field hidden={!chapter}>
          所属卷
          <select data-structure-volume name="volumeId" defaultValue={volume?.id}>
            {structure?.volumes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <div className="word-target-grid" data-structure-word-fields hidden={!chapter}>
          <label>
            目标最少字数
            <input
              name="targetWordMin"
              type="number"
              min="0"
              defaultValue={chapter?.targetWordMin ?? ''}
            />
          </label>
          <label>
            目标最多字数
            <input
              name="targetWordMax"
              type="number"
              min="0"
              defaultValue={chapter?.targetWordMax ?? ''}
            />
          </label>
        </div>
        <p className="feature-status" data-structure-form-status>
          {command.error ? `${authorErrorSummary(command.error)}` : ''}
        </p>
        <footer>
          <button
            className="primary-button"
            data-save-structure
            disabled={command.pending}
            type="submit"
          >
            保存
          </button>
        </footer>
      </form>
    </dialog>
  );
}

function TrashDialog({
  bridge,
  projectId,
  readOnly,
  onClose,
  onStructureRefresh,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly onClose: () => void;
  readonly onStructureRefresh: () => Promise<void>;
}) {
  const load = useCallback(
    () => bridge.trash.list(projectId, { mode: 'replace' }),
    [bridge, projectId],
  );
  const resource = useBridgeQuery(`trash:${projectId}`, load);
  const [status, setStatus] = useState('恢复保留原始排序；永久删除先由本地服务计算影响。');
  const command = useBridgeCommand(async () => {
    await Promise.all([resource.refresh(), onStructureRefresh()]);
  });
  const permanentlyDelete = async (entry: TrashEntry): Promise<void> => {
    const preview = await command.run(() =>
      bridge.trash.previewPermanentDelete({ projectId, trashEntryId: entry.id }),
    );
    if (!preview) return;
    if (!preview.canDelete) {
      setStatus(
        `永久删除已阻止 · ${preview.blockers
          .map(
            (blocker) =>
              `${blocker.source ?? blocker.kind} ${blocker.deleteAction ?? ''} ×${blocker.count}`,
          )
          .join('；')}`,
      );
      return;
    }
    const confirmationTitle = window.prompt(
      `永久删除不可撤销。请输入完整标题“${entry.title}”确认：`,
    );
    if (confirmationTitle !== entry.title) {
      setStatus('标题确认不匹配，已取消永久删除；未创建恢复点。');
      return;
    }
    const result = await command.run(() =>
      bridge.trash.permanentDelete({
        projectId,
        trashEntryId: entry.id,
        planHash: preview.planHash,
        confirmationTitle,
      }),
    );
    if (result)
      setStatus(`已永久删除 · 恢复点 ${result.backupId.slice(0, 8)}… · 影响已由本地服务校验。`);
  };
  return (
    <dialog className="react-dialog" data-trash-dialog open>
      <header>
        <h2>回收站</h2>
        <button data-close-trash type="button" onClick={onClose}>
          关闭
        </button>
      </header>
      <p className="feature-status" data-trash-status role="status">
        {command.error ? `${authorErrorSummary(command.error)}` : status}
      </p>
      <div className="trash-list" data-trash-list>
        {resource.data?.entries.length === 0 ? <p data-trash-empty>回收站为空。</p> : null}
        {resource.data?.entries.map((entry) => (
          <article className="feature-row" data-trash-entry-id={entry.id} key={entry.id}>
            <div>
              <strong>{entry.title}</strong>
              <span>{entry.entityType}</span>
            </div>
            <div className="inline-actions">
              <button
                data-restore-original
                disabled={readOnly || command.pending}
                type="button"
                onClick={() =>
                  void command.run(() =>
                    bridge.trash.restore({
                      projectId,
                      trashEntryId: entry.id,
                      placement: 'original',
                    }),
                  )
                }
              >
                恢复原位
              </button>
              <button
                data-permanent-delete
                disabled={readOnly || command.pending}
                type="button"
                onClick={() => void permanentlyDelete(entry)}
              >
                永久删除
              </button>
            </div>
          </article>
        ))}
      </div>
    </dialog>
  );
}

function InlineError({
  error,
  onRetry,
}: {
  readonly error: { readonly message: string; readonly code: string };
  readonly onRetry: () => Promise<void>;
}) {
  return (
    <div className="inline-error" role="alert">
      <span>{authorErrorSummary(error)}</span>
      <button type="button" onClick={() => void onRetry()}>
        重试
      </button>
    </div>
  );
}

function nullableNumber(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? '').trim();
  return text ? Number(text) : null;
}

function editorTitle(editor: StructureEditor): string {
  if (editor.kind === 'create-volume') return '新建卷';
  if (editor.kind === 'edit-volume') return '编辑卷';
  if (editor.kind === 'create-chapter') return '新建章节';
  return '编辑章节';
}

function statusLabel(status: LifecycleStatus): string {
  return {
    pending: '待规划',
    outlined: '已规划',
    writing: '写作中',
    reviewing: '审阅中',
    finalized: '已定稿',
  }[status];
}

function chapterMeta(chapter: Chapter): string {
  const range =
    chapter.targetWordMin === null && chapter.targetWordMax === null
      ? ''
      : ` · ${chapter.targetWordMin ?? 0}—${chapter.targetWordMax ?? '∞'} 字`;
  return `${statusLabel(chapter.status)}${range}`;
}

function previewMessage(preview: StructureOperationPreview): string {
  const lockNotice = preview.lockedLogicalBlockIds.length
    ? ` · 锁定块 ${preview.lockedLogicalBlockIds.length}`
    : '';
  const warnings = preview.warnings.length ? ` · ${preview.warnings.join('；')}` : '';
  return `影响正文块 ${preview.movedLogicalBlockIds.length} · 源章 ${preview.sourceBlockCount}→${preview.resultingSourceBlockCount} · 目标章 ${preview.targetBlockCount}→${preview.resultingTargetBlockCount}${lockNotice}${warnings}`;
}
