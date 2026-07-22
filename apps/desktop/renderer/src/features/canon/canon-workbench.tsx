import { useCallback } from 'react';

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
  const loadHealth = useCallback(
    () =>
      props.bridge.canon.list(
        { projectId: props.projectId, includeArchived: true },
        { mode: 'replace' },
      ),
    [props.bridge, props.projectId],
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

      <CanonCoreWorkbench {...props} />

      {props.section === 'continuity' ? (
        <ContinuityRelationshipEditor
          bridge={props.bridge}
          projectId={props.projectId}
          readOnly={props.readOnly}
        />
      ) : null}
      {props.section === 'narrative' ? (
        <NarrativeRelationshipEditor
          bridge={props.bridge}
          projectId={props.projectId}
          readOnly={props.readOnly}
        />
      ) : null}
    </section>
  );
}
