import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  BackupCleanupPreview,
  ImportPlan,
  ImportPlanChapter,
  TextDocumentFormat,
  TextImportEncoding,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeCommand, useBridgeQuery } from '../../bridge/use-bridge-resource.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import { finalizedVersionIds, wholeBookExportLabel } from './text-export-selection.js';

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
          <p className="eyebrow">本地作品安全</p>
          <h1>恢复与数据工具</h1>
          <p>恢复点、只读导出和文本导入导出继续由本地服务执行校验与原子写入。</p>
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
          TXT / Markdown / DOCX
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
    () => bridge.recovery.getOverview(projectId, { mode: 'share' }),
    [bridge, projectId],
  );
  const resource = useBridgeQuery(`recovery:${projectId}`, load);
  const [status, setStatus] = useState('恢复操作会创建新项目，当前项目保持不变。');
  const [snapshotName, setSnapshotName] = useState('手动快照');
  const [snapshotNote, setSnapshotNote] = useState('');
  const [cleanup, setCleanup] = useState<BackupCleanupPreview | null>(null);
  const [dailyRetentionCount, setDailyRetentionCount] = useState(14);
  const [majorRetentionCount, setMajorRetentionCount] = useState(30);
  const [majorRetentionDays, setMajorRetentionDays] = useState(90);
  const [quotaGiB, setQuotaGiB] = useState(5);
  const command = useBridgeCommand(resource.refresh);

  useEffect(() => {
    if (!resource.data) return;
    setDailyRetentionCount(resource.data.policy.dailyRetentionCount);
    setMajorRetentionCount(resource.data.policy.majorRetentionCount);
    setMajorRetentionDays(resource.data.policy.majorRetentionDays);
    setQuotaGiB(Math.max(0.1, resource.data.policy.quotaBytes / 1024 / 1024 / 1024));
  }, [resource.data]);

  const createDailyBackup = async (): Promise<void> => {
    const result = await command.run(() => bridge.recovery.createDailyBackup({ projectId }));
    if (result) setStatus(`今日日常备份已验证：${result.backupFileName}`);
  };
  const createNamedSnapshot = async (): Promise<void> => {
    const result = await command.run(() =>
      bridge.recovery.createNamedSnapshot({
        projectId,
        authority: 'author',
        name: snapshotName,
        note: snapshotNote || null,
      }),
    );
    if (result) setStatus(`命名快照“${result.displayName}”已创建并保护。`);
  };
  const updatePolicy = async (): Promise<void> => {
    const result = await command.run(() =>
      bridge.recovery.updatePolicy({
        projectId,
        authority: 'author',
        dailyRetentionCount,
        majorRetentionCount,
        majorRetentionDays,
        quotaBytes: Math.round(quotaGiB * 1024 * 1024 * 1024),
      }),
    );
    if (result) setStatus(`保留策略已更新至版本 ${result.policyVersion}。`);
  };
  const toggleProtection = async (backupId: string, protectedValue: boolean): Promise<void> => {
    const result = await command.run(() =>
      bridge.recovery.setProtection({
        projectId,
        backupId,
        authority: 'author',
        protected: protectedValue,
        confirmationBackupId: protectedValue ? null : backupId,
      }),
    );
    if (result) {
      setStatus(protectedValue ? '已标记为作者保留。' : '已解除作者保留；硬保护仍然有效。');
    }
  };
  const previewCleanup = async (): Promise<void> => {
    const result = await command.run(() => bridge.recovery.previewCleanup(projectId));
    if (result) {
      setCleanup(result);
      setStatus(`清理预览可释放 ${formatBytes(result.reclaimableBytes)}。`);
    }
  };
  const applyCleanup = async (): Promise<void> => {
    if (!cleanup) return;
    const result = await command.run(() =>
      bridge.recovery.applyCleanup({
        projectId,
        authority: 'author',
        planHash: cleanup.planHash,
      }),
    );
    if (result) {
      setCleanup(null);
      setStatus(
        `已安全清理 ${result.deletedBackupIds.length} 份，释放 ${formatBytes(result.releasedBytes)}。`,
      );
    }
  };
  const restore = async (backupId: string): Promise<void> => {
    const result = await command.run(() =>
      bridge.recovery.restoreCheckpoint({ projectId, backupId }),
    );
    if (result) {
      setStatus(`恢复项目“${result.name}”已注册到最近作品。`);
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
        <p>作品数据库：{resource.data?.databaseMode ?? '读取中'}</p>
        <p>兼容原因：{resource.data?.readOnlyReason ?? '无'}</p>
        <p>
          空间：{formatBytes(resource.data?.space.totalBytes ?? 0)} /
          {formatBytes(resource.data?.space.quotaBytes ?? 0)}
        </p>
        <button
          className="primary-button"
          data-create-checkpoint
          data-create-daily-backup
          disabled={readOnly || command.pending}
          type="button"
          onClick={() => void createDailyBackup()}
        >
          创建今日日常备份
        </button>
        <label>
          快照名称
          <input value={snapshotName} onChange={(event) => setSnapshotName(event.target.value)} />
        </label>
        <label>
          备注
          <textarea
            value={snapshotNote}
            onChange={(event) => setSnapshotNote(event.target.value)}
          />
        </label>
        <button
          data-create-named-snapshot
          disabled={readOnly || command.pending || snapshotName.trim().length === 0}
          type="button"
          onClick={() => void createNamedSnapshot()}
        >
          创建并保护命名快照
        </button>
        <p className="feature-status" data-recovery-status role="status">
          {command.error ? authorErrorSummary(command.error) : status}
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
                  <strong>{checkpoint.displayName ?? checkpoint.operation}</strong>
                  <span>
                    {checkpoint.track} · 数据结构版本 {checkpoint.schemaVersion} ·{' '}
                    {checkpoint.createdAt} · {formatBytes(checkpoint.sizeBytes)}
                  </span>
                  <small>
                    {checkpoint.protectionReasons.length > 0
                      ? `保护：${checkpoint.protectionReasons.join('、')}`
                      : '普通配额项'}
                  </small>
                  <code>{checkpoint.sha256.slice(0, 16)}…</code>
                </div>
                <div className="inline-actions">
                  <button
                    data-toggle-backup-protection
                    disabled={readOnly || command.pending}
                    type="button"
                    onClick={() =>
                      void toggleProtection(checkpoint.backupId, !checkpoint.authorProtected)
                    }
                  >
                    {checkpoint.authorProtected ? '解除作者保留' : '作者保留'}
                  </button>
                  <button
                    data-restore-checkpoint
                    disabled={command.pending}
                    type="button"
                    onClick={() => void restore(checkpoint.backupId)}
                  >
                    恢复为新项目
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
      <div className="feature-card">
        <h2>保留与空间策略</h2>
        <label>
          日常保留份数
          <input
            min={1}
            max={365}
            type="number"
            value={dailyRetentionCount}
            onChange={(event) => setDailyRetentionCount(Number(event.target.value))}
          />
        </label>
        <label>
          重大恢复点份数
          <input
            min={1}
            max={500}
            type="number"
            value={majorRetentionCount}
            onChange={(event) => setMajorRetentionCount(Number(event.target.value))}
          />
        </label>
        <label>
          重大恢复点保留天数
          <input
            min={1}
            max={3650}
            type="number"
            value={majorRetentionDays}
            onChange={(event) => setMajorRetentionDays(Number(event.target.value))}
          />
        </label>
        <label>
          空间配额（GiB）
          <input
            min={0.1}
            max={1024}
            step={0.1}
            type="number"
            value={quotaGiB}
            onChange={(event) => setQuotaGiB(Number(event.target.value))}
          />
        </label>
        <div className="inline-actions">
          <button
            disabled={readOnly || command.pending}
            type="button"
            onClick={() => void updatePolicy()}
          >
            保存策略
          </button>
          <button
            data-preview-backup-cleanup
            disabled={readOnly || command.pending}
            type="button"
            onClick={() => void previewCleanup()}
          >
            预览安全清理
          </button>
        </div>
        {cleanup ? (
          <div data-backup-cleanup-preview>
            <p>
              删除 {cleanup.items.filter((item) => item.action === 'delete').length} 份； 预计释放{' '}
              {formatBytes(cleanup.reclaimableBytes)}。
            </p>
            <ul>
              {cleanup.items.map((item) => (
                <li key={item.backupId}>
                  {item.track} · {item.action} · {item.reason}
                </li>
              ))}
            </ul>
            <button
              className="danger-button"
              data-apply-backup-cleanup
              disabled={command.pending || cleanup.reclaimableBytes === 0}
              type="button"
              onClick={() => void applyCleanup()}
            >
              按预览执行清理
            </button>
          </div>
        ) : null}
      </div>
      <div className="feature-card">
        <h2>可安全导出的历史版本</h2>
        <div className="recovery-list" data-recovery-versions>
          {resource.data?.exportableVersions.length === 0 ? (
            <p>暂无可导出的历史版本。</p>
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
  const [status, setStatus] = useState('预览不会写入作品；提交时本地服务会先创建恢复点。');
  const [operationLabel, setOperationLabel] = useState('操作');
  const command = useBridgeCommand();
  const finalizedIds = useMemo(
    () => finalizedVersionIds(exports.data?.versions ?? []),
    [exports.data?.versions],
  );

  useEffect(() => {
    if (command.error) setStatus(`${operationLabel}失败：${authorErrorSummary(command.error)}`);
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
        <h2>TXT / Markdown / DOCX导入</h2>
        <p>选择文件后先形成内存计划；DOCX会先经过隔离的ZIP与关系安全检查。</p>
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
                <span>{chapter.blocks.length} 个正文段落</span>
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
        <h2>历史版本与整书导出</h2>
        <p>只导出明确选择的历史版本；整书导出会一次选择全部定稿，不读取未定稿当前稿。</p>
        <div className="inline-actions export-selection-actions">
          <button
            data-select-finalized-versions
            disabled={finalizedIds.length === 0}
            type="button"
            onClick={() => setSelectedVersions(new Set(finalizedIds))}
          >
            选择全部定稿（{finalizedIds.length}章）
          </button>
          <button
            disabled={selectedVersions.size === 0}
            type="button"
            onClick={() => setSelectedVersions(new Set())}
          >
            清空选择
          </button>
          <span>已选择 {selectedVersions.size} 个版本</span>
        </div>
        <div className="export-version-list">
          {exports.data?.versions.length === 0 ? (
            <p>暂无可导出的历史版本。</p>
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
            <option value="docx">DOCX</option>
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
          {wholeBookExportLabel(selectedVersions, exports.data?.versions ?? [])}
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
