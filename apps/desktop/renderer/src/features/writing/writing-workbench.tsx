import { useMemo } from 'react';

import type { ProjectWorkspaceSummary } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import {
  WritingWorkbench as WritingCoreWorkbench,
  type WritingPanel,
} from './writing-core-workbench.js';

export type { WritingPanel };

interface WritingWorkbenchProps {
  readonly bridge: RendererBridgeAdapter;
  readonly project: ProjectWorkspaceSummary;
  readonly panel: WritingPanel;
  readonly onPanelChange: (panel: WritingPanel) => void;
  readonly onStatus: (message: string) => void;
}

export function WritingWorkbench(props: WritingWorkbenchProps) {
  const bridge = useMemo(() => coalesceStructureReads(props.bridge), [props.bridge]);
  return <WritingCoreWorkbench {...props} bridge={bridge} />;
}

function coalesceStructureReads(bridge: RendererBridgeAdapter): RendererBridgeAdapter {
  type ListStructure = RendererBridgeAdapter['planning']['listStructure'];
  let pendingProjectId: string | null = null;
  let pending: ReturnType<ListStructure> | null = null;

  const listStructure: ListStructure = (...args) => {
    const projectId = args[0];
    if (pending && pendingProjectId === projectId) return pending;
    const request = bridge.planning.listStructure(...args);
    pendingProjectId = projectId;
    pending = request;
    void request.finally(() => {
      if (pending === request) {
        pending = null;
        pendingProjectId = null;
      }
    });
    return request;
  };

  const planning = new Proxy(bridge.planning, {
    get(target, property, receiver) {
      return property === 'listStructure'
        ? listStructure
        : Reflect.get(target, property, receiver);
    },
  });

  return { ...bridge, planning };
}
