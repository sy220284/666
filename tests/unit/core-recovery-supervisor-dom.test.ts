import { describe, expect, it, vi } from 'vitest';

import { createCoreRecoverySupervisor } from '../../apps/desktop/renderer/src/runtime/core-recovery-supervisor.js';

class FakeElement {
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, Set<() => void>>();
  className = '';
  id = '';
  textContent = '';
  innerText = '';
  type = '';
  disabled = false;
  open = false;
  removed = false;
  show: (() => void) | undefined;
  close: (() => void) | undefined;

  constructor(
    readonly tagName: string,
    dialogMethods = true,
  ) {
    if (dialogMethods && tagName === 'dialog') {
      this.show = () => {
        this.open = true;
      };
      this.close = () => {
        this.open = false;
      };
    }
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name === 'open') this.open = true;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
    if (name === 'open') this.open = false;
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  addEventListener(name: string, listener: () => void): void {
    const listeners = this.listeners.get(name) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(name, listeners);
  }

  removeEventListener(name: string, listener: () => void): void {
    this.listeners.get(name)?.delete(listener);
  }

  click(): void {
    for (const listener of this.listeners.get('click') ?? []) listener();
  }

  remove(): void {
    this.removed = true;
  }
}

function installDom(dialogMethods = true) {
  const created: FakeElement[] = [];
  const body = new FakeElement('body');
  const draft = new FakeElement('article');
  draft.innerText = '当前未保存正文';
  const writeText = vi.fn(async () => undefined);
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      body,
      createElement(tagName: string) {
        const element = new FakeElement(tagName, dialogMethods);
        created.push(element);
        return element;
      },
      querySelector(selector: string) {
        return selector === '[data-draft-content]' ? draft : null;
      },
    },
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { clipboard: { writeText } },
  });
  return { created, body, writeText };
}

const healthy = {
  status: 'healthy',
  pid: 123,
  restartCount: 0,
  lastErrorCode: null,
  diagnosticId: null,
} as const;
const degraded = {
  status: 'degraded',
  pid: 123,
  restartCount: 1,
  lastErrorCode: 'CORE_DEGRADED',
  diagnosticId: 'diagnostic-id',
} as const;

function success<T>(data: T) {
  return { state: 'success' as const, generation: 1, requestId: crypto.randomUUID(), data };
}

function createBridge() {
  const getCoreStatus = vi.fn(async () => success(degraded));
  const restartCore = vi.fn(async () => success({ accepted: true, status: healthy }));
  const getActive = vi.fn(async () => success(null));
  const listRecent = vi.fn(async () => success({ projects: [] }));
  const openRecent = vi.fn();
  return {
    getCoreStatus,
    restartCore,
    getActive,
    listRecent,
    openRecent,
    bridge: {
      app: { getCoreStatus, restartCore },
      project: { getActive, listRecent, openRecent },
    },
  };
}

describe('Core recovery default DOM surface integration', () => {
  it('renders, binds actions, copies draft text, restarts and disposes the real DOM surface', async () => {
    const dom = installDom();
    const bridge = createBridge();
    const cancelSchedule = vi.fn();
    const supervisor = createCoreRecoverySupervisor({
      bridge: bridge.bridge as never,
      pollIntervalMs: 250,
      schedule: vi.fn(() => 'timer'),
      cancelSchedule,
    });

    supervisor.start();
    await supervisor.checkNow();
    const dialog = dom.created.find((element) => element.tagName === 'dialog');
    const description = dom.created.find((element) => element.tagName === 'p');
    const buttons = dom.created.filter((element) => element.tagName === 'button');
    const copyButton = buttons[0];
    const restartButton = buttons[1];

    expect(dialog?.open).toBe(true);
    expect(dialog?.dataset.coreHealth).toBe('degraded');
    expect(description?.textContent).toContain('degraded');
    expect(copyButton?.textContent).toBe('复制当前正文');
    expect(restartButton?.textContent).toBe('重启Core');
    expect(copyButton?.listeners.get('click')?.size).toBe(1);
    expect(restartButton?.listeners.get('click')?.size).toBe(1);

    copyButton?.click();
    await vi.waitFor(() => {
      expect(dom.writeText).toHaveBeenCalledWith('当前未保存正文');
      expect(description?.textContent).toContain('已复制');
    });

    restartButton?.click();
    await vi.waitFor(() => {
      expect(bridge.restartCore).toHaveBeenCalledOnce();
      expect(bridge.listRecent).toHaveBeenCalledOnce();
      expect(dialog?.open).toBe(false);
      expect(description?.textContent).toContain('没有可自动重新打开');
    });

    supervisor.dispose();
    expect(cancelSchedule).toHaveBeenCalledWith('timer');
    expect(dialog?.removed).toBe(true);
    expect(copyButton?.listeners.get('click')?.size).toBe(0);
    expect(restartButton?.listeners.get('click')?.size).toBe(0);
  });

  it('falls back to the open attribute when dialog show/close methods are unavailable', async () => {
    const dom = installDom(false);
    const bridge = createBridge();
    const supervisor = createCoreRecoverySupervisor({
      bridge: bridge.bridge as never,
      pollIntervalMs: 250,
      schedule: vi.fn(() => 'timer'),
      cancelSchedule: vi.fn(),
    });
    supervisor.start();
    await supervisor.checkNow();
    const dialog = dom.created.find((element) => element.tagName === 'dialog');
    expect(dialog?.attributes.get('open')).toBe('');

    bridge.getCoreStatus.mockResolvedValueOnce(success(healthy));
    await supervisor.checkNow();
    expect(dialog?.attributes.has('open')).toBe(false);
    supervisor.dispose();
  });
});
