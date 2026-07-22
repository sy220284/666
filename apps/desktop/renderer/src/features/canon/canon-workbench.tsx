import { useCallback, useMemo } from 'react';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeQuery } from '../../bridge/use-bridge-resource.js';
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
  readonly onSectionChange: (section: CanonSection) => void;
}

export function CanonWorkbench(props: CanonWorkbenchProps) {
  const bridge = useMemo(() => coalesceCanonReads(props.bridge), [props.bridge]);
  const loadHealth = useCallback(
    () =>
      bridge.canon.list(
        { projectId: props.projectId, includeArchived: true },
        { mode: 'replace' },
      ),
    [bridge, props.projectId],
  );
  const health = useBridgeQuery(`canon-health:${props.projectId}`, loadHealth);

  return (
    <section className="canon-complete-workbench">
      {health.error ? (
        <div className="safety-inline is-error" data-canon-read-error role="alert">
          实体与Canon读取失败 · {health.error.code} · {health.error.message}
          <button type="button" onClick={() => void health.refresh()}>
            重试
          </button>
        </div>
      ) : health.state === 'cancelled' ? (
        <div className="safety-inline" role="status">
          实体与Canon读取已取消。
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
  }) as Method;
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
