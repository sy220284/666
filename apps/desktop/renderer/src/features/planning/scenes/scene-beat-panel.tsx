import { useCallback, useState } from 'react';

import type { Entity, PlotNode, SceneBeat } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../../bridge/renderer-bridge-adapter.js';
import { useBridgeCommand, useBridgeQuery } from '../../../bridge/use-bridge-resource.js';
import { authorSceneBeatTypeLabel } from '../../../presentation/author-value-format.js';
import { useDraftBlockPicker } from '../../writing/draft-block-picker.js';
import { SceneBeatDialog } from './scene-beat-dialog.js';

export function SceneBeatPanel({
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
  const { pickMultipleBlocks, picker } = useDraftBlockPicker();
  const blocked = readOnly || command.pending || previewCommand.pending;

  const remove = async (beat: SceneBeat): Promise<void> => {
    if (!window.confirm(`删除场景“${beat.title}”？正文不会变化。`)) return;
    const result = await command.run(() =>
      bridge.planning.deleteSceneBeat({ projectId, sceneBeatId: beat.id }),
    );
    if (result) onStatus('场景已移入已删除列表；正文未变化。');
  };

  const selectLogicalBlocks = async (
    defaultIds: readonly string[] = [],
    allowEmpty = false,
  ): Promise<string[] | null> => {
    const draft = await previewCommand.run(() =>
      bridge.draft.open({ projectId, chapterId }, { mode: 'replace' }),
    );
    if (!draft) return null;
    return pickMultipleBlocks({
      title: defaultIds.length ? '选择与场景关联的正文段落' : '选择要转换为场景的正文段落',
      description: defaultIds.length
        ? '直接勾选正文内容。取消勾选不会删除正文，只会解除场景关联。'
        : '直接勾选正文内容，确认后再填写场景信息。正文内容和顺序不会变化。',
      blocks: draft.blocks,
      initialIds: defaultIds,
      allowEmpty,
    });
  };

  const setBlockLinks = async (beat: SceneBeat): Promise<void> => {
    const ids = await selectLogicalBlocks(
      beat.blockLinks.map((link) => link.logicalBlockId),
      true,
    );
    if (!ids) return;
    const result = await command.run(() =>
      bridge.planning.setSceneBeatBlockLinks({
        projectId,
        sceneBeatId: beat.id,
        logicalBlockIds: ids,
      }),
    );
    if (result) onStatus('场景的正文段落引用已更新；正文内容和顺序未变化。');
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
    if (result) onStatus('场景顺序已更新；正文未变化。');
  };

  const moveAcrossChapters = async (beat: SceneBeat): Promise<void> => {
    const chapters =
      structure.data?.volumes.flatMap((volume) =>
        volume.chapters.map((chapter) => ({ chapter, volumeTitle: volume.title })),
      ) ?? [];
    const targets = chapters.filter(({ chapter }) => chapter.id !== chapterId);
    if (!targets.length) {
      onStatus('需要至少两个章节才能跨章移动场景。');
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
    const impact = `关联正文段落 ${preview.linkedBlockCount} · 关联人物 ${preview.linkedCharacterCount}${preview.warnings.length ? ` · ${preview.warnings.join('；')}` : ''}`;
    onStatus(`场景跨章预览：${impact}`);
    if (
      !preview.canExecute ||
      !window.confirm(
        `将“${beat.title}”移动到“${target.title}”？\n${impact}\n此步骤只移动规划；正文段落如需移动必须另行确认。`,
      )
    )
      return;
    const result = await command.run(() =>
      bridge.planning.moveSceneBeatAcrossChapters({ ...input, planHash: preview.planHash }),
    );
    if (result) onStatus('场景已跨章移动；正文段落未自动移动。');
  };

  return (
    <section className="feature-card">
      <div className="feature-card__heading">
        <div>
          <h2>章节与场景</h2>
          <p>场景规划与正文段落保持显式分离。</p>
        </div>
        <div className="inline-actions">
          <button
            className="quiet-button"
            data-convert-scene-beat
            disabled={blocked}
            type="button"
            onClick={() =>
              void selectLogicalBlocks().then((logicalBlockIds) => {
                if (logicalBlockIds) setEditor({ beat: null, logicalBlockIds });
              })
            }
          >
            从正文段落转换
          </button>
          <button
            className="primary-button"
            data-create-scene-beat
            disabled={blocked}
            type="button"
            onClick={() => setEditor({ beat: null, logicalBlockIds: [] })}
          >
            新建场景
          </button>
        </div>
      </div>
      <div data-scene-beat-list>
        {resource.data?.beats.length === 0 ? <p>当前章节尚无场景。</p> : null}
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
              <button
                disabled={command.pending || previewCommand.pending}
                type="button"
                onClick={() => setEditor({ beat, logicalBlockIds: [] })}
              >
                编辑
              </button>
              <button
                aria-label={`上移${beat.title}`}
                disabled={blocked || index === 0}
                type="button"
                onClick={() => void moveWithinChapter(beat, -1)}
              >
                ↑
              </button>
              <button
                aria-label={`下移${beat.title}`}
                disabled={blocked || index === (resource.data?.beats.length ?? 0) - 1}
                type="button"
                onClick={() => void moveWithinChapter(beat, 1)}
              >
                ↓
              </button>
              <button disabled={blocked} type="button" onClick={() => void setBlockLinks(beat)}>
                关联正文段落
              </button>
              <button disabled={blocked} type="button" onClick={() => void moveAcrossChapters(beat)}>
                跨章移动
              </button>
              <button type="button" disabled={blocked} onClick={() => void remove(beat)}>
                删除
              </button>
            </div>
          </article>
        ))}
      </div>
      <details>
        <summary>已删除场景</summary>
        <div data-deleted-scene-beat-list>
          {resource.data?.deletedBeats.length === 0 ? (
            <p>无</p>
          ) : (
            resource.data?.deletedBeats.map((beat) => (
              <article className="scene-beat-card" key={beat.id}>
                <strong>{beat.title}</strong>
                <button
                  type="button"
                  disabled={blocked}
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
            onStatus('场景已保存；正文未发生变化。');
          }}
        />
      ) : null}
      {picker}
    </section>
  );
}
