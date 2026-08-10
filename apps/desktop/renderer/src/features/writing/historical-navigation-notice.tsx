import { useEffect, useState } from 'react';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';

export function HistoricalNavigationNotice({
  bridge,
  projectId,
  chapterId,
  versionId,
  logicalBlockId,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly chapterId: string;
  readonly versionId: string;
  readonly logicalBlockId: string;
}) {
  const [state, setState] = useState<
    | { readonly status: 'loading' }
    | { readonly status: 'missing' }
    | { readonly status: 'ready'; readonly versionTitle: string; readonly text: string }
  >({ status: 'loading' });

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    void bridge.version
      .get({ projectId, chapterId, versionId }, { mode: 'replace' })
      .then((outcome) => {
        if (!active) return;
        if (outcome.state !== 'success') {
          setState({ status: 'missing' });
          return;
        }
        const block = outcome.data.blocks.find((item) => item.logicalBlockId === logicalBlockId);
        setState(
          block
            ? { status: 'ready', versionTitle: outcome.data.title, text: block.text }
            : { status: 'missing' },
        );
      });
    return () => {
      active = false;
    };
  }, [bridge, chapterId, logicalBlockId, projectId, versionId]);

  return (
    <section className="feature-card" data-version-navigation-context role="status">
      <h2>检查问题原文位置</h2>
      {state.status === 'loading' ? <p>正在读取问题所依据的定稿…</p> : null}
      {state.status === 'missing' ? (
        <p>目标版本或段落已经变化。系统保留检查问题上下文，没有跳转到可能错误的正文。</p>
      ) : null}
      {state.status === 'ready' ? (
        <>
          <p>来源：{state.versionTitle}</p>
          <blockquote data-version-navigation-block={logicalBlockId}>{state.text}</blockquote>
        </>
      ) : null}
    </section>
  );
}
