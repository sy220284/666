import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppSettings, AppearancePreferences } from '@worldforge/contracts';

import { createRendererApplicationController } from '../../apps/desktop/renderer/src/app/renderer-application-controller.js';
import { installGlobalRendererErrorBoundary } from '../../apps/desktop/renderer/src/runtime/global-error-boundary.js';

const originalGetComputedStyle = Object.getOwnPropertyDescriptor(globalThis, 'getComputedStyle');
const originalCustomEvent = Object.getOwnPropertyDescriptor(globalThis, 'CustomEvent');

function restoreProperty(key: PropertyKey, descriptor?: PropertyDescriptor): void {
  if (descriptor) Object.defineProperty(globalThis, key, descriptor);
  else Reflect.deleteProperty(globalThis, key);
}

afterEach(() => {
  restoreProperty('getComputedStyle', originalGetComputedStyle);
  restoreProperty('CustomEvent', originalCustomEvent);
});

describe('renderer DOM runtime boundaries', () => {
  it('applies presentation data, CSS variables and responsive placement', () => {
    const properties = new Map<string, string>();
    const dispatched: Event[] = [];
    const body = { dataset: {} as Record<string, string> };
    const documentElement = {
      style: {
        setProperty: (name: string, value: string) => properties.set(name, value),
      },
    };
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { body, documentElement },
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        innerWidth: 1_440,
        dispatchEvent: (event: Event) => {
          dispatched.push(event);
          return true;
        },
      },
    });
    Object.defineProperty(globalThis, 'getComputedStyle', {
      configurable: true,
      value: () => ({ getPropertyValue: () => '1.2' }),
    });
    Object.defineProperty(globalThis, 'CustomEvent', {
      configurable: true,
      value: class extends Event {
        constructor(type: string) {
          super(type);
        }
      },
    });

    const controller = createRendererApplicationController();
    controller.applyPresentation(
      {
        themeId: 'midnight',
        themeVariant: 'ink',
        reduceMotion: true,
        defaultMode: 'professional',
      } as AppSettings,
      {
        workspaceAlignment: 'center',
        uiScalePercent: 120,
        bodyFontSize: 18,
        contentWidth: 'wide',
      } as AppearancePreferences,
      'read-only',
    );

    expect(body.dataset).toMatchObject({
      theme: 'midnight',
      visualThemeVariant: 'ink',
      motionPreference: 'reduced',
      authorMode: 'professional',
      projectState: 'read-only',
      workspaceAlignment: 'center',
    });
    expect(properties.get('--ui-scale')).toBe('1.2');
    expect(properties.get('--body-font-size')).toBe('18px');
    expect(properties.get('--content-width')).toMatch(/px$/u);
    expect(body.dataset.layoutMode).toBeTruthy();
    expect(body.dataset.leftPanel).toBeTruthy();
    expect(dispatched.map((event) => event.type)).toContain('worldforge:presentation-changed');
  });

  it('shows one reusable safety banner for errors and removes listeners on cleanup', () => {
    const listeners = new Map<string, EventListener>();
    let notice: {
      id: string;
      className: string;
      textContent: string | null;
      role: string | null;
      setAttribute: (name: string, value: string) => void;
      remove: () => void;
    } | null = null;
    const windowValue = {
      addEventListener: vi.fn((type: string, listener: EventListener) =>
        listeners.set(type, listener),
      ),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    };
    const documentValue = {
      body: {
        prepend: (element: typeof notice) => {
          notice = element;
        },
      },
      getElementById: () => notice,
      createElement: () => ({
        id: '',
        className: '',
        textContent: null,
        role: null,
        setAttribute(name: string, value: string) {
          if (name === 'role') this.role = value;
        },
        remove() {
          notice = null;
        },
      }),
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: windowValue,
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: documentValue,
    });

    const cleanup = installGlobalRendererErrorBoundary();
    listeners.get('error')?.(new Event('error'));
    const firstNotice = notice;
    const preventDefault = vi.fn();
    listeners.get('unhandledrejection')?.({ preventDefault } as unknown as Event);

    expect(firstNotice).not.toBeNull();
    expect(notice).toBe(firstNotice);
    expect(notice?.role).toBe('alert');
    expect(notice?.textContent).toContain('诊断编号：diag_renderer_');
    expect(preventDefault).toHaveBeenCalledTimes(1);

    cleanup();
    expect(notice).toBeNull();
    expect(listeners.size).toBe(0);
  });
});
