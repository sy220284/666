import { useCallback, useState } from 'react';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeQuery } from '../../bridge/use-bridge-resource.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import { ChapterNameSelect, type CanonAuthorReferences } from './canon-author-fields.js';
import { NarrativePlanningEditors } from './narrative-planning-editors.js';
import { NarrativePlanningResults } from './narrative-planning-results.js';

export function NarrativePlanningPanel({
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
  const [chapter, setChapter] = useState('');
  const [includeResolved, setIncludeResolved] = useState(true);
  const load = useCallback(
    () =>
      bridge.narrativePlanning.list(
        { projectId, query, includeResolved, referenceChapterId: chapter || null },
        { mode: 'replace', laneKey: `narrative:${projectId}:list` },
      ),
    [bridge, chapter, includeResolved, projectId, query],
  );
  const resource = useBridgeQuery(
    `narrative:${projectId}:${query}:${chapter}:${includeResolved}`,
    load,
  );

  return (
    <section className="feature-card" data-narrative-planning-dialog>
      <div className="feature-card__heading">
        <div>
          <h2>伏笔生命周期与人物弧光</h2>
          <p>计划、实际命中和作者确认来源并列展示。</p>
        </div>
        <button
          data-refresh-narrative-planning
          type="button"
          onClick={() => void resource.refresh()}
        >
          读取
        </button>
      </div>
      <div className="filter-bar">
        <input
          data-narrative-planning-query
          placeholder="搜索伏笔、弧光或节点"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ChapterNameSelect
          data-narrative-reference-chapter
          emptyLabel="全部章节"
          references={references}
          value={chapter}
          onChange={(event) => setChapter(event.target.value)}
        />
        <label>
          <input
            data-narrative-include-resolved
            type="checkbox"
            checked={includeResolved}
            onChange={(event) => setIncludeResolved(event.target.checked)}
          />
          包含已结束记录
        </label>
      </div>
      <p className="feature-status" data-narrative-planning-status>
        {resource.error
          ? `读取失败：${authorErrorSummary(resource.error)}`
          : resource.state === 'success'
            ? `项目：${projectName}`
            : '读取中…'}
      </p>
      <NarrativePlanningResults catalog={resource.data} references={references} />
      <NarrativePlanningEditors
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
