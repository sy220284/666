import { createRequire } from 'node:module';

type HookEffect = () => void | (() => void);
type HookSetter = (next: unknown) => void;

export interface RendererHookController {
  states: unknown[];
  index: number;
  effects: HookEffect[];
}

interface HookDispatcher {
  useCallback<T>(callback: T): T;
  useEffect(effect: HookEffect): void;
  useMemo<T>(factory: () => T): T;
  useRef<T>(initialValue: T): { current: T };
  useState<T>(initialValue: T): [T, HookSetter];
}

interface ReactClientInternals {
  H: HookDispatcher | null;
}

const rendererPackageUrl = new URL(
  '../../apps/desktop/renderer/package.json',
  import.meta.url,
);
const rendererRequire = createRequire(rendererPackageUrl);
const rendererReact = rendererRequire('react') as Record<string, unknown>;
const clientInternalsKey = [
  '__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_',
  'USERS_THEY_CANNOT_UPGRADE',
].join('');
const clientInternals = rendererReact[clientInternalsKey] as ReactClientInternals;

export function installRendererHookDispatcher(
  controller: RendererHookController,
): () => void {
  const previous = clientInternals.H;
  clientInternals.H = {
    useCallback<T>(callback: T): T {
      return callback;
    },
    useEffect(effect: HookEffect): void {
      controller.effects.push(effect);
    },
    useMemo<T>(factory: () => T): T {
      return factory();
    },
    useRef<T>(initialValue: T): { current: T } {
      return { current: initialValue };
    },
    useState<T>(initialValue: T): [T, HookSetter] {
      let value = initialValue;
      if (controller.index < controller.states.length) {
        value = controller.states[controller.index] as T;
      }
      controller.index += 1;
      return [
        value,
        (next: unknown) => {
          if (typeof next === 'function') {
            (next as (current: T) => T)(value);
          }
        },
      ];
    },
  };
  return () => {
    clientInternals.H = previous;
  };
}
