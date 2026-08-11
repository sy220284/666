import type { StoryKnowledgeProjection } from '@worldforge/contracts';

type HistoryProjection = Extract<StoryKnowledgeProjection, { readonly view: 'history' }>;

export function StoryKnowledgeHistoryMetadata({
  projection,
}: {
  readonly projection: HistoryProjection;
}) {
  return (
    <div className="story-knowledge-stack" data-story-history-metadata>
      <section className="feature-card story-knowledge-group" data-history-candidates>
        <h3>候选稿记录</h3>
        {projection.candidates.length === 0 ? (
          <p className="empty-copy">当前章节没有候选稿记录。</p>
        ) : (
          <ol className="compact-list">
            {projection.candidates.map((candidate) => (
              <li key={candidate.candidateId} className="compact-card">
                <strong>{candidate.title}</strong>
                <span>
                  {candidateTypeLabel(candidate.candidateType)} ·{' '}
                  {candidateStatusLabel(candidate.status)}
                </span>
                <small>
                  {candidate.completeness === 'complete' ? '完整候选稿' : '部分候选稿'} ·{' '}
                  {new Date(candidate.createdAt).toLocaleString()}
                </small>
              </li>
            ))}
          </ol>
        )}
        {projection.candidatesTruncated ? (
          <p className="hint-copy">候选稿记录较多，仅显示当前窗口。</p>
        ) : null}
      </section>

      <section className="feature-card story-knowledge-group" data-history-checkpoints>
        <h3>恢复点</h3>
        {projection.recovery.checkpoints.length === 0 ? (
          <p className="empty-copy">当前作品没有恢复点记录。</p>
        ) : (
          <ol className="compact-list">
            {projection.recovery.checkpoints.map((checkpoint) => (
              <li key={checkpoint.backupId} className="compact-card">
                <strong>{checkpoint.displayName ?? backupTrackLabel(checkpoint.track)}</strong>
                <span>
                  {backupTrackLabel(checkpoint.track)} · {checkpoint.operation}
                </span>
                <small>{new Date(checkpoint.createdAt).toLocaleString()}</small>
              </li>
            ))}
          </ol>
        )}
        {projection.recovery.checkpointsTruncated ? (
          <p className="hint-copy">恢复点较多，仅显示当前窗口。</p>
        ) : null}
      </section>

      <section className="feature-card story-knowledge-group" data-history-backup-failures>
        <h3>恢复异常</h3>
        {projection.recovery.backupFailures.length === 0 ? (
          <p className="empty-copy">当前作品没有备份异常记录。</p>
        ) : (
          <ol className="compact-list">
            {projection.recovery.backupFailures.map((failure) => (
              <li key={failure.failureId} className="compact-card">
                <strong>{backupFailureLabel(failure.errorCode)}</strong>
                <span>
                  {backupTrackLabel(failure.track)} · {failure.operation}
                </span>
                <small>
                  {new Date(failure.occurredAt).toLocaleString()} ·{' '}
                  {failure.resolvedAt ? '已解决' : '待处理'}
                </small>
              </li>
            ))}
          </ol>
        )}
        {projection.recovery.backupFailuresTruncated ? (
          <p className="hint-copy">恢复异常较多，仅显示当前窗口。</p>
        ) : null}
      </section>
    </div>
  );
}

function candidateTypeLabel(
  type: HistoryProjection['candidates'][number]['candidateType'],
): string {
  switch (type) {
    case 'skeleton':
      return '骨架候选稿';
    case 'full':
      return '完整生成';
    case 'rewrite':
      return '改写候选稿';
    case 'merge':
      return '合并候选稿';
  }
}

function candidateStatusLabel(status: HistoryProjection['candidates'][number]['status']): string {
  switch (status) {
    case 'pending':
      return '待审阅';
    case 'accepted':
      return '已采用';
    case 'discarded':
      return '已舍弃';
  }
}

function backupTrackLabel(
  track: HistoryProjection['recovery']['checkpoints'][number]['track'],
): string {
  switch (track) {
    case 'daily':
      return '日常备份';
    case 'major':
      return '重要恢复点';
    case 'named':
      return '命名快照';
  }
}

function backupFailureLabel(
  code: HistoryProjection['recovery']['backupFailures'][number]['errorCode'],
): string {
  switch (code) {
    case 'BACKUP_CREATE_FAILED':
      return '备份创建失败';
    case 'BACKUP_VERIFY_FAILED':
      return '备份校验失败';
    case 'BACKUP_SPACE_LOW':
      return '备份空间不足';
  }
}
