import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import type {
  Chapter,
  DraftDocument,
  ProjectWorkspaceSummary,
  VersionDocument,
  VersionSummary,
} from '@worldforge/contracts';

import { authorErrorSummary } from '../../presentation/author-error-message.js';
import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { nullableFormText } from './candidate-selection.js';
import { ReviewDiffPanel } from './review-diff-panel.js';

export function VersionPanel({
  bridge,
  chapter,
  draft,
  project,
  navigationVersionId,
  flush,
  onClose,
  onDraftReplace,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly chapter: Chapter;
  readonly draft: DraftDocument;
  readonly project: ProjectWorkspaceSummary;
  readonly navigationVersionId?: string | null;
  readonly flush: () => Promise<boolean>;
  readonly onClose: () => void;
  readonly onDraftReplace: (draft: DraftDocument, message: string) => void;
}) {
  const readOnly = project.databaseMode !== 'read-write';
  const [versions, setVersions] = useState<readonly VersionSummary[]>([]);
  const [selected, setSelected] = useState<VersionDocument | null>(null);
  const [status, setStatus] = useState(
    '历史版本只读不可变；恢复前会自动留档当前稿，再创建新的当前稿。',
  );
  const [pending, setPending] = useState(false);
  const previewGeneration = useRef(0);

  const refresh = useCallback(async (): Promise<void> => {
    const outcome = await bridge.version.list(project.projectId, chapter.id, { mode: 'replace' });
    if (outcome.state === 'success') setVersions(outcome.data.versions);
    else if (outcome.state === 'failure')
      setStatus(`版本读取失败 · ${authorErrorSummary(outcome.error)}`);
  }, [bridge, chapter.id, project.projectId]);

  useEffect(() => void refresh(), [refresh]);

  useEffect(() => {
    if (!navigationVersionId) return;
    const generation = ++previewGeneration.current;
    void bridge.version
      .get(
        {
          projectId: project.projectId,
          chapterId: chapter.id,
          versionId: navigationVersionId,
        },
        { mode: 'replace' },
      )
      .then((outcome) => {
        if (generation !== previewGeneration.current) return;
        if (outcome.state === 'success') {
          setSelected(outcome.data);
          setStatus(`正在比较：${outcome.data.title}`);
        } else if (outcome.state === 'failure') {
          setStatus('目标历史版本已经变化，请重新搜索。');
        }
      });
  }, [bridge, chapter.id, navigationVersionId, project.projectId]);

  const create = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    const form = event.currentTarget;
    event.preventDefault();
    if (pending || readOnly || !(await flush())) {
      if (!pending) setStatus('自动保存失败，未创建历史版本。');
      return;
    }
    const values = new FormData(form);
    const title = String(values.get('title') ?? '').trim();
    if (!title) return;
    setPending(true);
    const outcome = await bridge.version.create({
      projectId: project.projectId,
      chapterId: chapter.id,
      draftId: draft.draftId,
      baseRevision: draft.revision,
      versionType: 'manual',
      parentVersionId: null,
      sourceCandidateId: null,
      title,
      label: nullableFormText(values.get('label')),
      description: String(values.get('description') ?? ''),
    });
    setPending(false);
    if (outcome.state !== 'success') {
      setStatus(
        outcome.state === 'failure'
          ? `创建失败 · ${authorErrorSummary(outcome.error)}`
          : '创建已取消。',
      );
      return;
    }
    form.reset();
    setStatus(`历史版本“${outcome.data.title}”已创建，内容不可修改。`);
    await refresh();
  };

  const preview = async (versionId: string): Promise<void> => {
    const generation = ++previewGeneration.current;
    const outcome = await bridge.version.get(
      { projectId: project.projectId, chapterId: chapter.id, versionId },
      { mode: 'replace' },
    );
    if (generation !== previewGeneration.current) return;
    if (outcome.state === 'success') {
      setSelected(outcome.data);
      setStatus(`正在比较：${outcome.data.title}`);
    } else if (outcome.state === 'failure')
      setStatus(`预览失败 · ${authorErrorSummary(outcome.error)}`);
  };

  const finalize = async (versionId: string): Promise<void> => {
    if (readOnly || pending) return;
    setPending(true);
    const outcome = await bridge.version.setFinal({
      projectId: project.projectId,
      chapterId: chapter.id,
      versionId,
    });
    setPending(false);
    if (outcome.state === 'success') {
      setStatus(`已将“${outcome.data.title}”设为定稿。`);
      await refresh();
    } else if (outcome.state === 'failure')
      setStatus(`定稿失败 · ${authorErrorSummary(outcome.error)}`);
  };

  const restore = async (versionId: string): Promise<void> => {
    if (pending || readOnly || !(await flush())) {
      if (!pending) setStatus('自动保存失败，未恢复历史版本。');
      return;
    }
    setPending(true);
    const current = await bridge.draft.open(
      { projectId: project.projectId, chapterId: chapter.id },
      { mode: 'replace' },
    );
    if (current.state !== 'success') {
      setPending(false);
      setStatus(
        current.state === 'failure'
          ? `当前稿确认失败 · ${authorErrorSummary(current.error)}`
          : '当前稿确认已取消。',
      );
      return;
    }
    const outcome = await bridge.version.restore({
      projectId: project.projectId,
      chapterId: chapter.id,
      versionId,
      expectedDraftId: current.data.draftId,
      expectedRevision: current.data.revision,
    });
    setPending(false);
    if (outcome.state === 'success') {
      onDraftReplace(outcome.data, '已自动留档恢复前当前稿，并从只读历史版本创建新当前稿。');
      setStatus('恢复成功；恢复前当前稿已自动保存为可读取的历史版本。');
    } else if (outcome.state === 'failure')
      setStatus(`恢复失败 · ${authorErrorSummary(outcome.error)}`);
  };

  const exportVersion = async (versionId: string): Promise<void> => {
    if (pending) return;
    setPending(true);
    const outcome = await bridge.recovery.exportVersion({
      projectId: project.projectId,
      versionId,
    });
    setPending(false);
    if (outcome.state === 'success') setStatus('历史版本已导出。');
    else if (outcome.state === 'failure')
      setStatus(`导出失败 · ${authorErrorSummary(outcome.error)}`);
  };

  return (
    <section className="version-workbench" data-version-dialog>
      <header className="feature-card__heading">
        <div>
          <h2>历史版本与比较</h2>
          <p>
            历史版本不可变；左侧为当前已保存正文，右侧为选中的历史版本。恢复前会自动留档当前稿。
          </p>
        </div>
        <button data-close-versions type="button" disabled={pending} onClick={onClose}>
          返回正文
        </button>
      </header>
      <form className="version-create-grid" onSubmit={(event) => void create(event)}>
        <input data-version-title name="title" maxLength={240} placeholder="版本标题" required />
        <input data-version-label name="label" maxLength={120} placeholder="标签（可选）" />
        <input
          data-version-description
          name="description"
          maxLength={2000}
          placeholder="说明（可选）"
        />
        <button
          className="primary-button"
          data-confirm-version
          disabled={readOnly || pending}
          type="submit"
        >
          创建历史版本
        </button>
      </form>
      <p className="feature-status" data-version-status role="status">
        {status}
      </p>
      <div className="version-history-layout">
        <div className="version-list">
          {versions.length === 0 ? (
            <p>还没有历史版本。</p>
          ) : (
            versions.map((version) => (
              <article
                className="version-row"
                data-version-id={version.versionId}
                data-version-row
                key={version.versionId}
              >
                <div>
                  <strong>{version.title}</strong>
                  <small>
                    {version.wordCount}字 · 保存序号 {version.sourceRevision}
                    {version.label ? ` · ${version.label}` : ''}
                    {version.finalized ? ' · 定稿' : ''}
                  </small>
                </div>
                <div className="version-row__actions">
                  <button
                    data-version-action="compare"
                    type="button"
                    disabled={pending}
                    onClick={() => void preview(version.versionId)}
                  >
                    比较
                  </button>
                  <button
                    data-version-action="final"
                    type="button"
                    disabled={readOnly || version.finalized || pending}
                    onClick={() => void finalize(version.versionId)}
                  >
                    设为定稿
                  </button>
                  <button
                    data-version-action="restore"
                    type="button"
                    disabled={readOnly || pending}
                    onClick={() => void restore(version.versionId)}
                  >
                    恢复为新当前稿
                  </button>
                  <button
                    data-version-action="export"
                    type="button"
                    disabled={pending}
                    onClick={() => void exportVersion(version.versionId)}
                  >
                    导出TXT
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
        <ReviewDiffPanel
          comparisonText={selected?.blocks.map((block) => block.text).join('\n\n') ?? ''}
          comparisonTitle={selected?.title ?? '选择历史版本比较'}
          currentText={draft.blocks.map((block) => block.text).join('\n\n')}
          currentTitle="当前已保存稿"
          marker="version"
        />
      </div>
    </section>
  );
}
