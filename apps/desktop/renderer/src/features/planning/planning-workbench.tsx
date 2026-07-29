import { useCallback } from 'react';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeQuery } from '../../bridge/use-bridge-resource.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import { useRendererUiStore } from '../../state/ui-store.js';
import type { AppDisclosureMode } from '../../shell/app-shell-model.js';
import {
  PlanningModeWorkbench,
  StructureNavigator,
} from './planning-mode-workbench.js';

export { StructureNavigator };

interface PlanningWorkbenchProps {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly disclosureMode?: AppDisclosureMode;
  readonly onClose: () => void;
}

export function PlanningWorkbench(props: PlanningWorkbenchProps) {
  const selectedChapterId = useRendererUiStore((state) => state.selection.chapterId);
  const selectedSceneBeatId = useRendererUiStore((state) => state.selection.sceneBeatId);
  const returnLocation = useRendererUiStore((state) => state.returnLocation);
  const dispatch = useRendererUiStore((state) => state.dispatch);
  const loadTarget = useCallback(
    () =>
      props.bridge.planning.listSceneBeats(
        { projectId: props.projectId, chapterId: selectedChapterId ?? '' },
        { mode: 'replace' },
      ),
    [props.bridge, props.projectId, selectedChapterId],
  );
  const target = useBridgeQuery(
    `planning-navigation:${props.projectId}:${selectedChapterId ?? 'none'}:${selectedSceneBeatId ?? 'none'}`,
    loadTarget,
  );
  const selectedBeat = target.data?.beats.find((beat) => beat.id === selectedSceneBeatId) ?? null;

  return (
    <>
      {returnLocation ? (
        <section className="feature-card navigation-return" data-navigation-return role="status">
          <span>已从来源页面打开目标场景节拍。</span>
          <button
            type="button"
            onClick={() =>
              dispatch({ type: 'navigate', route: returnLocation.route, returnLocation: null })
            }
          >
            返回来源页面
          </button>
        </section>
      ) : null}
      {selectedSceneBeatId ? (
        <section className="feature-card" data-scene-beat-navigation={selectedSceneBeatId}>
          <h2>目标场景节拍</h2>
          {!selectedChapterId ? <p>目标章节已经变化，无法读取场景节拍。</p> : null}
          {selectedChapterId && target.state === 'loading' ? <p>正在读取目标场景节拍…</p> : null}
          {target.error ? <p>{authorErrorSummary(target.error)}</p> : null}
          {target.state === 'success' && !selectedBeat ? (
            <p>目标场景节拍已经变化或被删除，系统保留来源上下文。</p>
          ) : null}
          {selectedBeat ? (
            <article>
              <strong>{selectedBeat.title}</strong>
              <p>目标：{selectedBeat.goal || '尚未填写'}</p>
              <p>核心冲突：{selectedBeat.coreConflict || '尚未填写'}</p>
              <p>预期结果：{selectedBeat.expectedResult || '尚未填写'}</p>
            </article>
          ) : null}
        </section>
      ) : null}
      <PlanningModeWorkbench {...props} />
    </>
  );
}
