import { useCallback, useEffect, useState } from 'react';

import type { Chapter, Volume } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeQuery } from '../../bridge/use-bridge-resource.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import { ChapterEditorDialog } from './chapter-editor-dialog.js';
import { StructureOperationDialog } from './structure-operation-dialog.js';
import { StructureTree } from './structure-tree.js';
import { TrashPanel } from './trash-panel.js';
import { VolumeEditorDialog } from './volume-editor-dialog.js';

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

  const openChapter = (chapter: Chapter): void => {
    if (selectedChapterId === undefined) setInternalSelectedChapterId(chapter.id);
    onSelectChapter?.(chapter.id);
    onOpenChapter?.(chapter);
  };

  return (
    <StructureOperationDialog
      bridge={bridge}
      projectId={projectId}
      onBeforeWrite={onBeforeWrite}
      onRefresh={resource.refresh}
      onStatus={onStatus}
    >
      {(operations) => (
        <aside
          className={compact ? 'structure-navigator is-compact' : 'structure-navigator'}
          data-structure-panel
        >
          <div className="feature-card__heading">
            <div>
              <h2>{compact ? '目录' : '卷章目录'}</h2>
              {!compact ? <p>生命周期与目标字数由本地服务维护。</p> : null}
            </div>
            {!compact ? (
              <div className="inline-actions">
                <button
                  className="quiet-button"
                  data-create-volume
                  disabled={readOnly || operations.command.pending}
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
            ) : null}
          </div>
          <p className="feature-status" data-structure-state role="status">
            {operations.command.error ? authorErrorSummary(operations.command.error) : ''}
          </p>
          <StructureTree
            activeSelectedChapterId={activeSelectedChapterId}
            commandPending={operations.command.pending}
            compact={compact}
            error={resource.error}
            loading={resource.state === 'loading'}
            previewPending={operations.previewCommand.pending}
            readOnly={readOnly}
            structure={resource.data}
            onCreateChapter={(volume) => setEditor({ kind: 'create-chapter', volume })}
            onEditChapter={(volume, chapter) =>
              setEditor({ kind: 'edit-chapter', volume, chapter })
            }
            onEditVolume={(volume) => setEditor({ kind: 'edit-volume', volume })}
            onMergeChapter={operations.mergeChapter}
            onMoveBlocks={operations.moveBlocks}
            onMoveVolumeUp={operations.moveVolumeUp}
            onOpenChapter={openChapter}
            onRemoveChapter={operations.removeChapter}
            onRemoveVolume={operations.removeVolume}
            onRetry={resource.refresh}
            onSplitChapter={operations.splitChapter}
          />
          {editor?.kind === 'create-volume' || editor?.kind === 'edit-volume' ? (
            <VolumeEditorDialog
              bridge={bridge}
              projectId={projectId}
              volume={editor.kind === 'edit-volume' ? editor.volume : null}
              onClose={() => setEditor(null)}
              onSaved={async () => {
                setEditor(null);
                await resource.refresh();
                onStatus?.('卷章结构已保存。');
              }}
            />
          ) : null}
          {editor?.kind === 'create-chapter' || editor?.kind === 'edit-chapter' ? (
            <ChapterEditorDialog
              bridge={bridge}
              chapter={editor.kind === 'edit-chapter' ? editor.chapter : null}
              projectId={projectId}
              structure={resource.data}
              volume={editor.volume}
              onClose={() => setEditor(null)}
              onSaved={async () => {
                setEditor(null);
                await resource.refresh();
                onStatus?.('卷章结构已保存。');
              }}
            />
          ) : null}
          {trashOpen ? (
            <TrashPanel
              bridge={bridge}
              projectId={projectId}
              readOnly={readOnly}
              onClose={() => setTrashOpen(false)}
              onStructureRefresh={resource.refresh}
            />
          ) : null}
        </aside>
      )}
    </StructureOperationDialog>
  );
}
