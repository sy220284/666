import { useCallback, useState } from 'react';

import type { PlotNode } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeQuery } from '../../bridge/use-bridge-resource.js';
import { StructureNavigator } from '../structure/structure-navigator.js';
import { ProjectBriefEditor } from './brief/project-brief-editor.js';
import { PlotNodeDialog } from './outline/plot-node-dialog.js';
import { PlotTree } from './outline/plot-tree.js';
import { PlanningContextPanel } from './planning-context-panel.js';
import { PlanningInlineError } from './planning-inline-error.js';
import { SceneBeatPanel } from './scenes/scene-beat-panel.js';

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
  const narrative = useBridgeQuery(
    `planning-narrative:${projectId}:${selectedChapterId ?? 'all'}`,
    loadNarrative,
  );
  const [briefSkipped, setBriefSkipped] = useState(false);
  const [plotEditor, setPlotEditor] = useState<{ node?: PlotNode; parentId: string | null } | null>(
    null,
  );
  const [status, setStatus] = useState('规划只修改权威规划数据，不会自动改写正文。');

  return (
    <section className="planning-workbench" data-planning-dialog aria-label="规划工作台">
      <header className="feature-heading">
        <div>
          <p className="eyebrow">完整规划</p>
          <h1>完整规划工作台</h1>
          <p>卷章与大纲、作品核心、场景及相关设定在同一上下文中协作。</p>
        </div>
        <div className="feature-heading__actions">
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
              <h2>作品核心已暂时收起</h2>
              <p>可继续自由规划；恢复后仍从本地服务读取已保存内容。</p>
              <button
                className="quiet-button"
                data-restore-brief
                type="button"
                onClick={() => setBriefSkipped(false)}
              >
                恢复作品核心
              </button>
            </section>
          ) : (
            <ProjectBriefEditor
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
            {outline.error ? (
              <PlanningInlineError error={outline.error} onRetry={outline.refresh} />
            ) : null}
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
              <h2>章节与场景</h2>
              <p>从左侧选择章节后编辑场景。</p>
            </section>
          )}
        </main>

        <PlanningContextPanel entities={entities.data?.entities ?? []} narrative={narrative.data} />
      </div>

      {plotEditor ? (
        <PlotNodeDialog
          bridge={bridge}
          editor={plotEditor}
          projectId={projectId}
          onClose={() => setPlotEditor(null)}
          onSaved={async () => {
            setPlotEditor(null);
            setStatus('大纲节点已保存。');
            await outline.refresh();
          }}
        />
      ) : null}
    </section>
  );
}
