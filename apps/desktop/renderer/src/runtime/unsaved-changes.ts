import { useCallback, useEffect, useRef, useState } from 'react';

interface UnsavedChangeEntry {
  readonly label: string;
}

const registeredChanges = new Map<symbol, UnsavedChangeEntry>();

function distinctLabels(labels: readonly string[]): readonly string[] {
  return [...new Set(labels.filter(Boolean))];
}

function confirmDiscardLabels(labels: readonly string[], action: string): boolean {
  const visible = distinctLabels(labels);
  if (visible.length === 0) return true;
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true;
  const summary =
    visible.length <= 3 ? visible.join('、') : `${visible.slice(0, 3).join('、')}等内容`;
  return window.confirm(`${summary}有未保存修改。${action}会放弃这些修改，是否继续？`);
}

export function registeredUnsavedChangeLabels(): readonly string[] {
  return distinctLabels([...registeredChanges.values()].map((entry) => entry.label));
}

export function confirmRegisteredUnsavedChanges(action: string): boolean {
  return confirmDiscardLabels(registeredUnsavedChangeLabels(), action);
}

export interface UnsavedChangesGuard {
  readonly dirty: boolean;
  readonly markDirty: () => void;
  readonly clearDirty: () => void;
  readonly confirmDiscard: (action: string) => boolean;
}

export function useUnsavedChangesGuard(label: string): UnsavedChangesGuard {
  const token = useRef(Symbol(label));
  const dirtyRef = useRef(false);
  const [dirty, setDirty] = useState(false);

  const markDirty = useCallback((): void => {
    dirtyRef.current = true;
    registeredChanges.set(token.current, { label });
    setDirty(true);
  }, [label]);

  const clearDirty = useCallback((): void => {
    dirtyRef.current = false;
    registeredChanges.delete(token.current);
    setDirty(false);
  }, []);

  const confirmDiscard = useCallback(
    (action: string): boolean => {
      if (!dirtyRef.current) return true;
      if (!confirmDiscardLabels([label], action)) return false;
      clearDirty();
      return true;
    },
    [clearDirty, label],
  );

  useEffect(() => {
    if (dirtyRef.current) registeredChanges.set(token.current, { label });
    return () => {
      registeredChanges.delete(token.current);
    };
  }, [label]);

  return { dirty, markDirty, clearDirty, confirmDiscard };
}
