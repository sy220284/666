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
  const bridge = useMemo(
    () => createWritingBridge(props.bridge, props.onPanelChange),
    [props.bridge, props.onPanelChange],
  );

  return <WritingCoreWorkbench {...props} bridge={bridge} />;
}

function createWritingBridge(
  bridge: RendererBridgeAdapter,
  onPanelChange: (panel: WritingPanel) => void,
): RendererBridgeAdapter {
  type ListStructure = RendererBridgeAdapter['planning']['listStructure'];
  type CreateVersion = RendererBridgeAdapter['version']['create'];
  type RestoreVersion = RendererBridgeAdapter['version']['restore'];
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

  const restoreVersion: RestoreVersion = async (...args) => {
    const outcome = await bridge.version.restore(...args);
    if (outcome.state === 'success') {
      onPanelChange('editor');
      await waitForDraftEditorHost();
    }
    return outcome;
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
      if (property === 'create') return createVersion;
      if (property === 'restore') return restoreVersion;
      return Reflect.get(target, property, receiver);
    },
  });

  return { ...bridge, planning, version };
}

function waitForDraftEditorHost(): Promise<void> {
  return new Promise((resolve) => {
    const finish = (): void => {
      requestAnimationFrame(() => resolve());
    };
    if (document.querySelector('[data-draft-editor-host]')) {
      finish();
      return;
    }

    const observer = new MutationObserver(() => {
      if (!document.querySelector('[data-draft-editor-host]')) return;
      observer.disconnect();
      clearTimeout(timeout);
      finish();
    });
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      resolve();
    }, 1_000);
    observer.observe(document.body, { childList: true, subtree: true });
  });
}
