import { useEffect, useMemo, useRef, useState } from 'react';

import type { ProjectContinuationSnapshot, ProjectWorkspaceSummary } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import {
  WritingWorkbench as WritingCoreWorkbench,
  type WritingPanel,
} from './writing-core-workbench.js';

export type { WritingPanel };

interface WritingWorkbenchProps {
  readonly bridge: RendererBridgeAdapter;
  readonly project: ProjectWorkspaceSummary;
  readonly initialContinuation: ProjectContinuationSnapshot | null;
  readonly panel: WritingPanel;
  readonly onPanelChange: (panel: WritingPanel) => void;
  readonly onStatus: (message: string) => void;
}

const VERSION_RESTORE_NOTICE = '已从只读版本恢复为新草稿。';

export function WritingWorkbench(props: WritingWorkbenchProps) {
  const onPanelChangeRef = useRef(props.onPanelChange);
  const [latestContinuation, setLatestContinuation] = useState<ProjectContinuationSnapshot | null>(
    props.initialContinuation,
  );
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);

  useEffect(() => {
    onPanelChangeRef.current = props.onPanelChange;
  }, [props.onPanelChange]);

  useEffect(() => {
    setLatestContinuation(props.initialContinuation);
  }, [props.initialContinuation, props.project.projectId]);

  useEffect(() => {
    if (!restoreNotice || props.panel !== 'editor') return;

    let active = true;
    let settleTimer: number | null = null;
    const applyNotice = (): void => {
      const status = document.querySelector<HTMLElement>(
        '[data-writing-workbench] [data-draft-state]',
      );
      if (!status) return;
      if (status.textContent !== restoreNotice) status.textContent = restoreNotice;
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        if (!active) return;
        active = false;
        observer.disconnect();
        setRestoreNotice(null);
      }, 500);
    };
    const observer = new MutationObserver(applyNotice);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    applyNotice();

    return () => {
      active = false;
      observer.disconnect();
      if (settleTimer !== null) window.clearTimeout(settleTimer);
    };
  }, [props.panel, restoreNotice]);

  const bridge = useMemo(
    () =>
      createWritingBridge(
        props.bridge,
        (panel) => onPanelChangeRef.current(panel),
        setLatestContinuation,
        setRestoreNotice,
      ),
    [props.bridge],
  );

  const continuation =
    latestContinuation?.projectId === props.project.projectId
      ? latestContinuation
      : props.initialContinuation;

  return (
    <WritingCoreWorkbench
      {...props}
      bridge={bridge}
      initialContinuation={continuation}
      key={`${props.project.projectId}:${props.panel}`}
    />
  );
}

function createWritingBridge(
  bridge: RendererBridgeAdapter,
  onPanelChange: (panel: WritingPanel) => void,
  onContinuation: (continuation: ProjectContinuationSnapshot) => void,
  onRestoreNotice: (message: string) => void,
): RendererBridgeAdapter {
  type ListStructure = RendererBridgeAdapter['planning']['listStructure'];
  type SaveContinuation = RendererBridgeAdapter['project']['saveContinuation'];
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
    const clear = (): void => {
      if (pending === request) {
        pending = null;
        pendingProjectId = null;
      }
    };
    void request.then(clear, clear);
    return request;
  };

  const saveContinuation: SaveContinuation = async (...args) => {
    const outcome = await bridge.project.saveContinuation(...args);
    if (outcome.state === 'success') onContinuation(outcome.data);
    return outcome;
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
      onRestoreNotice(VERSION_RESTORE_NOTICE);
      requestAnimationFrame(() => onPanelChange('editor'));
    }
    return outcome;
  };

  const project = new Proxy(bridge.project, {
    get(target, property, receiver) {
      return property === 'saveContinuation'
        ? saveContinuation
        : Reflect.get(target, property, receiver);
    },
  });
  const planning = new Proxy(bridge.planning, {
    get(target, property, receiver) {
      return property === 'listStructure' ? listStructure : Reflect.get(target, property, receiver);
    },
  });
  const version = new Proxy(bridge.version, {
    get(target, property, receiver) {
      if (property === 'create') return createVersion;
      if (property === 'restore') return restoreVersion;
      return Reflect.get(target, property, receiver);
    },
  });

  return { ...bridge, project, planning, version };
}
