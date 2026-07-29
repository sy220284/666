import { useCallback, useEffect, useMemo, useState } from 'react';

import type { NarrativePlanningCatalog } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeQuery } from '../../bridge/use-bridge-resource.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import { useRendererUiStore } from '../../state/ui-store.js';
import {
  CanonWorkbench as CanonCoreWorkbench,
  type CanonSection,
} from './canon-core-workbench.js';
import { ContinuityRelationshipEditor } from './continuity-relationship-editor.js';
import { NarrativeRelationshipEditor } from './narrative-relationship-editor.js';

export type { CanonSection };

interface CanonWorkbenchProps {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly projectName: string;
  readonly readOnly: boolean;
  readonly section: CanonSection;
  readonly selectedEntityId?: string | null;
  readonly onSectionChange: (section: CanonSection) => void;
}

type Foreshadowing = NarrativePlanningCatalog['foreshadowings'][number];
type ForeshadowingNavigationState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'missing' }
  | { readonly status: 'failed'; readonly message: string }
  | { readonly status: 'ready'; readonly foreshadowing: Foreshadowing };

export function CanonWorkbench(props: CanonWorkbenchProps) {
  const bridge = useMemo(() => coalesceCanonReads(props.bridge), [props.bridge]);
  const selectedForeshadowingId = useRendererUiStore(
    (state) => state.filters['navigation.foreshadowingId'] ?? null,
  );
  const returnLocation = useRendererUiStore((state) => state.returnLocation);
  const dispatch = useRendererUiStore((state) => state.dispatch);
  const [target, setTarget] = useState<ForeshadowingNavigationState>({ status: 'idle' });
  const loadHealth = useCallback(
    () =>
      bridge.canon.list(
        { projectId: props.projectId, includeArchived: true },
        { mode: 'replace' },
      ),
    [bridge, props.projectId],
  );
  const health = useBridgeQuery(`canon-health:${props.projectId}`, loadHealth);

  useEffect(() => {
    if (selectedForeshadowingId && props.section !== 'narrative') {
      props.onSectionChange('narrative');
    }
  }, [props.onSectionChange, props.section, selectedForeshadowingId]);

  useEffect(() => {
    if (!selectedForeshadowingId) {
      setTarget({ status: 'idle' });
      return;
    }
    let active = true;
    setTarget({ status: 'loading' });
    void bridge.narrativePlanning
      .list(
        {
          projectId: props.projectId,
          query: '',
          includeResolved: true,
          referenceChapterId: null,
        },
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
        const foreshadowing = outcome.data.foreshadowings.find(
          (item) => item.id === selectedForeshadowingId,
        );
        setTarget(
          foreshadowing ? { status: 'ready', foreshadowing } : { status: 'missing' },
        );
      });
    return () => {
      active = false;
    };
  }, [bridge, props.projectId, selectedForeshadowingId]);

  return (
    <section className="canon-complete-workbench">
      {returnLocation ? (
        <section className="feature-card navigation-return" data-navigation-return role="status">
          <span>已从来源页面打开目标设定。</span>
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
      {selectedForeshadowingId ? (
        <section className="feature-card" data-foreshadowing-navigation={selectedForeshadowingId}>
          <h2>目标伏笔</h2>
          {target.status === 'loading' ? <p>正在读取目标伏笔…</p> : null}
          {target.status === 'failed' ? <p>{target.message}</p> : null}
          {target.status === 'missing' ? (
            <p>目标伏笔已经变化或被删除，系统保留来源上下文。</p>
          ) : null}
          {target.status === 'ready' ? (
            <article>
              <strong>{target.foreshadowing.title}</strong>
              <p>{target.foreshadowing.description || '尚未填写说明'}</p>
            </article>
          ) : null}
        </section>
      ) : null}
      {health.error ? (
        <div className="safety-inline is-error" data-canon-read-error role="alert">
          {authorErrorSummary(health.error)}
          <button type="button" onClick={() => void health.refresh()}>
            重试
          </button>
        </div>
      ) : health.state === 'cancelled' ? (
        <div className="safety-inline" role="status">
          人物与设定读取已取消。
        </div>
      ) : null}

      <CanonCoreWorkbench {...props} bridge={bridge} />

      {props.section === 'continuity' ? (
        <ContinuityRelationshipEditor
          bridge={bridge}
          projectId={props.projectId}
          readOnly={props.readOnly}
        />
      ) : null}
      {props.section === 'narrative' ? (
        <NarrativeRelationshipEditor
          bridge={bridge}
          projectId={props.projectId}
          readOnly={props.readOnly}
        />
      ) : null}
    </section>
  );
}

function coalesceCanonReads(bridge: RendererBridgeAdapter): RendererBridgeAdapter {
  type CanonList = RendererBridgeAdapter['canon']['list'];
  type ContinuityList = RendererBridgeAdapter['continuity']['list'];
  type NarrativeList = RendererBridgeAdapter['narrativePlanning']['list'];

  const canonList = coalescedMethod<CanonList>((...args) => bridge.canon.list(...args));
  const continuityList = coalescedMethod<ContinuityList>((...args) =>
    bridge.continuity.list(...args),
  );
  const narrativeList = coalescedMethod<NarrativeList>((...args) =>
    bridge.narrativePlanning.list(...args),
  );

  return {
    ...bridge,
    canon: methodProxy(bridge.canon, 'list', canonList),
    continuity: methodProxy(bridge.continuity, 'list', continuityList),
    narrativePlanning: methodProxy(bridge.narrativePlanning, 'list', narrativeList),
  };
}

function coalescedMethod<Method extends (...args: never[]) => Promise<unknown>>(
  method: Method,
): Method {
  const pending = new Map<string, ReturnType<Method>>();
  return ((...args: Parameters<Method>) => {
    const key = JSON.stringify(args[0] ?? null);
    const current = pending.get(key);
    if (current) return current;
    const request = method(...args) as ReturnType<Method>;
    pending.set(key, request);
    void request.finally(() => {
      if (pending.get(key) === request) pending.delete(key);
    });
    return request;
  }) as unknown as Method;
}

function methodProxy<Domain extends object, Method extends keyof Domain>(
  domain: Domain,
  method: Method,
  implementation: Domain[Method],
): Domain {
  return new Proxy(domain, {
    get(target, property, receiver) {
      return property === method ? implementation : Reflect.get(target, property, receiver);
    },
  });
}
