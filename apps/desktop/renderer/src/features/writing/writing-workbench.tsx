import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  ProjectContinuationInput,
  ProjectContinuationSnapshot,
  ProjectWorkspaceSummary,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import type { AppDisclosureMode } from '../../shell/app-shell-model.js';
import type { AuthorNavigationTarget } from '../../shell/navigation-target.js';
import { useRendererUiStore } from '../../state/ui-store.js';
import { HistoricalNavigationNotice } from './historical-navigation-notice.js';
import {
  WritingWorkbench as WritingCoreWorkbench,
  type WritingPanel,
} from './writing-core-workbench.js';

export type { WritingPanel };

interface WritingWorkbenchProps {
  readonly bridge: RendererBridgeAdapter;
  readonly disclosureMode: AppDisclosureMode;
  readonly project: ProjectWorkspaceSummary;
  readonly initialContinuation: ProjectContinuationSnapshot | null;
  readonly panel: WritingPanel;
  readonly navigationChapterId?: string | null;
  readonly navigationLogicalBlockId?: string | null;
  readonly navigationVersionId?: string | null;
  readonly navigationQuery?: string | null;
  readonly navigationGenerationMode?: string | null;
  readonly onNavigate: (target: AuthorNavigationTarget) => void;
  readonly onPanelChange: (panel: WritingPanel) => void;
  readonly onReturn: () => void;
  readonly onStatus: (message: string) => void;
}

const VERSION_RESTORE_NOTICE = '已从只读历史版本恢复为新当前稿。';

export function WritingWorkbench(props: WritingWorkbenchProps) {
  const onPanelChangeRef = useRef(props.onPanelChange);
  const desiredPanelRef = useRef<WritingPanel>(props.panel);
  const latestContinuationRef = useRef<ProjectContinuationSnapshot | null>(
    props.initialContinuation,
  );
  const returnLocation = useRendererUiStore((state) => state.returnLocation);
  desiredPanelRef.current = props.panel;
  const [latestContinuation, setLatestContinuation] = useState<ProjectContinuationSnapshot | null>(
    props.initialContinuation,
  );
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);

  useEffect(() => {
    onPanelChangeRef.current = props.onPanelChange;
  }, [props.onPanelChange]);

  useEffect(() => {
    latestContinuationRef.current = props.initialContinuation;
    setLatestContinuation(props.initialContinuation);
  }, [props.initialContinuation, props.project.projectId]);

  const acceptContinuation = useCallback((continuation: ProjectContinuationSnapshot): void => {
    latestContinuationRef.current = continuation;
    setLatestContinuation(continuation);
  }, []);
  const consumeRestoreNotice = useCallback(() => setRestoreNotice(null), []);

  const bridge = useMemo(
    () =>
      createWritingBridge(
        props.bridge,
        () => desiredPanelRef.current,
        (panel) => {
          desiredPanelRef.current = panel;
          onPanelChangeRef.current(panel);
        },
        acceptContinuation,
        setRestoreNotice,
      ),
    [acceptContinuation, props.bridge],
  );

  const changePanel = useCallback(
    (panel: WritingPanel): void => {
      desiredPanelRef.current = panel;
      onPanelChangeRef.current(panel);
      const snapshot = latestContinuationRef.current;
      if (!snapshot) return;
      void props.bridge.project
        .saveContinuation(continuationInputForPanel(snapshot, panel), { mode: 'replace' })
        .then((outcome) => {
          if (outcome.state === 'success') acceptContinuation(outcome.data);
        });
    },
    [acceptContinuation, props.bridge.project],
  );

  const continuation =
    latestContinuation?.projectId === props.project.projectId
      ? latestContinuation
      : props.initialContinuation;

  return (
    <>
      {returnLocation ? (
        <section className="feature-card navigation-return" data-navigation-return role="status">
          <span>已从来源页面打开目标内容。</span>
          <button type="button" onClick={props.onReturn}>
            返回来源页面
          </button>
        </section>
      ) : null}
      {props.panel === 'versions' &&
      props.navigationChapterId &&
      props.navigationVersionId &&
      props.navigationLogicalBlockId ? (
        <HistoricalNavigationNotice
          bridge={props.bridge}
          projectId={props.project.projectId}
          chapterId={props.navigationChapterId}
          versionId={props.navigationVersionId}
          logicalBlockId={props.navigationLogicalBlockId}
        />
      ) : null}
      <WritingCoreWorkbench
        {...props}
        bridge={bridge}
        initialContinuation={continuation}
        onPanelChange={changePanel}
        statusNotice={restoreNotice}
        onStatusNoticeConsumed={consumeRestoreNotice}
        key={`${props.project.projectId}:${props.panel}`}
      />
    </>
  );
}

function continuationInputForPanel(
  snapshot: ProjectContinuationSnapshot,
  panel: WritingPanel,
): ProjectContinuationInput {
  return {
    projectId: snapshot.projectId,
    chapterId: snapshot.chapterId,
    draftId: snapshot.draftId,
    draftRevision: snapshot.draftRevision,
    logicalBlockId: snapshot.logicalBlockId,
    expectedBlockHash: snapshot.expectedBlockHash,
    cursorOffset: snapshot.cursorOffset,
    scrollTop: snapshot.scrollTop,
    panel,
  };
}

function createWritingBridge(
  bridge: RendererBridgeAdapter,
  getDesiredPanel: () => WritingPanel,
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
    const [input, options] = args;
    const outcome = await bridge.project.saveContinuation(
      { ...input, panel: getDesiredPanel() },
      options,
    );
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
      requestAnimationFrame(() => {
        onPanelChange('editor');
        requestAnimationFrame(() => onRestoreNotice(VERSION_RESTORE_NOTICE));
      });
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
