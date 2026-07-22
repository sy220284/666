import { useCallback, useEffect, useState } from 'react';

import type {
  ImportPlan,
  ImportPlanChapter,
  TextDocumentFormat,
  TextImportEncoding,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeCommand, useBridgeQuery } from '../../bridge/use-bridge-resource.js';

export type DataToolsSection = 'recovery' | 'import-export';

interface DataToolsWorkbenchProps {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly section: DataToolsSection;
  readonly onSectionChange: (section: DataToolsSection) => void;
  readonly onClose: () => void;
  readonly onProjectRestored: () => Promise<void>;
}

export function DataToolsWorkbench({
  bridge,
  projectId,
  readOnly,
  section,
  onSectionChange,
  onClose,
  onProjectRestored,
}: DataToolsWorkbenchProps) {
  return (
    <section className="data-tools-workbench" data-recovery-dialog aria-label="恢复与数据工具">
      <header className="feature-heading">
        <div>
          <p className="eyebrow">Data Safety</p>
          <h1>恢复与数据工具</h1>
          <p>恢复点、只读导出和文本导入导出继续由Core执行校验与原子事务。</p>
        </div>
        <button className="quiet-button" data-close-recovery type="button" onClick={onClose}>
          返回
        </button>
      </header>
      <nav className="feature-tabs" aria-label="数据工具分区">
        <button
          aria-current={section === 'recovery' ? 'page' : undefined}
          className={section === 'recovery' ? 'is-active' : ''}
          type="button"
          onClick={() => onSectionChange('recovery')}
        >
          恢复中心
        </button>
        <button
          aria-current={section === 'import-export' ? 'page' : undefined}
          className={section === 'import-export' ? 'is-active' : ''}
          data-open-text-io
          type="button"
          onClick={() => onSectionChange('import-export')}
        >
          TXT / Markdown
        </button>
      </nav>
      {section === 'recovery' ? (
        <RecoveryPanel
          bridge={bridge}
          projectId={projectId}
          readOnly={readOnly}
          onProjectRestored={onProjectRestored}
        />
      ) : (
        <TextIoPanel bridge={bridge} projectId={projectId} readOnly={readOnly} />
      )}
    </section>
  );
}

function RecoveryPanel({
  bridge,
  projectId,
  readOnly,
  onProjectRestored,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly onProjectRestored: () => Promise<void>;
}) {
  const load = useCallback(
    () => bridge.recovery.getOverview(projectId, { mode: 'replace' }),
    [bridge, projectId],
  );
  const resource = useBridgeQuery(`recovery:${projectId}`, load);
  const [status, setStatus] = useState('恢复操作会创建新项目，当前项目保持不变。');
  const command = useBridgeCommand(resource.refresh);

  const createCheckpoint = async (): Promise<void> => {
    const result = await command.run(() =>
      bridge.recovery.createCheckpoint({ projectId, operation: 'manual-protection' }),
    );
    if (result) setStatus(`恢复点已创建并校验：${result.backupFileName}`);
  };
  const restore = async (backupId: string): Promise<void> => {
    if (!window.confirm('从此恢复点创建一个新的可写项目？当前项目不会被覆盖。')) return;
    const result = await command.run(() =>
      bridge.recovery.restoreCheckpoint({ projectId, backupId }),
    );
    if (result) {
      setStatus(`恢复项目“${result.name}”已注册到最近项目。`);
      await onProjectRestored();
    }
  };
  const exportVersion = async (versionId: string): Promise<void> => {
    const result = await command.run(() => bridge.recovery.exportVersion({ projectId, versionId }));
    if (result) setStatus(`已导出 ${result.fileName} · ${result.sha256.slice(0, 12)}…`);
  };

  return (
    <section className="recovery-grid">
      <div className="feature-card recovery-summary">
        <h2>保护状态</h2>
        <p>数据库：{resource.data?.databaseMode ?? '读取中'}</p>
        <p>兼容原因：{resource.data?.readOnlyReason ?? '无'}</p>
        <button
          className="primary-button"
          data-create-checkpoint
          disabled={readOnly || command.pending}
          type="button"
          onClick={() => void createCheckpoint()}
        >
          创建手动恢复点
        </button>
        <p className="feature-status" data-recovery-status role="status">
          {command.error ? `${command.error.message} · ${command.error.code}` : status}
        </p>
      </div>
      <div className="feature-card">
        <h2>恢复点</h2>
        <div className="recovery-list" data-recovery-checkpoints>
          {resource.data?.checkpoints.length === 0 ? (
            <p>暂无恢复点。</p>
          ) : (
            resource.data?.checkpoints.map((checkpoint) => (
              <article className="feature-row recovery-row" key={checkpoint.backupId}>
                <div>
                  <strong>{checkpoint.operation}</strong>
                  <span>
                    {checkpoint.createdAt} · {formatBytes(checkpoint.sizeBytes)}
                  </span>
                  <code>{checkpoint.sha256.slice(0, 16)}…</code>
                </div>
                <button
                  data-restore-checkpoint
                  disabled={command.pending}
                  type="button"
                  onClick={() => void restore(checkpoint.backupId)}
                >
                  恢复为新项目
                </button>
              </article>
            ))
          )}
        </div>
      </div>
      <div className="feature-card">
        <h2>可安全导出的Version</h2>
        <div className="recovery-list" data-recovery-versions>
          {resource.data?.exportableVersions.length === 0 ? (
            <p>暂无可导出Version。</p>
          ) : (
            resource.data?.exportableVersions.map((version) => (
              <article className="feature-row recovery-row" key={version.versionId}>
                <div>
                  <strong>
                    {version.chapterTitle} · {version.title}
                  </strong>
                  <span>
                    {version.wordCount} 字 · {version.finalized ? '定稿' : '普通版本'}
                  </span>
                </div>
                <button
                  data-export-recovery-version
                  disabled={command.pending}
                  type="button"
                  onClick={() => void exportVersion(version.versionId)}
                >
                  导出TXT
                </button>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function TextIoPanel({
  bridge,
  projectId,
  readOnly,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
}) {
  const loadExports = useCallback(
    () => bridge.textIo.listExportVersions(projectId, { mode: 'replace' }),
    [bridge, projectId],
  );
  const exports = useBridgeQuery(`export-versions:${projectId}`, loadExports);
  const [encoding, setEncoding] = useState<TextImportEncoding>('auto');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [chapters, setChapters] = useState<ImportPlanChapter[]>([]);
  const [volumeTitle, setVolumeTitle] = useState('导入卷');
  const [selectedVersions, setSelectedVersions] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<TextDocumentFormat>('txt');
  const [fileName, setFileName] = useState('WorldForge导出');
  const [status, setStatus] = useState('预览不会写入项目；提交时Core先创建恢复点。');
  const [operationLabel, setOperationLabel] = useState('操作');
  const command = useBridgeCommand();

  useEffect(() => {
    if (command.error) setStatus(`${operationLabel}失败 · ${command.error.code}`);
  }, [command.error, operationLabel]);

  const preview = async (): Promise<void> => {
    setOperationLabel('预览');
    const result = await command.run(() => bridge.textIo.previewImport({ projectId, encoding }));
    if (!result) return;
    setPlan(result);
    setChapters(result.chapters.map(cloneChapter));
    setStatus(
      `已预览 ${result.chapters.length} 章 · ${result.detectedEncoding} · 置信度 ${result.confidence}`,
    );
  };
  const commit = async (): Promise<void> => {
    if (!plan) return;
    setOperationLabel('导入');
    const result = await command.run(() =>
      bridge.textIo.commitImport({ projectId, planId: plan.planId, volumeTitle, chapters }),
    );
    if (!result) return;
    setStatus(
      `已导入 ${result.importedChapterCount} 章，并创建恢复点 ${result.checkpointId.slice(0, 8)}…`,
    );
    setPlan(null);
    setChapters([]);
    await exports.refresh();
  };
  const exportSelected = async (): Promise<void> => {
    setOperationLabel('导出');
    const result = await command.run(() =>
      bridge.textIo.exportVersions({
        projectId,
        versionIds: [...selectedVersions],
        format,
        fileName,
      }),
    );
    if (result) setStatus(`已原子导出 ${result.fileName} · ${formatBytes(result.sizeBytes)}`);
  };
  const splitChapter = (index: number): void => {
    setChapters((current) => {
      const source = current[index];
      if (!source) return current;
      if (source.blocks.length === 1) {
        const block = source.blocks[0];
        if (!block || block.text.length < 2) {
          setStatus('该章节内容不足，无法在预览中拆分。');
          return current;
        }
        const point = Math.max(1, Math.floor(block.text.length / 2));
        return [
          ...current.slice(0, index),
          { ...source, blocks: [{ ...block, text: block.text.slice(0, point) }] },
          {
            ...source,
            planChapterId: crypto.randomUUID(),
            title: `${source.title}（续）`,
            blocks: [{ ...block, text: block.text.slice(point) }],
          },
          ...current.slice(index + 1),
        ];
      }
      if (source.blocks.length < 2) {
        return current;
      }
      const splitAt = Math.ceil(source.blocks.length / 2);
      const first = { ...source, blocks: source.blocks.slice(0, splitAt) };
      const second = {
        ...source,
        planChapterId: crypto.randomUUID(),
        title: `${source.title}（续）`,
        blocks: source.blocks.slice(splitAt),
      };
      return [...current.slice(0, index), first, second, ...current.slice(index + 1)];
    });
  };
  const mergeChapter = (index: number): void => {
    setChapters((current) => {
      const source = current[index];
      const next = current[index + 1];
      if (!source || !next) return current;
      return [
        ...current.slice(0, index),
        { ...source, blocks: [...source.blocks, ...next.blocks] },
        ...current.slice(index + 2),
      ];
    });
  };

  return (
    <section className="text-io-grid" data-text-io-dialog>
      <div className="feature-card">
        <h2>TXT / Markdown导入</h2>
        <p>选择文件后先形成内存计划，可调整章节再原子提交。</p>
        <label>
          编码
          <select
            value={encoding}
            onChange={(event) => setEncoding(event.target.value as TextImportEncoding)}
          >
            <option value="auto">自动检测</option>
            <option value="utf-8">UTF-8</option>
            <option value="utf-16le">UTF-16 LE</option>
            <option value="utf-16be">UTF-16 BE</option>
            <option value="gb18030">GB18030</option>
          </select>
        </label>
        <button
          className="primary-button"
          data-preview-import
          disabled={readOnly || command.pending}
          type="button"
          onClick={() => void preview()}
        >
          选择文件并预览
        </button>
        {plan ? (
          <div className="import-plan">
            <label>
              导入卷标题
              <input
                data-import-volume-title
                value={volumeTitle}
                onChange={(event) => setVolumeTitle(event.target.value)}
              />
            </label>
            {chapters.map((chapter, index) => (
              <article className="feature-row" data-import-plan-chapter key={chapter.planChapterId}>
                <label>
                  章节标题
                  <input
                    data-import-chapter-title
                    value={chapter.title}
                    onChange={(event) =>
                      setChapters((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, title: event.target.value } : item,
                        ),
                      )
                    }
                  />
                </label>
                <span>{chapter.blocks.length} 个正文块</span>
                <div className="inline-actions">
                  <button
                    data-import-plan-action="split"
                    type="button"
                    onClick={() => splitChapter(index)}
                  >
                    拆分
                  </button>
                  <button
                    data-import-plan-action="merge"
                    disabled={index === chapters.length - 1}
                    type="button"
                    onClick={() => mergeChapter(index)}
                  >
                    与下一章合并
                  </button>
                </div>
              </article>
            ))}
            <button
              className="primary-button"
              data-commit-import
              disabled={readOnly || command.pending || chapters.length === 0}
              type="button"
              onClick={() => void commit()}
            >
              确认并原子导入
            </button>
          </div>
        ) : null}
      </div>
      <div className="feature-card">
        <h2>Version导出</h2>
        <p>仅导出明确勾选的Version，不读取未定稿Draft。</p>
        <div className="export-version-list">
          {exports.data?.versions.length === 0 ? (
            <p>暂无可导出Version。</p>
          ) : (
            exports.data?.versions.map((version) => (
              <label className="feature-row" key={version.versionId}>
                <input
                  data-export-version-choice
                  type="checkbox"
                  checked={selectedVersions.has(version.versionId)}
                  onChange={(event) =>
                    setSelectedVersions((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(version.versionId);
                      else next.delete(version.versionId);
                      return next;
                    })
                  }
                />
                <span>
                  <strong>
                    {version.volumeTitle} / {version.chapterTitle}
                  </strong>
                  <small>
                    {version.versionTitle} · {version.wordCount} 字
                    {version.finalized ? ' · 定稿' : ''}
                  </small>
                </span>
              </label>
            ))
          )}
        </div>
        <label>
          格式
          <select
            data-export-format
            value={format}
            onChange={(event) => setFormat(event.target.value as TextDocumentFormat)}
          >
            <option value="txt">TXT</option>
            <option value="markdown">Markdown</option>
          </select>
        </label>
        <label>
          文件名
          <input
            data-export-file-name
            value={fileName}
            onChange={(event) => setFileName(event.target.value)}
          />
        </label>
        <button
          className="primary-button"
          data-export-versions
          disabled={command.pending || selectedVersions.size === 0}
          type="button"
          onClick={() => void exportSelected()}
        >
          选择目录并导出
        </button>
      </div>
      <p className="feature-status text-io-status" data-text-io-status role="status">
        {status}
      </p>
    </section>
  );
}

function cloneChapter(chapter: ImportPlanChapter): ImportPlanChapter {
  return { ...chapter, blocks: chapter.blocks.map((block) => ({ ...block })) };
}
function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}
