import { useEffect, useState } from 'react';

import type { PlotNode, ProjectBrief, SceneBeat } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import type { AppDisclosureMode } from '../../shell/app-shell-model.js';
import type { AuthorNavigationTarget } from '../../shell/navigation-target.js';
import { useRendererUiStore } from '../../state/ui-store.js';
import { IdeaCapsulePanel } from './idea-capsule-panel.js';
import { PlanningModeWorkbench } from './planning-mode-workbench.js';

export { StructureNavigator } from '../structure/structure-navigator.js';

interface PlanningWorkbenchProps {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly disclosureMode: AppDisclosureMode;
  readonly onDisclosureModeChange: (mode: AppDisclosureMode) => void;
  readonly onNavigate: (target: AuthorNavigationTarget) => void;
  readonly onClose: () => void;
  readonly onReturn: () => void;
}

type SceneBeatNavigationState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'missing' }
  | { readonly status: 'failed'; readonly message: string }
  | { readonly status: 'ready'; readonly beat: SceneBeat };

type PlanningObjectNavigationState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly label: string }
  | { readonly status: 'missing'; readonly label: string }
  | { readonly status: 'failed'; readonly label: string; readonly message: string }
  | { readonly status: 'plot-node'; readonly node: PlotNode }
  | { readonly status: 'project-brief'; readonly brief: ProjectBrief };

export function PlanningWorkbench(props: PlanningWorkbenchProps) {
  const selectedChapterId = useRendererUiStore((state) => state.selection.chapterId);
  const selectedSceneBeatId = useRendererUiStore((state) => state.selection.sceneBeatId);
  const navigationPlotNodeId = useRendererUiStore(
    (state) => state.filters['navigation.plotNodeId'] ?? null,
  );
  const navigationProjectBriefId = useRendererUiStore(
    (state) => state.filters['navigation.projectBriefId'] ?? null,
  );
  const returnLocation = useRendererUiStore((state) => state.returnLocation);
  const [target, setTarget] = useState<SceneBeatNavigationState>({ status: 'idle' });
  const [planningTarget, setPlanningTarget] = useState<PlanningObjectNavigationState>({
    status: 'idle',
  });

  useEffect(() => {
    if (!selectedSceneBeatId || !selectedChapterId) {
      setTarget(selectedSceneBeatId ? { status: 'missing' } : { status: 'idle' });
      return;
    }
    let active = true;
    setTarget({ status: 'loading' });
    void props.bridge.planning
      .listSceneBeats(
        { projectId: props.projectId, chapterId: selectedChapterId },
        { mode: 'replace' },
      )
      .then((outcome) => {
        if (!active) return;
        if (outcome.state === 'failure') {
          setTarget({ status: 'failed', message: authorErrorSummary(outcome.error) });
          return;
        }
        if (outcome.state !== 'success') {
          setTarget({ status: 'missing' });
          return;
        }
        const beat = outcome.data.beats.find((item) => item.id === selectedSceneBeatId);
        setTarget(beat ? { status: 'ready', beat } : { status: 'missing' });
      });
    return () => {
      active = false;
    };
  }, [props.bridge, props.projectId, selectedChapterId, selectedSceneBeatId]);

  useEffect(() => {
    if (!navigationPlotNodeId && !navigationProjectBriefId) {
      setPlanningTarget({ status: 'idle' });
      return;
    }
    let active = true;
    if (navigationPlotNodeId) {
      setPlanningTarget({ status: 'loading', label: '大纲节点' });
      void props.bridge.planning
        .listPlotNodes(props.projectId, { mode: 'share' })
        .then((outcome) => {
          if (!active) return;
          if (outcome.state === 'failure') {
            setPlanningTarget({
              status: 'failed',
              label: '大纲节点',
              message: authorErrorSummary(outcome.error),
            });
            return;
          }
          if (outcome.state !== 'success') {
            setPlanningTarget({ status: 'missing', label: '大纲节点' });
            return;
          }
          const node = outcome.data.nodes.find((item) => item.id === navigationPlotNodeId);
          setPlanningTarget(
            node ? { status: 'plot-node', node } : { status: 'missing', label: '大纲节点' },
          );
        });
      return () => {
        active = false;
      };
    }

    setPlanningTarget({ status: 'loading', label: '作品核心' });
    void props.bridge.planning.getBrief(props.projectId, { mode: 'share' }).then((outcome) => {
      if (!active) return;
      if (outcome.state === 'failure') {
        setPlanningTarget({
          status: 'failed',
          label: '作品核心',
          message: authorErrorSummary(outcome.error),
        });
        return;
      }
      if (outcome.state !== 'success' || outcome.data.id !== navigationProjectBriefId) {
        setPlanningTarget({ status: 'missing', label: '作品核心' });
        return;
      }
      setPlanningTarget({ status: 'project-brief', brief: outcome.data });
    });
    return () => {
      active = false;
    };
  }, [navigationPlotNodeId, navigationProjectBriefId, props.bridge, props.projectId]);

  return (
    <>
      {returnLocation ? (
        <section className="feature-card navigation-return" data-navigation-return role="status">
          <span>已从来源页面打开转换后的目标。</span>
          <button type="button" onClick={props.onReturn}>
            返回来源页面
          </button>
        </section>
      ) : null}

      {planningTarget.status !== 'idle' ? (
        <section className="feature-card" data-planning-navigation-target>
          <h2>转换后的目标</h2>
          {planningTarget.status === 'loading' ? <p>正在读取{planningTarget.label}…</p> : null}
          {planningTarget.status === 'failed' ? <p>{planningTarget.message}</p> : null}
          {planningTarget.status === 'missing' ? (
            <p>{planningTarget.label}已经删除或发生变化，系统保留来源上下文。</p>
          ) : null}
          {planningTarget.status === 'plot-node' ? (
            <article>
              <strong>{planningTarget.node.title}</strong>
              <p>目标：{planningTarget.node.goal || '尚未填写'}</p>
              <p>核心冲突：{planningTarget.node.coreConflict || '尚未填写'}</p>
              <p>预期结果：{planningTarget.node.expectedResult || '尚未填写'}</p>
            </article>
          ) : null}
          {planningTarget.status === 'project-brief' ? (
            <article>
              <strong>{planningTarget.brief.concept || '作品核心'}</strong>
              <p>阅读承诺：{planningTarget.brief.readingPromise || '尚未填写'}</p>
              <p>主角目标：{planningTarget.brief.protagonistGoal || '尚未填写'}</p>
            </article>
          ) : null}
        </section>
      ) : null}

      {selectedSceneBeatId ? (
        <section className="feature-card" data-scene-beat-navigation={selectedSceneBeatId}>
          <h2>目标场景</h2>
          {target.status === 'loading' ? <p>正在读取目标场景…</p> : null}
          {target.status === 'failed' ? <p>{target.message}</p> : null}
          {target.status === 'missing' ? (
            <p>目标场景已经变化或被删除，系统保留来源上下文。</p>
          ) : null}
          {target.status === 'ready' ? (
            <article>
              <strong>{target.beat.title}</strong>
              <p>目标：{target.beat.goal || '尚未填写'}</p>
              <p>核心冲突：{target.beat.coreConflict || '尚未填写'}</p>
              <p>预期结果：{target.beat.expectedResult || '尚未填写'}</p>
            </article>
          ) : null}
        </section>
      ) : null}

      <IdeaCapsulePanel
        bridge={props.bridge}
        projectId={props.projectId}
        readOnly={props.readOnly}
        onNavigate={props.onNavigate}
      />

      <PlanningModeWorkbench
        bridge={props.bridge}
        projectId={props.projectId}
        readOnly={props.readOnly}
        mode={props.disclosureMode}
        onChangeMode={props.onDisclosureModeChange}
        onClose={props.onClose}
      />
    </>
  );
}
