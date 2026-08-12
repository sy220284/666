import type { JSX } from 'react';

import type { PlotNode } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../../bridge/renderer-bridge-adapter.js';
import { useBridgeCommand } from '../../../bridge/use-bridge-resource.js';
import { authorPlotNodeTypeLabel } from '../../../presentation/author-value-format.js';
import { lifecycleStatusLabel, sortedPlotNodes } from '../planning-form-values.js';

export function PlotTree({
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
  const command = useBridgeCommand();
  const blocked = readOnly || command.pending;
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
    if (!result) return;
    await onRefresh();
    onStatus('大纲节点已移动；正文未发生变化。');
  };

  const render = (node: PlotNode): JSX.Element => {
    const children = sortedPlotNodes(nodes, node.id);
    const siblings = sortedPlotNodes(nodes, node.parentId);
    const siblingIndex = siblings.findIndex((candidate) => candidate.id === node.id);
    return (
      <article
        data-plot-node-id={node.id}
        draggable={!blocked}
        key={node.id}
        onDragStart={(event) => event.dataTransfer.setData('text/worldforge-plot-node', node.id)}
      >
        <div className="plot-node__summary">
          <div>
            <strong>{node.title}</strong>
            <span>
              {authorPlotNodeTypeLabel(node.nodeType)} · {lifecycleStatusLabel(node.status)}
            </span>
          </div>
          <div className="inline-actions">
            <button disabled={command.pending} type="button" onClick={() => onCreateChild(node.id)}>
              +子节点
            </button>
            <button disabled={command.pending} type="button" onClick={() => onEdit(node)}>
              编辑
            </button>
            <button
              aria-label={`上移${node.title}`}
              disabled={blocked || siblingIndex <= 0}
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
              disabled={blocked || siblingIndex >= siblings.length - 1}
              type="button"
              onClick={() => {
                const next = siblings[siblingIndex + 1];
                if (next) void move(node.id, node.parentId, { kind: 'after', siblingId: next.id });
              }}
            >
              ↓
            </button>
            {node.parentId ? (
              <button type="button" disabled={blocked} onClick={() => void move(node.id, null)}>
                移到根级
              </button>
            ) : null}
            <button
              type="button"
              disabled={blocked}
              onClick={() => {
                if (window.confirm(`删除“${node.title}”及其子节点？`)) {
                  void (async () => {
                    const result = await command.run(() =>
                      bridge.planning.deletePlotNode({ projectId, nodeId: node.id }),
                    );
                    if (result) await onRefresh();
                  })();
                }
              }}
            >
              删除
            </button>
          </div>
        </div>
        <button
          className="outline-drop-target"
          data-outline-drop-child
          disabled={blocked}
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
        disabled={blocked}
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
