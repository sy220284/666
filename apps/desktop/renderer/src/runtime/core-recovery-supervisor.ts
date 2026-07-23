import type { CoreStatus } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../bridge/renderer-bridge-adapter.js';

export type CoreRecoveryHealth = CoreStatus['status'] | 'unreachable';

export interface CoreRecoverySurfaceState {
  readonly visible: boolean;
  readonly health: CoreRecoveryHealth;
  readonly recovering: boolean;
  readonly message: string;
  readonly hasRecoverableProject: boolean;
}

export interface CoreRecoverySurfaceActions {
  readonly restart: () => void;
  readonly copyDraft: () => void;
}

export interface CoreRecoverySurface {
  bind(actions: CoreRecoverySurfaceActions): void;
  render(state: CoreRecoverySurfaceState): void;
  dispose(): void;
}

export interface CoreRecoverySupervisor {
  readonly health: CoreRecoveryHealth;
  readonly rememberedProjectId: string | null;
  start(): void;
  checkNow(): Promise<void>;
  restart(): Promise<boolean>;
  copyDraft(): Promise<boolean>;
  dispose(): void;
}

interface CoreRecoveryBridge {
  readonly app: Pick<RendererBridgeAdapter['app'], 'getCoreStatus' | 'restartCore'>;
  readonly project: Pick<
    RendererBridgeAdapter['project'],
    'getActive' | 'listRecent' | 'openRecent'
  >;
}

interface RecoverableProjectIdentity {
  readonly projectId: string;
}

export interface CoreRecoverySupervisorOptions {
  readonly bridge: CoreRecoveryBridge;
  readonly surface?: CoreRecoverySurface;
  readonly pollIntervalMs?: number;
  readonly schedule?: (handler: () => void, intervalMs: number) => unknown;
  readonly cancelSchedule?: (handle: unknown) => void;
  readonly readDraftText?: () => string;
  readonly writeClipboardText?: (text: string) => Promise<void>;
}

const DEFAULT_POLL_INTERVAL_MS = 2_000;

export function createCoreRecoverySupervisor(
  options: CoreRecoverySupervisorOptions,
): CoreRecoverySupervisor {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 250) {
    throw new Error('CORE_RECOVERY_POLL_INTERVAL_INVALID');
  }

  const schedule =
    options.schedule ??
    ((handler: () => void, intervalMs: number): unknown => window.setInterval(handler, intervalMs));
  const cancelSchedule =
    options.cancelSchedule ?? ((handle: unknown): void => window.clearInterval(handle as number));
  const readDraftText = options.readDraftText ?? defaultDraftText;
  const writeClipboardText = options.writeClipboardText ?? defaultClipboardWrite;
  const surface = options.surface ?? createDomCoreRecoverySurface();

  let disposed = false;
  let lifecycle = 0;
  let started = false;
  let timer: unknown | null = null;
  let checkPromise: Promise<void> | null = null;
  let restartPromise: Promise<boolean> | null = null;
  let health: CoreRecoveryHealth = 'starting';
  let observed = false;
  let rememberedProject: RecoverableProjectIdentity | null = null;
  let recovering = false;
  let message = '正在检查Core运行状态。';

  const isCurrent = (epoch: number): boolean => !disposed && lifecycle === epoch;

  const publish = (): void => {
    if (disposed) return;
    surface.render({
      visible: observed && (health !== 'healthy' || recovering),
      health,
      recovering,
      message,
      hasRecoverableProject: rememberedProject !== null,
    });
  };

  const rememberActiveProject = async (epoch: number): Promise<void> => {
    try {
      const project = await options.bridge.project.getActive();
      if (isCurrent(epoch) && project.state === 'success' && project.data) {
        rememberedProject = project.data;
      }
    } catch {
      // A concurrent workspace refresh may own the same bridge key. The next poll retries.
    }
  };

  const recentProjectFallback = async (
    epoch: number,
  ): Promise<RecoverableProjectIdentity | null> => {
    try {
      const recent = await options.bridge.project.listRecent();
      if (!isCurrent(epoch) || recent.state !== 'success') return null;
      return recent.data.projects[0] ?? null;
    } catch {
      return null;
    }
  };

  const checkNow = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (checkPromise) return checkPromise;
    const epoch = lifecycle;
    checkPromise = Promise.resolve()
      .then(async () => {
        const outcome = await options.bridge.app.getCoreStatus();
        if (!isCurrent(epoch)) return;
        if (outcome.state !== 'success') {
          observed = true;
          health = 'unreachable';
          message =
            outcome.state === 'failure'
              ? `Core状态不可读取：${outcome.error.code}`
              : 'Core状态请求未完成。';
          publish();
          return;
        }
        observed = true;
        health = outcome.data.status;
        if (health === 'healthy') {
          await rememberActiveProject(epoch);
          if (!isCurrent(epoch)) return;
          message = 'Core运行正常。';
        } else {
          message = `Core当前状态：${health}。未保存正文仍保留在当前窗口。`;
        }
        publish();
      })
      .catch(() => {
        if (!isCurrent(epoch)) return;
        observed = true;
        health = 'unreachable';
        message = 'Core连接已中断。未保存正文仍保留在当前窗口。';
        publish();
      })
      .finally(() => {
        if (lifecycle === epoch) checkPromise = null;
      });
    return checkPromise;
  };

  const restart = (): Promise<boolean> => {
    if (disposed) return Promise.resolve(false);
    if (restartPromise) return restartPromise;
    const epoch = lifecycle;
    observed = true;
    recovering = true;
    message = '正在重启Core；当前编辑器内容不会被清空。';
    publish();

    restartPromise = (async (): Promise<boolean> => {
      try {
        const outcome = await options.bridge.app.restartCore();
        if (!isCurrent(epoch)) return false;
        if (outcome.state !== 'success' || outcome.data.status.status !== 'healthy') {
          health = outcome.state === 'success' ? outcome.data.status.status : 'unreachable';
          message =
            outcome.state === 'failure'
              ? `Core重启失败：${outcome.error.code}`
              : 'Core尚未恢复健康状态。';
          return false;
        }
        health = 'healthy';
        const projectToOpen = rememberedProject ?? (await recentProjectFallback(epoch));
        if (!isCurrent(epoch)) return false;
        if (projectToOpen) {
          const reopened = await options.bridge.project.openRecent(projectToOpen.projectId);
          if (!isCurrent(epoch)) return false;
          if (reopened.state !== 'success') {
            health = 'degraded';
            message =
              reopened.state === 'failure'
                ? `Core已重启，但项目重新打开失败：${reopened.error.code}`
                : 'Core已重启，但项目重新打开请求未完成。';
            return false;
          }
          rememberedProject = reopened.data;
        }
        message = projectToOpen
          ? 'Core与项目已恢复，可以重新保存当前窗口中的正文。'
          : 'Core已恢复；当前没有可自动重新打开的最近项目。';
        return true;
      } catch {
        if (!isCurrent(epoch)) return false;
        health = 'unreachable';
        message = 'Core重启或项目恢复失败。请先复制当前未保存正文。';
        return false;
      } finally {
        if (isCurrent(epoch)) {
          recovering = false;
          publish();
        }
        if (lifecycle === epoch) restartPromise = null;
      }
    })();
    return restartPromise;
  };

  const copyDraft = async (): Promise<boolean> => {
    if (disposed) return false;
    const epoch = lifecycle;
    const text = readDraftText();
    if (!text.trim()) {
      message = '当前窗口没有可复制的正文。';
      publish();
      return false;
    }
    try {
      await writeClipboardText(text);
      if (!isCurrent(epoch)) return false;
      message = '当前窗口正文已复制到剪贴板。';
      publish();
      return true;
    } catch {
      if (!isCurrent(epoch)) return false;
      message = '正文复制失败；请在编辑器内全选并手动复制。';
      publish();
      return false;
    }
  };

  const start = (): void => {
    if (disposed || started) return;
    started = true;
    surface.bind({
      restart: () => void restart(),
      copyDraft: () => void copyDraft(),
    });
    publish();
    void checkNow();
    timer = schedule(() => void checkNow(), pollIntervalMs);
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    lifecycle += 1;
    if (timer !== null) cancelSchedule(timer);
    timer = null;
    surface.dispose();
  };

  return {
    get health() {
      return health;
    },
    get rememberedProjectId() {
      return rememberedProject?.projectId ?? null;
    },
    start,
    checkNow,
    restart,
    copyDraft,
    dispose,
  };
}

function defaultDraftText(): string {
  const content = document.querySelector<HTMLElement>('[data-draft-content]');
  return content?.innerText ?? content?.textContent ?? '';
}

async function defaultClipboardWrite(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

function createDomCoreRecoverySurface(): CoreRecoverySurface {
  const dialog = document.createElement('dialog');
  dialog.dataset.coreRecovery = '';
  dialog.setAttribute('aria-labelledby', 'core-recovery-title');
  dialog.className = 'safety-banner core-recovery-surface';

  const title = document.createElement('h2');
  title.id = 'core-recovery-title';
  title.textContent = 'Core连接中断';
  const description = document.createElement('p');
  const actions = document.createElement('div');
  actions.className = 'feature-heading__actions';
  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'quiet-button';
  copyButton.textContent = '复制当前正文';
  const restartButton = document.createElement('button');
  restartButton.type = 'button';
  restartButton.className = 'primary-button';
  restartButton.textContent = '重启Core并恢复项目';
  actions.append(copyButton, restartButton);
  dialog.append(title, description, actions);
  document.body.append(dialog);

  let bound = false;
  let restartAction = (): void => undefined;
  let copyAction = (): void => undefined;
  const onRestart = (): void => restartAction();
  const onCopy = (): void => copyAction();

  return {
    bind(nextActions) {
      restartAction = nextActions.restart;
      copyAction = nextActions.copyDraft;
      if (bound) return;
      bound = true;
      restartButton.addEventListener('click', onRestart);
      copyButton.addEventListener('click', onCopy);
    },
    render(state) {
      description.textContent = state.message;
      restartButton.disabled = state.recovering;
      restartButton.textContent = state.hasRecoverableProject ? '重启Core并恢复项目' : '重启Core';
      copyButton.disabled = state.recovering;
      dialog.dataset.coreHealth = state.health;
      if (state.visible) {
        if (!dialog.open) {
          if (typeof dialog.show === 'function') dialog.show();
          else dialog.setAttribute('open', '');
        }
      } else if (dialog.open) {
        if (typeof dialog.close === 'function') dialog.close();
        else dialog.removeAttribute('open');
      }
    },
    dispose() {
      restartButton.removeEventListener('click', onRestart);
      copyButton.removeEventListener('click', onCopy);
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
      dialog.remove();
    },
  };
}
