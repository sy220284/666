import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { confirmRegisteredUnsavedChanges } from '../runtime/unsaved-changes.js';
import {
  createPrimaryNavigationItems,
  resolvePrimaryNavigationIntent,
  type AppDisclosureMode,
  type PrimaryNavigationAvailability,
  type PrimaryNavigationId,
} from '../shell/app-shell-model.js';
import {
  authorNavigationTargetBelongsToProject,
  resolveAuthorNavigationTarget,
  type AuthorNavigationTarget,
} from '../shell/navigation-target.js';
import type { RendererReturnLocation, RendererRouteId } from '../state/ui-state-boundary.js';
import { useRendererUiStore } from '../state/ui-store.js';
import {
  authorReturnFocusKey,
  focusAuthorReturnTarget,
  isWritingRoute,
  type FailureView,
} from './app-shell-helpers.js';

interface AppShellNavigationInput {
  readonly activeProjectId: string | null;
  readonly disclosureMode: AppDisclosureMode;
  readonly availability: PrimaryNavigationAvailability;
  readonly flushWriting: () => Promise<boolean>;
  readonly refreshWorkspace: () => Promise<void>;
  readonly setCanonEntities: () => void;
  readonly setFailure: (failure: FailureView | null) => void;
  readonly setMessage: (message: string | null) => void;
}

export function useAppShellNavigation({
  activeProjectId,
  disclosureMode,
  availability,
  flushWriting,
  refreshWorkspace,
  setCanonEntities,
  setFailure,
  setMessage,
}: AppShellNavigationInput) {
  const route = useRendererUiStore((state) => state.route);
  const selection = useRendererUiStore((state) => state.selection);
  const filters = useRendererUiStore((state) => state.filters);
  const returnLocation = useRendererUiStore((state) => state.returnLocation);
  const navigationQuery = useRendererUiStore((state) => state.filters['navigation.query'] ?? null);
  const navigationGenerationMode = useRendererUiStore(
    (state) => state.filters['navigation.generationMode'] ?? null,
  );
  const foregroundTaskId = useRendererUiStore((state) => state.foregroundRequestKey);
  const dispatch = useRendererUiStore((state) => state.dispatch);
  const [navOpen, setNavOpen] = useState(false);
  const [pendingReturnRestore, setPendingReturnRestore] = useState<RendererReturnLocation | null>(
    null,
  );
  const navToggle = useRef<HTMLButtonElement>(null);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const settingsReturnRoute = useRef<RendererRouteId>('home');
  const mainContent = useRef<HTMLElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && navOpen) {
        setNavOpen(false);
        navToggle.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navOpen]);

  useEffect(() => {
    const location = pendingReturnRestore;
    if (!location || route !== location.route) return;

    let frameId: number | null = null;
    let observer: MutationObserver | null = null;

    const restore = (): boolean => {
      if (mainContent.current) mainContent.current.scrollTop = location.scrollTop;
      if (!focusAuthorReturnTarget(location.focusKey)) return false;
      setPendingReturnRestore((current) => (current === location ? null : current));
      return true;
    };

    const restoreAfterCommit = (): void => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        if (restore()) observer?.disconnect();
      });
    };

    if (restore()) return;

    observer = new MutationObserver(restoreAfterCommit);
    observer.observe(mainContent.current ?? document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'tabindex'],
    });
    restoreAfterCommit();

    return () => {
      observer?.disconnect();
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [pendingReturnRestore, route]);

  const navigation = useMemo(
    () =>
      createPrimaryNavigationItems({
        activeProjectId,
        currentRoute: route,
        disclosureMode,
        availability,
      }),
    [activeProjectId, availability, disclosureMode, route],
  );

  const transitionToRoute = useCallback(
    async (nextRoute: RendererRouteId): Promise<boolean> => {
      if (route === nextRoute) return true;
      if (!confirmRegisteredUnsavedChanges('离开当前页面')) {
        setMessage('已保留当前页面的未保存修改。');
        return false;
      }
      if (isWritingRoute(route) && !(await flushWriting())) {
        setMessage('自动保存失败，已阻止离开当前写作会话。');
        return false;
      }
      setFailure(null);
      setMessage(null);
      dispatch({ type: 'navigate', route: nextRoute });
      return true;
    },
    [dispatch, flushWriting, route, setFailure, setMessage],
  );

  const navigate = useCallback(
    (navigationId: PrimaryNavigationId): void => {
      const resolution = resolvePrimaryNavigationIntent(navigationId, {
        activeProjectId,
        currentRoute: route,
        disclosureMode,
        availability,
      });
      if (!resolution.accepted) {
        setMessage(resolution.reason);
        return;
      }
      setNavOpen(false);
      if (resolution.route === 'settings' && route !== 'settings') {
        settingsReturnRoute.current = route;
      }
      void transitionToRoute(resolution.route).then((changed) => {
        if (changed && navigationId === 'home') void refreshWorkspace();
      });
    },
    [
      activeProjectId,
      availability,
      disclosureMode,
      refreshWorkspace,
      route,
      setMessage,
      transitionToRoute,
    ],
  );

  const navigateToAuthorTarget = useCallback(
    (target: AuthorNavigationTarget): void => {
      void (async () => {
        if (!authorNavigationTargetBelongsToProject(activeProjectId, target)) {
          setMessage('目标不属于当前项目，已阻止跨项目跳转。');
          return;
        }
        if (!confirmRegisteredUnsavedChanges('打开目标内容')) {
          setMessage('已保留当前页面的未保存修改。');
          return;
        }
        const resolution = resolveAuthorNavigationTarget(target);
        if (route !== resolution.route && isWritingRoute(route) && !(await flushWriting())) {
          setMessage('自动保存失败，已阻止离开当前写作会话。');
          return;
        }
        setFailure(null);
        setMessage(null);
        const sourceLocation: RendererReturnLocation = {
          route,
          selection: { ...selection },
          filters: { ...filters },
          scrollTop: Math.max(0, Math.round(mainContent.current?.scrollTop ?? 0)),
          focusKey: authorReturnFocusKey(document.activeElement),
        };
        if (target.type === 'entity') setCanonEntities();
        dispatch({
          type: 'apply-navigation',
          route: resolution.route,
          selection: resolution.selection,
          filters: resolution.filters,
          returnLocation: sourceLocation,
        });
      })();
    },
    [
      activeProjectId,
      dispatch,
      filters,
      flushWriting,
      route,
      selection,
      setCanonEntities,
      setFailure,
      setMessage,
    ],
  );

  const returnToAuthorSource = useCallback(async (): Promise<void> => {
    if (!returnLocation) return;
    if (!confirmRegisteredUnsavedChanges('返回来源页面')) {
      setMessage('已保留当前页面的未保存修改。');
      return;
    }
    if (isWritingRoute(route) && !(await flushWriting())) {
      setMessage('自动保存失败，已阻止返回来源页面。');
      return;
    }
    const location = returnLocation;
    setPendingReturnRestore(location);
    dispatch({ type: 'return-to-source' });
  }, [dispatch, flushWriting, returnLocation, route, setMessage]);

  return {
    route,
    selection,
    filters,
    returnLocation,
    navigationQuery,
    navigationGenerationMode,
    foregroundTaskId,
    dispatch,
    navigation,
    navOpen,
    setNavOpen,
    navToggle,
    settingsTrigger,
    settingsReturnRoute,
    mainContent,
    transitionToRoute,
    navigate,
    navigateToAuthorTarget,
    returnToAuthorSource,
  };
}
