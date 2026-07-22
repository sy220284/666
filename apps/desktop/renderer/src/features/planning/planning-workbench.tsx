import { useCallback, useEffect, useState, type FormEvent } from 'react';

import type {
  Chapter,
  Entity,
  LifecycleStatus,
  PlotNode,
  PlotNodeType,
  ProjectBrief,
  ProjectStructure,
  SceneBeat,
  SceneBeatType,
  StructureOperationPreview,
  TrashEntry,
  Volume,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeCommand, useBridgeQuery } from '../../bridge/use-bridge-resource.js';

interface PlanningWorkbenchProps {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly onClose: () => void;
}

export function PlanningWorkbench({
  bridge,
  projectId,
  readOnly,
  onClose,
}: PlanningWorkbenchProps) {
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const loadBrief = useCallback(
    () => bridge.planning.getBrief(projectId, { mode: 'replace' }),
    [bridge, projectId],
  );
  const loadOutline = useCallback(
    () => bridge.planning.listPlotNodes(projectId, { mode: 'replace' }),
    [bridge, projectId],
  );
  const loadEntities = useCallback(
    () => bridge.canon.list({ projectId, includeArchived: false }, { mode: 'replace' }),
    [bridge, projectId],
  );
  const loadNarrative = useCallback(
    () =>
      bridge.narrativePlanning.list(
        { projectId, query: '', includeResolved: true, referenceChapterId: selectedChapterId },
        { mode: 'replace' },
      ),
    [bridge, projectId, selectedChapterId],
  );
  const brief = useBridgeQuery(`brief:${projectId}`, loadBrief);
  const outline = useBridgeQuery(`outline:${projectId}`, loadOutline);
  const entities = useBridgeQuery(`planning-entities:${projectId}`, loadEntities);
  const [briefSkipped, setBriefSkipped] = useState(false);
  const [professional, setProfessional] = useState(false);
  const [plotEditor, setPlotEditor] = useState<{ node?: PlotNode; parentId: string | null } | null>(
    null,
  );
  const [status, setStatus] = useState('规划只修改权威规划数据，不会自动改写正文。');
  const narrative = useBridgeQuery(
    `planning-narrative:${projectId}:${selectedChapterId ?? 'all'}`,
    loadNarrative,
  );

  return (
    <section className="planning-workbench" data-planning-dialog aria-label="规划工作台">
      <header className="feature-heading">
        <div>
          <p className="eyebrow">Planning</p>
          <h1>规划工作台</h1>
          <p>卷章与大纲、任务书、SceneBeat及相关设定在同一上下文中协作。</p>
        </div>
        <div className="feature-heading__actions">
          <button
            className={!professional ? 'quiet-button is-active' : 'quiet-button'}
            data-planning-mode="beginner"
            type="button"
            onClick={() => setProfessional(false)}
          >
            引导
          </button>
          <button
            className={professional ? 'quiet-button is-active' : 'quiet-button'}
            data-planning-mode="professional"
            type="button"
            onClick={() => setProfessional(true)}
          >
            专业
          </button>
          <button className="quiet-button" data-close-planning type="button" onClick={onClose}>
            返回写作
          </button>
        </div>
      </header>

      <p className="feature-status" data-planning-status role="status">
        {status}
      </p>

      <div className="planning-grid">
        <StructureNavigator
          bridge={bridge}
          projectId={projectId}
          readOnly={readOnly}
          selectedChapterId={selectedChapterId}
          onSelectChapter={setSelectedChapterId}
          onStatus={setStatus}
        />

        <main className="planning-center">
          {briefSkipped ? (
            <section className="feature-card" data-brief-skipped>
              <h2>任务书已暂时收起</h2>
              <p>可继续自由规划；恢复后仍从Core读取已保存内容。</p>
              <button
                className="quiet-button"
                data-restore-brief
                type="button"
                onClick={() => setBriefSkipped(false)}
              >
                恢复任务书
              </button>
            </section>
          ) : (
            <BriefEditor
              brief={brief.data}
              disabled={readOnly}
              loading={brief.state === 'loading'}
              bridge={bridge}
              onRefresh={brief.refresh}
              onSkip={() => setBriefSkipped(true)}
              onStatus={setStatus}
            />
          )}

          <section className="feature-card outline-card">
            <div className="feature-card__heading">
              <div>
                <h2>故事大纲</h2>
                <p>拖到节点的“作为子节点”目标即可调整层级；不会移动正文。</p>
              </div>
              <button
                className="primary-button"
                data-create-root-plot-node
                disabled={readOnly}
                type="button"
                onClick={() => setPlotEditor({ parentId: null })}
              >
                新建根节点
              </button>
            </div>
            {outline.state === 'loading' ? <p>正在读取大纲…</p> : null}
            {outline.error ? <InlineError error={outline.error} onRetry={outline.refresh} /> : null}
            {outline.data?.nodes.length ? (
              <PlotTree
                bridge={bridge}
                nodes={outline.data.nodes}
                projectId={projectId}
                readOnly={readOnly}
                onEdit={(node) => setPlotEditor({ node, parentId: node.parentId })}
                onCreateChild={(parentId) => setPlotEditor({ parentId })}
                onRefresh={outline.refresh}
                onStatus={setStatus}
              />
            ) : outline.state === 'success' ? (
              <p data-outline-empty>尚无大纲节点。可从卷、弧光或章节目标开始。</p>
            ) : null}
          </section>

          {selectedChapterId ? (
            <SceneBeatPanel
              bridge={bridge}
              chapterId={selectedChapterId}
              entities={entities.data?.entities ?? []}
              plotNodes={outline.data?.nodes ?? []}
              projectId={projectId}
              readOnly={readOnly}
              onStatus={setStatus}
            />
          ) : (
            <section className="feature-card">
              <h2>章节与SceneBeat</h2>
              <p>从左侧选择章节后编辑场景节拍。</p>
            </section>
          )}
        </main>

        <aside className="planning-context" aria-label="规划上下文">
          <section className="feature-card">
            <h2>人物与设定</h2>
            {entities.data?.entities.length ? (
              <ul className="compact-list">
                {entities.data.entities.slice(0, 12).map((entity) => (
                  <li key={entity.id}>
                    <strong>{entity.name}</strong>
                    <span>{entity.entityType}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>暂无实体。可在设定工作台建立人物、地点和规则。</p>
            )}
          </section>
          <section className="feature-card">
            <h2>权威边界</h2>
            <p>ProjectBrief、PlotNode与SceneBeat均为规划；正文块移动需要单独预览与确认。</p>
            <p>动态状态和提案不会在此自动确认为Canon。</p>
          </section>
          <section className="feature-card">
            <h2>伏笔与弧光摘要</h2>
            <p>
              伏笔 {narrative.data?.foreshadowings.length ?? 0} · 人物弧光{' '}
              {narrative.data?.characterArcs.length ?? 0}
            </p>
            <ul className="compact-list">
              {narrative.data?.foreshadowings.slice(0, 6).map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  <span>{item.status}</span>
                </li>
              ))}
              {narrative.data?.characterArcs.slice(0, 6).map((arc) => (
                <li key={arc.id}>
                  <strong>{arc.title}</strong>
                  <span>
                    {arc.status} · 节点 {arc.milestones.length}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      {plotEditor ? (
        <PlotNodeDialog
          bridge={bridge}
          editor={plotEditor}
          projectId={projectId}
          onClose={() => setPlotEditor(null)}
          onSaved={async () => {
            setPlotEditor(null);
            await outline.refresh();
            setStatus('大纲节点已保存。');
          }}
        />
      ) : null}
    </section>
  );
}

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
  const command = useBridgeCommand(resource.refresh);
  const previewCommand = useBridgeCommand();

  useEffect(() => {
    if (selectedChapterId || !onSelectChapter) return;
    const first = resource.data?.volumes[0]?.chapters[0];
    if (first) onSelectChapter(first.id);
  }, [onSelectChapter, resource.data, selectedChapterId]);

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
          {!compact ? <p>生命周期与目标字数由Core维护。</p> : null}
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
        {command.error ? `${command.error.message} · ${command.error.code}` : ''}
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
                    selectedChapterId === chapter.id
                      ? 'structure-row chapter-node is-selected'
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
          {command.error ? `${command.error.message} · ${command.error.code}` : ''}
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
  const [status, setStatus] = useState('恢复保留原始排序；永久删除先由Core计算影响。');
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
      setStatus(`已永久删除 · 恢复点 ${result.backupId.slice(0, 8)}… · 影响已由Core校验。`);
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
        {command.error ? `${command.error.message} · ${command.error.code}` : status}
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

function BriefEditor({
  brief,
  disabled,
  loading,
  bridge,
  onRefresh,
  onSkip,
  onStatus,
}: {
  readonly brief: ProjectBrief | null;
  readonly disabled: boolean;
  readonly loading: boolean;
  readonly bridge: RendererBridgeAdapter;
  readonly onRefresh: () => Promise<void>;
  readonly onSkip: () => void;
  readonly onStatus: (status: string) => void;
}) {
  const command = useBridgeCommand(onRefresh);
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!brief) return;
    const values = new FormData(event.currentTarget);
    const result = await command.run(() =>
      bridge.planning.updateBrief({
        projectId: brief.projectId,
        concept: String(values.get('concept') ?? ''),
        readingPromise: String(values.get('readingPromise') ?? ''),
        protagonistGoal: String(values.get('protagonistGoal') ?? ''),
        coreConflict: String(values.get('coreConflict') ?? ''),
        endingIntent: String(values.get('endingIntent') ?? ''),
        required: lines(values.get('required')),
        forbidden: lines(values.get('forbidden')),
      }),
    );
    if (result) onStatus('项目任务书已保存。');
  };
  return (
    <section className="feature-card">
      <div className="feature-card__heading">
        <div>
          <h2>ProjectBrief</h2>
          <p>读者承诺与创作边界。</p>
        </div>
        <button className="quiet-button" data-skip-brief type="button" onClick={onSkip}>
          稍后填写
        </button>
      </div>
      {loading ? <p>正在读取任务书…</p> : null}
      {brief ? (
        <form
          className="stacked-form"
          data-brief-form
          key={brief.updatedAt ?? 'empty'}
          onSubmit={(event) => void submit(event)}
        >
          <label>
            核心概念
            <textarea name="concept" defaultValue={brief.concept} />
          </label>
          <label>
            阅读承诺
            <textarea name="readingPromise" defaultValue={brief.readingPromise} />
          </label>
          <label>
            主角目标
            <textarea name="protagonistGoal" defaultValue={brief.protagonistGoal} />
          </label>
          <label>
            核心冲突
            <textarea name="coreConflict" defaultValue={brief.coreConflict} />
          </label>
          <label>
            结局意图
            <textarea name="endingIntent" defaultValue={brief.endingIntent} />
          </label>
          <div className="two-column-form">
            <label>
              必须出现
              <textarea name="required" defaultValue={brief.required.join('\n')} />
            </label>
            <label>
              禁止事项
              <textarea name="forbidden" defaultValue={brief.forbidden.join('\n')} />
            </label>
          </div>
          <button
            className="primary-button"
            data-save-brief
            disabled={disabled || command.pending}
            type="submit"
          >
            保存任务书
          </button>
          {command.error ? (
            <p className="form-error">
              {command.error.message} · {command.error.code}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}

function PlotTree({
  bridge,
  nodes,
  projectId,
  readOnly,
  onEdit,
  onCreateChild,
  onRefresh,
  onStatus,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly nodes: readonly PlotNode[];
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly onEdit: (node: PlotNode) => void;
  readonly onCreateChild: (parentId: string) => void;
  readonly onRefresh: () => Promise<void>;
  readonly onStatus: (status: string) => void;
}) {
  const command = useBridgeCommand(onRefresh);
  const move = async (
    nodeId: string,
    parentId: string | null,
    placement:
      | { readonly kind: 'end' }
      | { readonly kind: 'before' | 'after'; readonly siblingId: string } = { kind: 'end' },
  ): Promise<void> => {
    const result = await command.run(() =>
      bridge.planning.movePlotNode({
        projectId,
        nodeId,
        targetParentId: parentId,
        placement,
      }),
    );
    if (result) onStatus('大纲节点已移动；正文未发生变化。');
  };
  const render = (node: PlotNode): React.JSX.Element => {
    const children = sortedPlotNodes(nodes, node.id);
    const siblings = sortedPlotNodes(nodes, node.parentId);
    const siblingIndex = siblings.findIndex((candidate) => candidate.id === node.id);
    return (
      <article
        data-plot-node-id={node.id}
        draggable={!readOnly}
        key={node.id}
        onDragStart={(event) => event.dataTransfer.setData('text/worldforge-plot-node', node.id)}
      >
        <div className="plot-node__summary">
          <div>
            <strong>{node.title}</strong>
            <span>
              {node.nodeType} · {statusLabel(node.status)}
            </span>
          </div>
          <div className="inline-actions">
            <button type="button" onClick={() => onCreateChild(node.id)}>
              +子节点
            </button>
            <button type="button" onClick={() => onEdit(node)}>
              编辑
            </button>
            <button
              aria-label={`上移${node.title}`}
              disabled={readOnly || siblingIndex <= 0}
              type="button"
              onClick={() => {
                const previous = siblings[siblingIndex - 1];
                if (previous)
                  void move(node.id, node.parentId, {
                    kind: 'before',
                    siblingId: previous.id,
                  });
              }}
            >
              ↑
            </button>
            <button
              aria-label={`下移${node.title}`}
              disabled={readOnly || siblingIndex >= siblings.length - 1}
              type="button"
              onClick={() => {
                const next = siblings[siblingIndex + 1];
                if (next) void move(node.id, node.parentId, { kind: 'after', siblingId: next.id });
              }}
            >
              ↓
            </button>
            {node.parentId ? (
              <button type="button" disabled={readOnly} onClick={() => void move(node.id, null)}>
                移到根级
              </button>
            ) : null}
            <button
              type="button"
              disabled={readOnly}
              onClick={() => {
                if (window.confirm(`删除“${node.title}”及其子节点？`))
                  void command.run(() =>
                    bridge.planning.deletePlotNode({ projectId, nodeId: node.id }),
                  );
              }}
            >
              删除
            </button>
          </div>
        </div>
        <button
          className="outline-drop-target"
          data-outline-drop-child
          disabled={readOnly}
          type="button"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const nodeId = event.dataTransfer.getData('text/worldforge-plot-node');
            if (nodeId && nodeId !== node.id) void move(nodeId, node.id);
          }}
        >
          作为子节点
        </button>
        <div className="plot-node__children">{children.map(render)}</div>
      </article>
    );
  };
  return (
    <div className="plot-tree">
      <button
        className="outline-drop-target"
        data-outline-root-drop
        disabled={readOnly}
        type="button"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const nodeId = event.dataTransfer.getData('text/worldforge-plot-node');
          if (nodeId) void move(nodeId, null);
        }}
      >
        拖到这里移回根级末尾
      </button>
      {sortedPlotNodes(nodes, null).map(render)}
    </div>
  );
}

function PlotNodeDialog({
  bridge,
  editor,
  projectId,
  onClose,
  onSaved,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly editor: { readonly node?: PlotNode; readonly parentId: string | null };
  readonly projectId: string;
  readonly onClose: () => void;
  readonly onSaved: () => Promise<void>;
}) {
  const command = useBridgeCommand();
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const fields = {
      nodeType: String(values.get('nodeType')) as PlotNodeType,
      title: String(values.get('title') ?? ''),
      goal: String(values.get('goal') ?? ''),
      coreConflict: String(values.get('coreConflict') ?? ''),
      expectedResult: String(values.get('expectedResult') ?? ''),
      status: String(values.get('status')) as LifecycleStatus,
    };
    const result = editor.node
      ? await command.run(() =>
          bridge.planning.updatePlotNode({ projectId, nodeId: editor.node!.id, patch: fields }),
        )
      : await command.run(() =>
          bridge.planning.createPlotNode({ projectId, parentId: editor.parentId, ...fields }),
        );
    if (result) await onSaved();
  };
  return (
    <dialog className="react-dialog" data-plot-node-dialog open>
      <form className="stacked-form" onSubmit={(event) => void submit(event)}>
        <header>
          <h2>{editor.node ? '编辑大纲节点' : '新建大纲节点'}</h2>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </header>
        <label>
          类型
          <select name="nodeType" defaultValue={editor.node?.nodeType ?? 'chapter'}>
            <option value="volume">卷</option>
            <option value="arc">弧光</option>
            <option value="chapter">章节</option>
          </select>
        </label>
        <label>
          标题
          <input name="title" defaultValue={editor.node?.title ?? ''} required />
        </label>
        <label>
          目标
          <textarea name="goal" defaultValue={editor.node?.goal ?? ''} />
        </label>
        <label>
          核心冲突
          <textarea name="coreConflict" defaultValue={editor.node?.coreConflict ?? ''} />
        </label>
        <label>
          预期结果
          <textarea name="expectedResult" defaultValue={editor.node?.expectedResult ?? ''} />
        </label>
        <label>
          状态
          <select name="status" defaultValue={editor.node?.status ?? 'pending'}>
            {['pending', 'outlined', 'writing', 'reviewing', 'finalized'].map((status) => (
              <option key={status} value={status}>
                {statusLabel(status as LifecycleStatus)}
              </option>
            ))}
          </select>
        </label>
        <button
          className="primary-button"
          data-save-plot-node
          disabled={command.pending}
          type="submit"
        >
          保存
        </button>
        {command.error ? (
          <p className="form-error">
            {command.error.message} · {command.error.code}
          </p>
        ) : null}
      </form>
    </dialog>
  );
}

function SceneBeatPanel({
  bridge,
  chapterId,
  entities,
  plotNodes,
  projectId,
  readOnly,
  onStatus,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly chapterId: string;
  readonly entities: readonly Entity[];
  readonly plotNodes: readonly PlotNode[];
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly onStatus: (status: string) => void;
}) {
  const load = useCallback(
    () => bridge.planning.listSceneBeats({ projectId, chapterId }, { mode: 'replace' }),
    [bridge, chapterId, projectId],
  );
  const loadStructure = useCallback(
    () => bridge.planning.listStructure(projectId, { mode: 'replace' }),
    [bridge, projectId],
  );
  const resource = useBridgeQuery(`scene-beats:${chapterId}`, load);
  const structure = useBridgeQuery(`scene-beat-structure:${projectId}`, loadStructure);
  const [editor, setEditor] = useState<{
    readonly beat: SceneBeat | null;
    readonly logicalBlockIds: readonly string[];
  } | null>(null);
  const command = useBridgeCommand(resource.refresh);
  const previewCommand = useBridgeCommand();
  const remove = async (beat: SceneBeat): Promise<void> => {
    if (!window.confirm(`删除SceneBeat“${beat.title}”？正文不会变化。`)) return;
    const result = await command.run(() =>
      bridge.planning.deleteSceneBeat({ projectId, sceneBeatId: beat.id }),
    );
    if (result) onStatus('SceneBeat已移入已删除列表；正文未变化。');
  };
  const selectLogicalBlocks = async (
    defaultIds: readonly string[] = [],
  ): Promise<string[] | null> => {
    const draft = await previewCommand.run(() =>
      bridge.draft.open({ projectId, chapterId }, { mode: 'replace' }),
    );
    if (!draft) return null;
    const defaultIndices = draft.blocks
      .flatMap((block, index) => (defaultIds.includes(block.logicalBlockId) ? [index + 1] : []))
      .join(',');
    const raw = window.prompt(
      `选择正文块序号（逗号分隔，1—${draft.blocks.length}）：`,
      defaultIndices || '1',
    );
    if (!raw) return null;
    const indices = [...new Set(raw.split(/[,，\s]+/u).map(Number))];
    const ids = indices.flatMap((index) => {
      const block = draft.blocks[index - 1];
      return block ? [block.logicalBlockId] : [];
    });
    if (ids.length !== indices.length) {
      onStatus('正文块序号无效，未修改SceneBeat。');
      return null;
    }
    return ids;
  };
  const setBlockLinks = async (beat: SceneBeat): Promise<void> => {
    const ids = await selectLogicalBlocks(beat.blockLinks.map((link) => link.logicalBlockId));
    if (!ids) return;
    const result = await command.run(() =>
      bridge.planning.setSceneBeatBlockLinks({
        projectId,
        sceneBeatId: beat.id,
        logicalBlockIds: ids,
      }),
    );
    if (result) onStatus('SceneBeat正文块引用已更新；正文内容和顺序未变化。');
  };
  const moveWithinChapter = async (beat: SceneBeat, direction: -1 | 1): Promise<void> => {
    const beats = resource.data?.beats ?? [];
    const index = beats.findIndex((candidate) => candidate.id === beat.id);
    const sibling = beats[index + direction];
    if (!sibling) return;
    const result = await command.run(() =>
      bridge.planning.moveSceneBeat({
        projectId,
        sceneBeatId: beat.id,
        chapterId,
        placement: {
          kind: direction < 0 ? 'before' : 'after',
          siblingId: sibling.id,
        },
      }),
    );
    if (result) onStatus('SceneBeat顺序已更新；正文未变化。');
  };
  const moveAcrossChapters = async (beat: SceneBeat): Promise<void> => {
    const chapters =
      structure.data?.volumes.flatMap((volume) =>
        volume.chapters.map((chapter) => ({ chapter, volumeTitle: volume.title })),
      ) ?? [];
    const targets = chapters.filter(({ chapter }) => chapter.id !== chapterId);
    if (!targets.length) {
      onStatus('需要至少两个章节才能跨章移动SceneBeat。');
      return;
    }
    const choice = window.prompt(
      `选择目标章节序号：\n${targets
        .map(({ chapter, volumeTitle }, index) => `${index + 1}. ${volumeTitle} / ${chapter.title}`)
        .join('\n')}`,
      '1',
    );
    const target = targets[Number(choice) - 1]?.chapter;
    if (!target) return;
    const input = {
      projectId,
      sceneBeatId: beat.id,
      targetChapterId: target.id,
      placement: { kind: 'end' } as const,
    };
    const preview = await previewCommand.run(() => bridge.planning.previewMoveSceneBeat(input));
    if (!preview) return;
    const impact = `关联正文块 ${preview.linkedBlockCount} · 关联人物 ${preview.linkedCharacterCount}${preview.warnings.length ? ` · ${preview.warnings.join('；')}` : ''}`;
    onStatus(`SceneBeat跨章预览：${impact}`);
    if (
      !preview.canExecute ||
      !window.confirm(
        `将“${beat.title}”移动到“${target.title}”？\n${impact}\n此步骤只移动规划；正文块如需移动必须另行确认。`,
      )
    )
      return;
    const result = await command.run(() =>
      bridge.planning.moveSceneBeatAcrossChapters({ ...input, planHash: preview.planHash }),
    );
    if (result) onStatus('SceneBeat已跨章移动；正文块未自动移动。');
  };
  return (
    <section className="feature-card">
      <div className="feature-card__heading">
        <div>
          <h2>章节与SceneBeat</h2>
          <p>规划节拍与正文块保持显式分离。</p>
        </div>
        <div className="inline-actions">
          <button
            className="quiet-button"
            data-convert-scene-beat
            disabled={readOnly || previewCommand.pending}
            type="button"
            onClick={() =>
              void selectLogicalBlocks().then((logicalBlockIds) => {
                if (logicalBlockIds) setEditor({ beat: null, logicalBlockIds });
              })
            }
          >
            从正文块转换
          </button>
          <button
            className="primary-button"
            data-create-scene-beat
            disabled={readOnly}
            type="button"
            onClick={() => setEditor({ beat: null, logicalBlockIds: [] })}
          >
            新建SceneBeat
          </button>
        </div>
      </div>
      <div data-scene-beat-list>
        {resource.data?.beats.length === 0 ? <p>当前章节尚无SceneBeat。</p> : null}
        {resource.data?.beats.map((beat, index) => (
          <article className="scene-beat-card" key={beat.id}>
            <div>
              <strong>{beat.title}</strong>
              <span>
                {beat.beatType} · {beat.wordTargetPercent}%
              </span>
            </div>
            <p>{beat.goal}</p>
            <div className="inline-actions">
              <button type="button" onClick={() => setEditor({ beat, logicalBlockIds: [] })}>
                编辑
              </button>
              <button
                aria-label={`上移${beat.title}`}
                disabled={readOnly || index === 0}
                type="button"
                onClick={() => void moveWithinChapter(beat, -1)}
              >
                ↑
              </button>
              <button
                aria-label={`下移${beat.title}`}
                disabled={readOnly || index === (resource.data?.beats.length ?? 0) - 1}
                type="button"
                onClick={() => void moveWithinChapter(beat, 1)}
              >
                ↓
              </button>
              <button disabled={readOnly} type="button" onClick={() => void setBlockLinks(beat)}>
                关联正文块
              </button>
              <button
                disabled={readOnly}
                type="button"
                onClick={() => void moveAcrossChapters(beat)}
              >
                跨章移动
              </button>
              <button type="button" disabled={readOnly} onClick={() => void remove(beat)}>
                删除
              </button>
            </div>
          </article>
        ))}
      </div>
      <details>
        <summary>已删除SceneBeat</summary>
        <div data-deleted-scene-beat-list>
          {resource.data?.deletedBeats.length === 0 ? (
            <p>无</p>
          ) : (
            resource.data?.deletedBeats.map((beat) => (
              <article className="scene-beat-card" key={beat.id}>
                <strong>{beat.title}</strong>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() =>
                    void command.run(() =>
                      bridge.planning.restoreSceneBeat({ projectId, sceneBeatId: beat.id }),
                    )
                  }
                >
                  恢复
                </button>
              </article>
            ))
          )}
        </div>
      </details>
      {editor ? (
        <SceneBeatDialog
          beat={editor.beat}
          bridge={bridge}
          chapterId={chapterId}
          entities={entities}
          plotNodes={plotNodes}
          projectId={projectId}
          convertingLogicalBlockIds={editor.logicalBlockIds}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null);
            await resource.refresh();
            onStatus('SceneBeat已保存；正文未发生变化。');
          }}
        />
      ) : null}
    </section>
  );
}

function SceneBeatDialog({
  beat,
  bridge,
  chapterId,
  entities,
  plotNodes,
  projectId,
  convertingLogicalBlockIds,
  onClose,
  onSaved,
}: {
  readonly beat: SceneBeat | null;
  readonly bridge: RendererBridgeAdapter;
  readonly chapterId: string;
  readonly entities: readonly Entity[];
  readonly plotNodes: readonly PlotNode[];
  readonly projectId: string;
  readonly convertingLogicalBlockIds: readonly string[];
  readonly onClose: () => void;
  readonly onSaved: () => Promise<void>;
}) {
  const command = useBridgeCommand();
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const fields = {
      plotNodeId: nullableString(values.get('plotNodeId')),
      title: String(values.get('title') ?? ''),
      goal: String(values.get('goal') ?? ''),
      coreConflict: String(values.get('coreConflict') ?? ''),
      expectedResult: String(values.get('expectedResult') ?? ''),
      beatType: String(values.get('beatType')) as SceneBeatType,
      wordTargetPercent: Number(values.get('wordTargetPercent') ?? 0),
      required: values.get('required') === 'on',
      characterIds: values.getAll('characterChoices').map(String).filter(Boolean),
      locationIds: values.getAll('locationChoices').map(String).filter(Boolean),
    };
    const result = beat
      ? await command.run(() =>
          bridge.planning.updateSceneBeat({ projectId, sceneBeatId: beat.id, patch: fields }),
        )
      : convertingLogicalBlockIds.length
        ? await command.run(() =>
            bridge.planning.convertBlocksToSceneBeat({
              projectId,
              chapterId,
              logicalBlockIds: [...convertingLogicalBlockIds],
              ...fields,
            }),
          )
        : await command.run(() =>
            bridge.planning.createSceneBeat({ projectId, chapterId, ...fields }),
          );
    if (result) await onSaved();
  };
  const characters = entities.filter((entity) => entity.entityType === 'character');
  const locations = entities.filter((entity) => entity.entityType === 'location');
  return (
    <dialog className="react-dialog" data-scene-beat-dialog open>
      <form className="stacked-form" onSubmit={(event) => void submit(event)}>
        <header>
          <h2>
            {beat
              ? '编辑SceneBeat'
              : convertingLogicalBlockIds.length
                ? `从 ${convertingLogicalBlockIds.length} 个正文块转换`
                : '新建SceneBeat'}
          </h2>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </header>
        <label>
          标题
          <input name="title" defaultValue={beat?.title ?? ''} required />
        </label>
        <label>
          类型
          <select name="beatType" defaultValue={beat?.beatType ?? 'development'}>
            {['setup', 'development', 'turn', 'climax', 'resolution', 'custom'].map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          大纲节点
          <select name="plotNodeId" defaultValue={beat?.plotNodeId ?? ''}>
            <option value="">未关联</option>
            {plotNodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          目标字数占比
          <input
            name="wordTargetPercent"
            type="number"
            min="0"
            max="100"
            defaultValue={beat?.wordTargetPercent ?? 0}
          />
        </label>
        <label>
          人物
          <select
            data-scene-beat-entity-selector="character"
            multiple
            name="characterChoices"
            defaultValue={beat?.characterIds ?? []}
          >
            {characters.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
              </option>
            ))}
          </select>
        </label>
        <textarea
          hidden
          name="characterIds"
          readOnly
          value={(beat?.characterIds ?? []).join('\n')}
          aria-label="人物ID兼容视图"
        />
        <label>
          地点
          <select
            data-scene-beat-entity-selector="location"
            multiple
            name="locationChoices"
            defaultValue={beat?.locationIds ?? []}
          >
            {locations.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
              </option>
            ))}
          </select>
        </label>
        <textarea
          hidden
          name="locationIds"
          readOnly
          value={(beat?.locationIds ?? []).join('\n')}
          aria-label="地点ID兼容视图"
        />
        <label>
          目标
          <textarea name="goal" defaultValue={beat?.goal ?? ''} />
        </label>
        <label>
          核心冲突
          <textarea name="coreConflict" defaultValue={beat?.coreConflict ?? ''} />
        </label>
        <label>
          预期结果
          <textarea name="expectedResult" defaultValue={beat?.expectedResult ?? ''} />
        </label>
        <label className="checkbox-row">
          <input name="required" type="checkbox" defaultChecked={beat?.required ?? false} />
          必须完成
        </label>
        <button
          className="primary-button"
          data-save-scene-beat
          disabled={command.pending}
          type="submit"
        >
          保存
        </button>
        {command.error ? (
          <p className="form-error">
            {command.error.message} · {command.error.code}
          </p>
        ) : null}
      </form>
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
      <span>
        {error.message} · {error.code}
      </span>
      <button type="button" onClick={() => void onRetry()}>
        重试
      </button>
    </div>
  );
}

function lines(value: FormDataEntryValue | null): string[] {
  return String(value ?? '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}
function nullableString(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? '').trim();
  return text || null;
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

function sortedPlotNodes(nodes: readonly PlotNode[], parentId: string | null): PlotNode[] {
  return nodes
    .filter((node) => node.parentId === parentId)
    .sort((left, right) => {
      const difference = BigInt(left.orderKey) - BigInt(right.orderKey);
      return difference < 0n ? -1 : difference > 0n ? 1 : left.id.localeCompare(right.id, 'en');
    });
}
