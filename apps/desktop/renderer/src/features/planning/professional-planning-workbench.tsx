import { useCallback, useState, type FormEvent } from 'react';

import type {
  Entity,
  LifecycleStatus,
  PlotNode,
  PlotNodeType,
  ProjectBrief,
  SceneBeat,
  SceneBeatType,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeCommand, useBridgeQuery } from '../../bridge/use-bridge-resource.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import {
  authorCharacterArcStatusLabel,
  authorEntityTypeLabel,
  authorForeshadowingStatusLabel,
  authorPlotNodeTypeLabel,
  authorSceneBeatTypeLabel,
} from '../../presentation/author-value-format.js';
import { StructureNavigator } from '../structure/structure-navigator.js';

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
          <p className="eyebrow">完整规划</p>
          <h1>完整规划工作台</h1>
          <p>卷章与大纲、作品任务书、场景节拍及相关设定在同一上下文中协作。</p>
        </div>
        <div className="feature-heading__actions">
          <button
            className={!professional ? 'quiet-button is-active' : 'quiet-button'}
            data-planning-mode="beginner"
            type="button"
            onClick={() => setProfessional(false)}
          >
            简明
          </button>
          <button
            className={professional ? 'quiet-button is-active' : 'quiet-button'}
            data-planning-mode="professional"
            type="button"
            onClick={() => setProfessional(true)}
          >
            完整
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
              <p>可继续自由规划；恢复后仍从本地服务读取已保存内容。</p>
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
              <h2>章节与场景节拍</h2>
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
                    <span>{authorEntityTypeLabel(entity.entityType)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>暂无人物或设定。可在设定工作台建立人物、地点和规则。</p>
            )}
          </section>
          <section className="feature-card">
            <h2>权威边界</h2>
            <p>作品任务书、大纲节点与场景节拍均属于规划；正文块移动需要单独预览与确认。</p>
            <p>动态状态和设定更新建议不会在此自动确认为已确认设定。</p>
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
                  <span>{authorForeshadowingStatusLabel(item.status)}</span>
                </li>
              ))}
              {narrative.data?.characterArcs.slice(0, 6).map((arc) => (
                <li key={arc.id}>
                  <strong>{arc.title}</strong>
                  <span>
                    {authorCharacterArcStatusLabel(arc.status)} · 节点 {arc.milestones.length}
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
          {command.error ? <p className="form-error">{authorErrorSummary(command.error)}</p> : null}
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
              {authorPlotNodeTypeLabel(node.nodeType)} · {statusLabel(node.status)}
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
        {command.error ? <p className="form-error">{authorErrorSummary(command.error)}</p> : null}
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
    if (!window.confirm(`删除场景节拍“${beat.title}”？正文不会变化。`)) return;
    const result = await command.run(() =>
      bridge.planning.deleteSceneBeat({ projectId, sceneBeatId: beat.id }),
    );
    if (result) onStatus('场景节拍已移入已删除列表；正文未变化。');
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
      onStatus('正文块序号无效，未修改场景节拍。');
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
    if (result) onStatus('场景节拍的正文块引用已更新；正文内容和顺序未变化。');
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
    if (result) onStatus('场景节拍顺序已更新；正文未变化。');
  };
  const moveAcrossChapters = async (beat: SceneBeat): Promise<void> => {
    const chapters =
      structure.data?.volumes.flatMap((volume) =>
        volume.chapters.map((chapter) => ({ chapter, volumeTitle: volume.title })),
      ) ?? [];
    const targets = chapters.filter(({ chapter }) => chapter.id !== chapterId);
    if (!targets.length) {
      onStatus('需要至少两个章节才能跨章移动场景节拍。');
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
    onStatus(`场景节拍跨章预览：${impact}`);
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
    if (result) onStatus('场景节拍已跨章移动；正文块未自动移动。');
  };
  return (
    <section className="feature-card">
      <div className="feature-card__heading">
        <div>
          <h2>章节与场景节拍</h2>
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
            新建场景节拍
          </button>
        </div>
      </div>
      <div data-scene-beat-list>
        {resource.data?.beats.length === 0 ? <p>当前章节尚无场景节拍。</p> : null}
        {resource.data?.beats.map((beat, index) => (
          <article className="scene-beat-card" key={beat.id}>
            <div>
              <strong>{beat.title}</strong>
              <span>
                {authorSceneBeatTypeLabel(beat.beatType)} · {beat.wordTargetPercent}%
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
        <summary>已删除场景节拍</summary>
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
            onStatus('场景节拍已保存；正文未发生变化。');
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
              ? '编辑场景节拍'
              : convertingLogicalBlockIds.length
                ? `从 ${convertingLogicalBlockIds.length} 个正文块转换`
                : '新建场景节拍'}
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
                {authorSceneBeatTypeLabel(type)}
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
        {command.error ? <p className="form-error">{authorErrorSummary(command.error)}</p> : null}
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
      <span>{authorErrorSummary(error)}</span>
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
function statusLabel(status: LifecycleStatus): string {
  return {
    pending: '待规划',
    outlined: '已规划',
    writing: '写作中',
    reviewing: '审阅中',
    finalized: '已定稿',
  }[status];
}
function sortedPlotNodes(nodes: readonly PlotNode[], parentId: string | null): PlotNode[] {
  return nodes
    .filter((node) => node.parentId === parentId)
    .sort((left, right) => {
      const difference = BigInt(left.orderKey) - BigInt(right.orderKey);
      return difference < 0n ? -1 : difference > 0n ? 1 : left.id.localeCompare(right.id, 'en');
    });
}
