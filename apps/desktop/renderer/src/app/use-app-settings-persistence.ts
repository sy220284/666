import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_APPEARANCE_PREFERENCES,
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type AppSettingsUpdate,
  type AppearancePreferences,
  type ProjectWorkspaceSummary,
  type ProviderConnectionTestResult,
  type ProviderSummary,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../bridge/renderer-bridge-adapter.js';
import { resolveAiReadiness } from '../runtime/ai-readiness.js';
import { failureFromOutcome, type FailureView } from './app-shell-helpers.js';
import type { RendererApplicationController } from './renderer-application-controller.js';

interface AppSettingsPersistenceInput {
  readonly bridge: RendererBridgeAdapter;
  readonly activeProject: ProjectWorkspaceSummary | null;
  readonly setPendingKey: (key: string | null) => void;
  readonly setMessage: (message: string | null) => void;
  readonly setFailure: (failure: FailureView | null) => void;
  readonly applicationController: RendererApplicationController;
}

export function useAppSettingsPersistence({
  bridge,
  activeProject,
  setPendingKey,
  setMessage,
  setFailure,
  applicationController,
}: AppSettingsPersistenceInput) {
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const confirmedSettings = useRef<AppSettings>(DEFAULT_APP_SETTINGS);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [appearance, setAppearance] = useState<AppearancePreferences>(
    DEFAULT_APPEARANCE_PREFERENCES,
  );
  const [providers, setProviders] = useState<readonly ProviderSummary[]>([]);
  const [verifiedProviderIds, setVerifiedProviderIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const aiReadiness = useMemo(
    () => resolveAiReadiness(providers, verifiedProviderIds),
    [providers, verifiedProviderIds],
  );

  const applySettings = useCallback((next: AppSettings): void => {
    confirmedSettings.current = next;
    setSettings(next);
  }, []);

  const applyAppearance = useCallback((next: AppearancePreferences): void => {
    setAppearance(next);
  }, []);

  const applyProviders = useCallback((nextProviders: readonly ProviderSummary[]): void => {
    setProviders(nextProviders);
    const currentIds = new Set(nextProviders.map((provider) => provider.id));
    setVerifiedProviderIds(
      (current) => new Set([...current].filter((providerId) => currentIds.has(providerId))),
    );
  }, []);

  const flushSettings = useCallback(async (): Promise<void> => {
    await writeQueue.current;
  }, []);

  const saveSettings = useCallback(
    (update: AppSettingsUpdate): Promise<boolean> => {
      if (update.creativePath === 'ai-first' && aiReadiness.status !== 'ready') {
        setMessage('AI优先需要先在本次会话完成真实连接测试；离线创作功能保持可用。');
        return Promise.resolve(false);
      }
      const write = writeQueue.current.then(async () => {
        setPendingKey('settings.set');
        try {
          const current = confirmedSettings.current;
          const outcome = await bridge.settings.set({
            language: update.language ?? current.language,
            startupBehavior: update.startupBehavior ?? current.startupBehavior,
            defaultMode: update.defaultMode ?? current.defaultMode,
            creativePath: update.creativePath ?? current.creativePath,
            onboardingCompleted: update.onboardingCompleted ?? current.onboardingCompleted,
            onboardingTipsSeen: update.onboardingTipsSeen ?? current.onboardingTipsSeen,
            onboardingScaffoldDismissed:
              update.onboardingScaffoldDismissed ?? current.onboardingScaffoldDismissed,
            themeId: update.themeId ?? current.themeId,
            themeVariant: update.themeVariant ?? current.themeVariant,
            reduceMotion: update.reduceMotion ?? current.reduceMotion,
            shortcutOverrides: update.shortcutOverrides ?? current.shortcutOverrides,
            typewriterMode: update.typewriterMode ?? current.typewriterMode,
            typewriterAnchorPercent:
              update.typewriterAnchorPercent ?? current.typewriterAnchorPercent,
            themeSealText: update.themeSealText ?? current.themeSealText,
          });
          if (outcome.state !== 'success') {
            setFailure(failureFromOutcome('设置保存失败', outcome));
            return false;
          }
          applySettings(outcome.data.settings);
          setMessage('设置已保存到应用数据库。');
          return true;
        } finally {
          setPendingKey(null);
        }
      });
      writeQueue.current = write.then(
        () => undefined,
        () => undefined,
      );
      return write;
    },
    [aiReadiness.status, applySettings, bridge, setFailure, setMessage, setPendingKey],
  );

  const resetSettings = useCallback((): Promise<void> => {
    const write = writeQueue.current.then(async () => {
      setPendingKey('settings.reset');
      try {
        const outcome = await bridge.settings.reset();
        if (outcome.state === 'success') {
          applySettings(outcome.data.settings);
          setMessage('已恢复默认设置。');
        } else {
          setFailure(failureFromOutcome('恢复默认设置失败', outcome));
        }
      } finally {
        setPendingKey(null);
      }
    });
    writeQueue.current = write.then(
      () => undefined,
      () => undefined,
    );
    return write;
  }, [applySettings, bridge, setFailure, setMessage, setPendingKey]);

  const saveAppearance = useCallback(
    async (next: AppearancePreferences): Promise<boolean> => {
      setPendingKey('app.setAppearancePreferences');
      const outcome = await bridge.app.setAppearancePreferences(next);
      setPendingKey(null);
      if (outcome.state !== 'success') {
        setFailure(failureFromOutcome('显示设置保存失败', outcome));
        return false;
      }
      applyAppearance({
        workspaceAlignment: outcome.data.workspaceAlignment,
        uiScalePercent: outcome.data.uiScalePercent,
        bodyFontSize: outcome.data.bodyFontSize,
        contentWidth: outcome.data.contentWidth,
      });
      setMessage('显示设置已保存到应用数据库。');
      return true;
    },
    [applyAppearance, bridge, setFailure, setMessage, setPendingKey],
  );

  const verifyProvider = useCallback((result: ProviderConnectionTestResult): void => {
    setVerifiedProviderIds((current) => new Set([...current, result.providerId]));
  }, []);

  const invalidateProvider = useCallback((providerId: string): void => {
    setVerifiedProviderIds((current) => {
      const next = new Set(current);
      next.delete(providerId);
      return next;
    });
  }, []);

  useEffect(() => {
    applicationController.applyPresentation(
      settings,
      appearance,
      activeProject
        ? activeProject.databaseMode === 'read-only'
          ? 'read-only'
          : 'open'
        : 'closed',
    );
  }, [activeProject, appearance, applicationController, settings]);

  return {
    settings,
    appearance,
    providers,
    verifiedProviderIds,
    aiReadiness,
    applySettings,
    applyAppearance,
    applyProviders,
    flushSettings,
    saveSettings,
    resetSettings,
    saveAppearance,
    verifyProvider,
    invalidateProvider,
  };
}
