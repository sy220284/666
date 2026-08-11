import { useCallback, useState } from 'react';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeQuery } from '../../bridge/use-bridge-resource.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import { ChapterNameSelect, type CanonAuthorReferences } from './canon-author-fields.js';
import { ContinuityEditors } from './continuity-editors.js';
import { ContinuityResults } from './continuity-results.js';

export function ContinuityPanel({
  bridge,
  projectId,
  projectName,
  readOnly,
  references,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly projectName: string;
  readonly readOnly: boolean;
  readonly references: CanonAuthorReferences;
}) {
  const [query, setQuery] = useState('');
  const [effectiveChapter, setEffectiveChapter] = useState('');
  const [history, setHistory] = useState(true);
  const [archived, setArchived] = useState(false);
  const load = useCallback(
    () =>
      bridge.continuity.list(
        {
          projectId,
          query,
          includeHistory: history,
          includeArchivedEvents: archived,
          effectiveAtChapterId: effectiveChapter || null,
        },
        { mode: 'share' },
      ),
    [archived, bridge, effectiveChapter, history, projectId, query],
  );
  const resource = useBridgeQuery(
    `continuity:${projectId}:${query}:${effectiveChapter}:${history}:${archived}`,
    load,
  );

  return (
    <section className="feature-card" data-continuity-dialog>
      <div className="feature-card__heading">
        <div>
          <h2>动态状态、时间线与知情信息</h2>
          <p>当前和历史记录由有效区间分离。</p>
        </div>
        <button type="button" onClick={() => void resource.refresh()}>
          读取
        </button>
      </div>
      <div className="filter-bar">
        <input
          aria-label="搜索连续性记录"
          placeholder="搜索状态键、事件、信息键"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ChapterNameSelect
          aria-label="生效章节"
          emptyLabel="全部章节"
          references={references}
          value={effectiveChapter}
          onChange={(event) => setEffectiveChapter(event.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={history}
            onChange={(event) => setHistory(event.target.checked)}
          />
          包含历史
        </label>
        <label>
          <input
            type="checkbox"
            checked={archived}
            onChange={(event) => setArchived(event.target.checked)}
          />
          包含归档事件
        </label>
      </div>
      <p className="feature-status" data-continuity-status>
        {resource.error
          ? `读取失败：${authorErrorSummary(resource.error)}`
          : resource.state === 'success'
            ? `项目：${projectName}`
            : '读取中…'}
      </p>
      <ContinuityResults catalog={resource.data} references={references} />
      <ContinuityEditors
        bridge={bridge}
        catalog={resource.data}
        projectId={projectId}
        readOnly={readOnly}
        references={references}
        onRefresh={resource.refresh}
      />
    </section>
  );
}
