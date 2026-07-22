import { useEffect, useMemo, useRef } from 'react';

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
  const restoreEditorFocus = useRef(false);
  const bridge = useMemo(() => createWritingBridge(props.bridge), [props.bridge]);

  useEffect(() => {
    const rememberEditorExit = (event: MouseEvent): void => {
      if (event.target instanceof Element && event.target.closest('[data-back-project]')) {
        restoreEditorFocus.current = true;
      }
    };
    const restoreOnEditorMount = (records: readonly MutationRecord[]): void => {
      if (!restoreEditorFocus.current) return;
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          const content = node.matches('[data-draft-content]')
            ? node
            : node.querySelector('[data-draft-content]');
          if (!(content instanceof HTMLElement)) continue;
          restoreEditorFocus.current = false;
          requestAnimationFrame(() => content.focus());
          return;
        }
      }
    };
    const observer = new MutationObserver(restoreOnEditorMount);
    document.addEventListener('click', rememberEditorExit, true);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener('click', rememberEditorExit, true);
      observer.disconnect();
    };
  }, []);

  return <WritingCoreWorkbench {...props} bridge={bridge} />;
}

function createWritingBridge(bridge: RendererBridgeAdapter): RendererBridgeAdapter {
  type ListStructure = RendererBridgeAdapter['planning']['listStructure'];
  type CreateVersion = RendererBridgeAdapter['version']['create'];
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

  const createVersion: CreateVersion = async (...args) => {
    const [input, options] = args;
    const latestDraft = await bridge.draft.open(
      { projectId: input.projectId, chapterId: input.chapterId },
      { mode: 'replace' },
    );
    if (latestDraft.state !== 'success') {
      return latestDraft as unknown as Awaited<ReturnType<CreateVersion>>;
    }
    return bridge.version.create(
      {
        ...input,
        draftId: latestDraft.data.draftId,
        baseRevision: latestDraft.data.revision,
      },
      options,
    );
  };

  const planning = new Proxy(bridge.planning, {
    get(target, property, receiver) {
      return property === 'listStructure'
        ? listStructure
        : Reflect.get(target, property, receiver);
    },
  });
  const version = new Proxy(bridge.version, {
    get(target, property, receiver) {
      return property === 'create' ? createVersion : Reflect.get(target, property, receiver);
    },
  });

  return { ...bridge, planning, version };
}
