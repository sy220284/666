import type { CommandResult, WorldforgeBridge } from '@worldforge/contracts';

import {
  BridgeRequestCoordinator,
  type BridgeRequestOptions,
  type BridgeRequestOutcome,
} from './request-lifecycle.js';

type RendererBridgePort = Pick<WorldforgeBridge, 'app' | 'settings' | 'project'>;

type AdaptedMethod<Method> = Method extends (
  ...args: infer Args
) => Promise<CommandResult<infer Data>>
  ? (...args: [...Args, options?: BridgeRequestOptions]) => Promise<BridgeRequestOutcome<Data>>
  : never;

type AdaptedDomain<Domain> = {
  readonly [
    Key in keyof Domain as AdaptedMethod<Domain[Key]> extends never ? never : Key
  ]: AdaptedMethod<Domain[Key]>;
};

export interface RendererBridgeAdapter {
  readonly app: AdaptedDomain<WorldforgeBridge['app']>;
  readonly settings: AdaptedDomain<WorldforgeBridge['settings']>;
  readonly project: AdaptedDomain<WorldforgeBridge['project']>;
  readonly cancelAll: () => void;
}

export function createRendererBridgeAdapter(
  bridge: RendererBridgePort,
  coordinator = new BridgeRequestCoordinator(),
): RendererBridgeAdapter {
  return {
    app: {
      getInfo: (options) => coordinator.run('app.getInfo', () => bridge.app.getInfo(), options),
      getCoreStatus: (options) =>
        coordinator.run('app.getCoreStatus', () => bridge.app.getCoreStatus(), options),
      restartCore: (options) =>
        coordinator.run('app.restartCore', () => bridge.app.restartCore(), options),
      getWindowPreferences: (options) =>
        coordinator.run(
          'app.getWindowPreferences',
          () => bridge.app.getWindowPreferences(),
          options,
        ),
      setAppearancePreferences: (preferences, options) =>
        coordinator.run(
          'app.setAppearancePreferences',
          () => bridge.app.setAppearancePreferences(preferences),
          options,
        ),
    },
    settings: {
      get: (options) => coordinator.run('settings.get', () => bridge.settings.get(), options),
      set: (settings, options) =>
        coordinator.run('settings.set', () => bridge.settings.set(settings), options),
      reset: (options) => coordinator.run('settings.reset', () => bridge.settings.reset(), options),
    },
    project: {
      listRecent: (options) =>
        coordinator.run('project.listRecent', () => bridge.project.listRecent(), options),
      relocateRecent: (projectId, options) =>
        coordinator.run(
          `project.relocateRecent:${projectId}`,
          () => bridge.project.relocateRecent(projectId),
          options,
        ),
      removeRecent: (projectId, options) =>
        coordinator.run(
          `project.removeRecent:${projectId}`,
          () => bridge.project.removeRecent(projectId),
          options,
        ),
      getActive: (options) =>
        coordinator.run('project.getActive', () => bridge.project.getActive(), options),
      create: (input, options) =>
        coordinator.run('project.create', () => bridge.project.create(input), options),
      openSelected: (options) =>
        coordinator.run('project.openSelected', () => bridge.project.openSelected(), options),
      openRecent: (projectId, options) =>
        coordinator.run(
          `project.openRecent:${projectId}`,
          () => bridge.project.openRecent(projectId),
          options,
        ),
      close: (projectId, options) =>
        coordinator.run(
          `project.close:${projectId}`,
          () => bridge.project.close(projectId),
          options,
        ),
      move: (projectId, options) =>
        coordinator.run(`project.move:${projectId}`, () => bridge.project.move(projectId), options),
    },
    cancelAll: () => coordinator.cancelAll(),
  };
}

export function createWindowRendererBridgeAdapter(): RendererBridgeAdapter {
  if (typeof window === 'undefined' || !window.worldforge) {
    throw new Error('The trusted WorldForge preload bridge is unavailable.');
  }
  return createRendererBridgeAdapter(window.worldforge);
}
