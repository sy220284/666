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

interface PersistedDomSelection {
  readonly anchorPath: readonly number[];
  readonly anchorOffset: number;
  readonly focusPath: readonly number[];
  readonly focusOffset: number;
}

export function WritingWorkbench(props: WritingWorkbenchProps) {
  const selectionToRestore = useRef<PersistedDomSelection | null>(null);
  const bridge = useMemo(
    () => createWritingBridge(props.bridge, props.onPanelChange),
    [props.bridge, props.onPanelChange],
  );

  useEffect(() => {
    const rememberSelectionBeforeExit = (event: PointerEvent): void => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-back-project]')) {
        return;
      }
      const content = document.querySelector('[data-draft-content]');
      const selection = document.getSelection();
      if (!(content instanceof HTMLElement) || !selection?.anchorNode || !selection.focusNode) {
        return;
      }
      if (!content.contains(selection.anchorNode) || !content.contains(selection.focusNode)) return;
      const anchorPath = pathFromRoot(content, selection.anchorNode);
      const focusPath = pathFromRoot(content, selection.focusNode);
      if (!anchorPath || !focusPath) return;
      selectionToRestore.current = {
        anchorPath,
        anchorOffset: selection.anchorOffset,
        focusPath,
        focusOffset: selection.focusOffset,
      };
    };

    const restoreSelectionAfterMount = (records: readonly MutationRecord[]): void => {
      const remembered = selectionToRestore.current;
      if (!remembered) return;
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          const content = node.matches('[data-draft-content]')
            ? node
            : node.querySelector('[data-draft-content]');
          if (!(content instanceof HTMLElement)) continue;
          requestAnimationFrame(() => {
            const anchorNode = nodeFromPath(content, remembered.anchorPath);
            const focusNode = nodeFromPath(content, remembered.focusPath);
            if (!anchorNode || !focusNode) return;
            content.focus({ preventScroll: true });
            const selection = document.getSelection();
            if (!selection) return;
            selection.setBaseAndExtent(
              anchorNode,
              clampSelectionOffset(anchorNode, remembered.anchorOffset),
              focusNode,
              clampSelectionOffset(focusNode, remembered.focusOffset),
            );
            selectionToRestore.current = null;
          });
          return;
        }
      }
    };

    const observer = new MutationObserver(restoreSelectionAfterMount);
    document.addEventListener('pointerdown', rememberSelectionBeforeExit, true);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener('pointerdown', rememberSelectionBeforeExit, true);
      observer.disconnect();
    };
  }, []);

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

function pathFromRoot(root: Node, node: Node): readonly number[] | null {
  const path: number[] = [];
  let current: Node | null = node;
  while (current && current !== root) {
    const parent: ParentNode | null = current.parentNode;
    if (!parent) return null;
    const index = Array.prototype.indexOf.call(parent.childNodes, current) as number;
    if (index < 0) return null;
    path.unshift(index);
    current = parent;
  }
  return current === root ? path : null;
}

function nodeFromPath(root: Node, path: readonly number[]): Node | null {
  let current: Node = root;
  for (const index of path) {
    const next = current.childNodes.item(index);
    if (!next) return null;
    current = next;
  }
  return current;
}

function clampSelectionOffset(node: Node, offset: number): number {
  const maximum = node.nodeType === Node.TEXT_NODE ? (node.textContent?.length ?? 0) : node.childNodes.length;
  return Math.min(Math.max(0, offset), maximum);
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
