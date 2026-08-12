import type { Chapter, ProjectStructure, Volume } from '@worldforge/contracts';

import type { BridgeRequestError } from '../../bridge/request-lifecycle.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import { chapterMeta, statusLabel } from './structure-formatters.js';

interface StructureTreeProps {
  readonly activeSelectedChapterId: string | null;
  readonly commandPending: boolean;
  readonly error: BridgeRequestError | null;
  readonly loading: boolean;
  readonly previewPending: boolean;
  readonly readOnly: boolean;
  readonly structure: ProjectStructure | null;
  readonly onCreateChapter: (volume: Volume) => void;
  readonly onEditChapter: (volume: Volume, chapter: Chapter) => void;
  readonly onEditVolume: (volume: Volume) => void;
  readonly onMergeChapter: (
    volume: Volume,
    chapter: Chapter,
    chapterIndex: number,
  ) => Promise<void>;
  readonly onMoveBlocks: (volume: Volume, chapter: Chapter, chapterIndex: number) => Promise<void>;
  readonly onMoveVolumeUp: (volume: Volume, previous: Volume) => Promise<void>;
  readonly onOpenChapter: (chapter: Chapter) => void;
  readonly onRemoveChapter: (chapter: Chapter) => Promise<void>;
  readonly onRemoveVolume: (volume: Volume) => Promise<void>;
  readonly onRetry: () => Promise<void>;
  readonly onSplitChapter: (chapter: Chapter) => Promise<void>;
}

export function StructureTree({
  activeSelectedChapterId,
  commandPending,
  error,
  loading,
  previewPending,
  readOnly,
  structure,
  onCreateChapter,
  onEditChapter,
  onEditVolume,
  onMergeChapter,
  onMoveBlocks,
  onMoveVolumeUp,
  onOpenChapter,
  onRemoveChapter,
  onRemoveVolume,
  onRetry,
  onSplitChapter,
}: StructureTreeProps) {
  const blocked = commandPending || previewPending;
  return (
    <div className="structure-tree" data-structure-tree>
      {loading ? <p>正在读取卷章…</p> : null}
      {error ? <InlineError error={error} onRetry={onRetry} /> : null}
      {structure?.volumes.length === 0 ? (
        <p data-structure-empty>专业空白项目：从新建卷开始。</p>
      ) : null}
      {structure?.volumes.map((volume, volumeIndex) => (
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
                disabled={readOnly || blocked}
                onClick={() => onCreateChapter(volume)}
              >
                +章
              </button>
              <button
                data-edit-volume
                title="编辑卷"
                type="button"
                disabled={readOnly || blocked}
                onClick={() => onEditVolume(volume)}
              >
                编辑
              </button>
              <button
                data-move-volume-up
                title="上移卷"
                type="button"
                disabled={readOnly || blocked || volumeIndex === 0}
                onClick={() => {
                  const previous = structure.volumes[volumeIndex - 1];
                  if (previous) void onMoveVolumeUp(volume, previous);
                }}
              >
                ↑
              </button>
              <button
                data-delete-volume
                title="删除卷"
                type="button"
                disabled={readOnly || blocked}
                onClick={() => void onRemoveVolume(volume)}
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
                  disabled={blocked}
                  type="button"
                  onClick={() => onOpenChapter(chapter)}
                >
                  <strong>{chapter.title}</strong>
                  <span>{chapterMeta(chapter)}</span>
                </button>
                <div className="inline-actions">
                  <button
                    data-edit-chapter
                    title="编辑章节"
                    type="button"
                    disabled={readOnly || blocked}
                    onClick={() => onEditChapter(volume, chapter)}
                  >
                    编辑
                  </button>
                  <button
                    data-split-chapter
                    title="预览并拆分章节"
                    type="button"
                    disabled={readOnly || blocked}
                    onClick={() => void onSplitChapter(chapter)}
                  >
                    拆
                  </button>
                  <button
                    data-merge-chapter
                    title="预览并合并章节"
                    type="button"
                    disabled={readOnly || volume.chapters.length < 2 || blocked}
                    onClick={() => void onMergeChapter(volume, chapter, chapterIndex)}
                  >
                    并
                  </button>
                  <button
                    data-move-blocks
                    title="预览并跨章移动正文段落"
                    type="button"
                    disabled={readOnly || volume.chapters.length < 2 || blocked}
                    onClick={() => void onMoveBlocks(volume, chapter, chapterIndex)}
                  >
                    移
                  </button>
                  <button
                    data-delete-chapter
                    title="删除章节"
                    type="button"
                    disabled={readOnly || blocked}
                    onClick={() => void onRemoveChapter(chapter)}
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
  );
}

function InlineError({
  error,
  onRetry,
}: {
  readonly error: BridgeRequestError;
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
